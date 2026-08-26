import {
  buildAuthParams,
  buildGetReportParams,
  rpcBody,
  parseReportTable,
  mapDisplayColumns,
  extractSid,
  isPendingResult,
  isAuthError,
  CHAR_COLUMNS
} from "./rpc.js";
import { loadState, saveStands } from "./storage.js";

const PAGE_SIZE = 50;

export async function rpcFetch(host, path, method, params) {
  const url = `https://${host}${path}?srv=1`;
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json;charset=utf-8",
      Accept: "application/json,text/javascript,*/*",
      "X-CalledMethod": method
    },
    body: JSON.stringify(rpcBody(method, params))
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, ok: res.ok, json, text };
}

export async function captureCookies(host) {
  if (!chrome.cookies?.getAll) return [];
  const list = await chrome.cookies.getAll({ domain: host });
  return list.map((c) => ({ name: c.name, value: c.value, path: c.path, secure: c.secure }));
}

export async function persistSidCookie(host, sid) {
  if (!sid || !chrome.cookies?.set) return;
  await chrome.cookies.set({
    url: `https://${host}/`,
    name: "sid",
    value: sid,
    path: "/",
    secure: true,
    httpOnly: false
  });
}

export async function syncStand(standId) {
  const { stands, device } = await loadState();
  const stand = stands.find((s) => s.id === standId);
  if (!stand) throw new Error("Стенд не найден");
  if (!stand.login || !stand.password) throw new Error("Укажите логин и пароль");

  const resp = await rpcFetch(
    stand.host,
    "/auth/service/",
    "SAP.Authenticate",
    { data: buildAuthParams(stand.login, stand.password, stand.host, device) }
  );

  if (resp.json?.error || !resp.ok) {
    stand.synced = false;
    stand.lastError = resp.json?.error?.message || `HTTP ${resp.status}`;
    await saveStands(stands);
    return { ok: false, error: stand.lastError, stands };
  }

  const sid = extractSid(resp.json.result ?? resp.json);
  if (sid) await persistSidCookie(stand.host, sid);
  stand.cookies = await captureCookies(stand.host);
  stand.sid = sid || stand.cookies.find((c) => c.name === "sid")?.value || "";
  stand.synced = true;
  stand.lastError = "";
  stand.syncedAt = new Date().toISOString();
  await saveStands(stands);
  return { ok: true, stands, sid: stand.sid };
}

export async function getReport({ standId, filter, start, end, onStatus }) {
  const { stands } = await loadState();
  const stand = stands.find((s) => s.id === standId);
  if (!stand) throw new Error("Стенд не найден");
  if (!stand.synced) throw new Error("Сначала синхронизируйте стенд");

  const startDate = new Date(start);
  const endDate = new Date(end);
  const allRows = [];
  let headers = [];
  let page = 0;
  let lastJson = null;

  while (page < 40) {
    onStatus?.(`Запрос отчёта, страница ${page + 1}…`);
    let last = await rpcFetch(
      stand.host,
      "/stats-cloud-interface/service/",
      "CommonStatistic.GetReport",
      buildGetReportParams(filter, startDate, endDate, page, PAGE_SIZE)
    );

    let attempt = 0;
    while (last.ok && !last.json?.error && isPendingResult(last.json) && attempt < 30) {
      attempt += 1;
      onStatus?.(`Выполняется запрос… (${attempt})`);
      await new Promise((r) => setTimeout(r, 1000));
      last = await rpcFetch(
        stand.host,
        "/stats-cloud-interface/service/",
        "CommonStatistic.GetReport",
        buildGetReportParams(filter, startDate, endDate, page, PAGE_SIZE)
      );
    }

    lastJson = last.json;
    if (last.json?.error) {
      if (isAuthError(last.json)) {
        stand.synced = false;
        stand.lastError = last.json.error.message;
        await saveStands(stands);
      }
      return { ok: false, error: last.json.error.message || JSON.stringify(last.json.error), stands };
    }
    if (!last.ok) {
      return { ok: false, error: `HTTP ${last.status}: ${last.text.slice(0, 400)}` };
    }

    const parsed = parseReportTable(last.json.result ?? last.json);
    if (!headers.length) headers = parsed.headers;
    allRows.push(...parsed.rows);
    if (!parsed.hasMore || parsed.rows.length < PAGE_SIZE) break;
    page += 1;
  }

  const charIds = (filter.characteristics || []).map((c) => c.id);
  const table = mapDisplayColumns(headers, allRows, charIds.length ? charIds : CHAR_COLUMNS);
  return { ok: true, table, raw: lastJson, stands };
}
