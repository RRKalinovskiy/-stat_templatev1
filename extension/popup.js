import { loadState, saveStands, saveFilters, saveLastReport, saveSelection } from "./storage.js";
import { DEFAULT_FILTER_JSON, methodDisplayName, reportFileName } from "./rpc.js";
import { syncStand, getReport } from "./api.js";
import { tableToPdfBlob } from "./pdf.js";

async function callBg(msg) {
  if (typeof chrome !== "undefined" && chrome.runtime?.id && chrome.runtime.sendMessage) {
    const res = await chrome.runtime.sendMessage(msg);
    if (res == null) throw new Error("Нет ответа от background — обновите расширение на chrome://extensions");
    return res;
  }
  if (msg.type === "syncStand") return syncStand(msg.standId);
  if (msg.type === "getReport") return getReport(msg);
  throw new Error("unknown message");
}

const pages = document.querySelectorAll(".page");
const tabs = document.querySelectorAll(".tab");
let state = { stands: [], filters: [], lastReport: null };
let lastTable = null;
let editingFilterId = null;

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((t) => t.classList.toggle("is-active", t === tab));
    pages.forEach((p) => p.classList.toggle("is-active", p.id === `page-${tab.dataset.page}`));
    if (tab.dataset.page === "report") renderReportSelects();
  });
});

function $(id) {
  return document.getElementById(id);
}

function showMsg(el, text, ok) {
  el.hidden = false;
  el.textContent = text;
  el.className = `msg ${ok ? "ok" : "err"}`;
}

function renderStands() {
  $("stands-list").innerHTML = "";
  for (const stand of state.stands) {
    const card = document.createElement("div");
    card.className = "stand-card";
    card.innerHTML = `
      <div class="stand-title">
        <span>${stand.title} <span class="host">${stand.host}</span></span>
        <span class="badge ${stand.synced ? "ok" : stand.lastError ? "err" : ""}">
          ${stand.synced ? "синхронизирован" : stand.lastError ? "ошибка" : "нет сессии"}
        </span>
      </div>
      <label>Логин
        <input type="text" data-field="login" value="${escapeAttr(stand.login)}" autocomplete="off" />
      </label>
      <label>Пароль
        <input type="password" data-field="password" value="${escapeAttr(stand.password)}" autocomplete="off" />
      </label>
      <button type="button" class="btn primary block" data-sync>Синхронизировать</button>
      ${stand.lastError ? `<p class="msg err">${escapeHtml(stand.lastError)}</p>` : ""}
    `;
    card.querySelectorAll("input").forEach((input) => {
      input.addEventListener("change", async () => {
        stand[input.dataset.field] = input.value;
        await saveStands(state.stands);
      });
    });
    card.querySelector("[data-sync]").addEventListener("click", async (e) => {
      stand.login = card.querySelector('[data-field="login"]').value;
      stand.password = card.querySelector('[data-field="password"]').value;
      await saveStands(state.stands);
      e.target.disabled = true;
      e.target.textContent = "Синхронизация…";
      try {
        const res = await callBg({ type: "syncStand", standId: stand.id });
        if (res.stands) state.stands = res.stands;
        if (!res.ok) showMsg(card.querySelector(".msg") || card.appendChild(Object.assign(document.createElement("p"), { className: "msg err" })), res.error, false);
      } catch (err) {
        stand.synced = false;
        stand.lastError = err.message || String(err);
        await saveStands(state.stands);
      }
      e.target.disabled = false;
      e.target.textContent = "Синхронизировать";
      renderStands();
    });
    $("stands-list").appendChild(card);
  }
}

function renderFilters() {
  $("filters-list").innerHTML = "";
  for (const f of state.filters) {
    const row = document.createElement("div");
    row.className = "filter-item";
    row.innerHTML = `
      <div class="name">${escapeHtml(f.name)}</div>
      <div class="actions">
        <button type="button" class="btn ghost small" data-edit>Изменить</button>
        <button type="button" class="btn ghost small" data-del>Удалить</button>
      </div>
    `;
    row.querySelector("[data-edit]").addEventListener("click", () => {
      editingFilterId = f.id;
      $("filter-name").value = f.name;
      $("filter-json").value = JSON.stringify(f.json, null, 2);
    });
    row.querySelector("[data-del]").addEventListener("click", async () => {
      state.filters = state.filters.filter((x) => x.id !== f.id);
      await saveFilters(state.filters);
      renderFilters();
      renderReportSelects();
    });
    $("filters-list").appendChild(row);
  }
}

function renderReportSelects() {
  const standSel = $("report-stand");
  const filterSel = $("report-filter");
  const standId = state.selectedStandId || standSel.value;
  const filterId = state.selectedFilterId || filterSel.value;
  standSel.innerHTML = state.stands
    .map((s) => `<option value="${s.id}">${s.title} (${s.host})${s.synced ? "" : " — нет сессии"}</option>`)
    .join("");
  filterSel.innerHTML = state.filters.length
    ? state.filters.map((f) => `<option value="${f.id}">${escapeHtml(f.name)}</option>`).join("")
    : `<option value="">Нет сохранённых фильтров</option>`;
  if (state.stands.some((s) => s.id === standId)) standSel.value = standId;
  if (state.filters.some((f) => f.id === filterId)) filterSel.value = filterId;
  const download = $("btn-download");
  if (lastTable?.rows?.length) download.hidden = false;
}

