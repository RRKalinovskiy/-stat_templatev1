import { loadState, saveStands, saveFilters, DEFAULT_FILTER_JSON } from "./rpc.js";
import { tableToPdfBlob } from "./pdf.js";

const pages = document.querySelectorAll(".page");
const tabs = document.querySelectorAll(".tab");
let state = { stands: [], filters: [] };
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
        <span>${stand.title} · ${stand.host}</span>
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
      const res = await chrome.runtime.sendMessage({ type: "syncStand", standId: stand.id });
      if (res.stands) state.stands = res.stands;
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
    });
    $("filters-list").appendChild(row);
  }
}

function renderReportSelects() {
  const standSel = $("report-stand");
  const filterSel = $("report-filter");
  standSel.innerHTML = state.stands
    .map((s) => `<option value="${s.id}">${s.title} (${s.host})${s.synced ? "" : " — нет сессии"}</option>`)
    .join("");
  filterSel.innerHTML = state.filters.length
    ? state.filters.map((f) => `<option value="${f.id}">${escapeHtml(f.name)}</option>`).join("")
    : `<option value="">Нет сохранённых фильтров</option>`;
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
  if (editingFilterId) {
    const f = state.filters.find((x) => x.id === editingFilterId);
    if (f) {
      f.name = name;
      f.json = json;
    }
  } else {
    state.filters.push({ id: crypto.randomUUID(), name, json });
  }
  await saveFilters(state.filters);
  editingFilterId = null;
  showMsg($("filter-msg"), "Фильтр сохранён", true);
  renderFilters();
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
  status.className = "status busy";
  status.textContent = "Выполняется CommonStatistic.GetReport…";
  $("btn-get-report").disabled = true;
  const res = await chrome.runtime.sendMessage({
    type: "getReport",
    standId: $("report-stand").value,
    filter: filter.json,
    start: start.toISOString(),
    end: end.toISOString()
  });
  $("btn-get-report").disabled = false;
  if (!res?.ok) {
    status.className = "status err";
    status.textContent = res?.error || "Ошибка запроса";
    return;
  }
  lastTable = res.table;
  status.className = "status ok";
  status.textContent = `Готово: ${lastTable.rows.length} строк. Можно скачать PDF.`;
  download.hidden = false;
});

$("btn-download").addEventListener("click", async () => {
  if (!lastTable) return;
  const blob = await tableToPdfBlob("Отчёт по вызовам БЛ", lastTable.headers, lastTable.rows);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `stats-report-${Date.now()}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escapeAttr(s) {
  return escapeHtml(s ?? "");
}

async function init() {
  state = await loadState();
  if (!state.filters.length) {
    $("filter-json").value = JSON.stringify(DEFAULT_FILTER_JSON, null, 2);
  } else {
    $("filter-json").value = JSON.stringify(state.filters[0].json, null, 2);
    $("filter-name").value = state.filters[0].name;
    editingFilterId = state.filters[0].id;
  }
  renderStands();
  renderFilters();
  renderReportSelects();
  defaultRange();
}

init();