function defaultRange() {
  const end = new Date();
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  const toLocal = (d) => {
    const off = d.getTimezoneOffset();
    const local = new Date(d.getTime() - off * 60000);
    return local.toISOString().slice(0, 16);
  };
  $("report-start").value = toLocal(start);
  $("report-end").value = toLocal(end);
}

$("filter-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  let json;
  try {
    json = JSON.parse($("filter-json").value);
  } catch {
    showMsg($("filter-msg"), "Некорректный JSON фильтра", false);
    return;
  }
  const name = $("filter-name").value.trim();
  const payload = structuredClone(json);
  if (editingFilterId) {
    const f = state.filters.find((x) => x.id === editingFilterId);
    if (f) {
      f.name = name;
      f.json = payload;
    }
  } else {
    const created = { id: crypto.randomUUID(), name, json: payload };
    state.filters.push(created);
    editingFilterId = created.id;
    state.selectedFilterId = created.id;
    await saveSelection({ selectedFilterId: created.id });
  }
  await saveFilters(state.filters);
  showMsg($("filter-msg"), "Фильтр сохранён", true);
  renderFilters();
  renderReportSelects();
});

$("filter-reset").addEventListener("click", () => {
  editingFilterId = null;
  $("filter-name").value = "";
  $("filter-json").value = JSON.stringify(DEFAULT_FILTER_JSON, null, 2);
  $("filter-msg").hidden = true;
});

$("btn-get-report").addEventListener("click", async () => {
  const status = $("report-status");
  const download = $("btn-download");
  download.hidden = true;
  lastTable = null;
  const filter = state.filters.find((f) => f.id === $("report-filter").value);
  if (!filter) {
    status.className = "status err";
    status.textContent = "Сохраните фильтр на вкладке «Фильтры»";
    return;
  }
  const start = new Date($("report-start").value);
  const end = new Date($("report-end").value);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    status.className = "status err";
    status.textContent = "Укажите корректные дату и время";
    return;
  }
  status.className = "status busy";
  status.textContent = `Запрос «${filter.name}»…`;
  $("btn-get-report").disabled = true;
  try {
    const res = await callBg({
      type: "getReport",
      standId: $("report-stand").value,
      filterId: filter.id,
      start: start.toISOString(),
      end: end.toISOString()
    });
    if (res.stands) state.stands = res.stands;
    if (!res.ok) {
      status.className = "status err";
      status.textContent = res.error || "Ошибка запроса";
      return;
    }
    lastTable = res.table;
    await saveLastReport({
      table: lastTable,
      at: new Date().toISOString(),
      filterName: filter.name,
      standId: $("report-stand").value
    });
    status.className = "status ok";
    status.textContent = `Готово: ${lastTable.rows.length} строк. Можно скачать PDF.`;
    download.hidden = false;
  } catch (err) {
    status.className = "status err";
    status.textContent = err.message || String(err);
  } finally {
    $("btn-get-report").disabled = false;
  }
});

$("btn-download").addEventListener("click", async () => {
  if (!lastTable) return;
  const rows = lastTable.rows.map((row) => {
    const next = [...row];
    if (next[0]) next[0] = methodDisplayName(next[0]);
    return next;
  });
  const blob = await tableToPdfBlob("Отчёт по вызовам БЛ", lastTable.headers, rows);
  const url = URL.createObjectURL(blob);
  const stand =
    state.stands.find((s) => s.id === $("report-stand").value) ||
    state.stands.find((s) => s.id === state.lastReport?.standId);
  const filterName =
    state.filters.find((f) => f.id === $("report-filter").value)?.name || state.lastReport?.filterName;
  const filename = reportFileName({ filterName, stand, date: new Date() });
  try {
    if (typeof chrome !== "undefined" && chrome.downloads?.download) {
      await chrome.downloads.download({ url, filename, saveAs: true });
    } else {
      throw new Error("no downloads api");
    }
  } catch {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escapeAttr(s) {
  return escapeHtml(s ?? "");
}

async function init() {
  state = await loadState();
  lastTable = state.lastReport?.table || null;
  $("filter-json").value = JSON.stringify(DEFAULT_FILTER_JSON, null, 2);
  $("filter-name").value = "";
  editingFilterId = null;
  renderStands();
  renderFilters();
  renderReportSelects();
  defaultRange();
  $("report-stand").addEventListener("change", () => {
    state.selectedStandId = $("report-stand").value;
    saveSelection({ selectedStandId: state.selectedStandId });
  });
  $("report-filter").addEventListener("change", () => {
    state.selectedFilterId = $("report-filter").value;
    saveSelection({ selectedFilterId: state.selectedFilterId });
  });
  if (lastTable) {
    $("report-status").className = "status ok";
    $("report-status").textContent = `Последний отчёт: ${lastTable.rows.length} строк`;
    $("btn-download").hidden = false;
  }
}

init();
