import {
  buildAuthParams,
  buildGetReportParams,
  rpcBody,
  parseReportTable,
  mapDisplayColumns,
  extractSid,
  isPendingResult,
  isAuthError,
  CHAR_COLUMNS,
  authServiceUrl,
  reportServiceUrl
} from "./rpc.js";
import { loadState, saveStands } from "./storage.js";

const PAGE_SIZE = 50;

function parseBody(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function isRedirectStatus(status) {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

async function postJson(url, method, params, extraHeaders = {}) {
  return fetch(url, {
    method: "POST",
    credentials: "include",
    redirect: "manual",
    headers: {
      Accept: "application/json,text/javascript,*/*",
      "Content-Type": "application/json;charset=utf-8",
      ...extraHeaders
    },
    body: JSON.stringify(rpcBody(method, params))
  });
}

async function readResponse(res) {
  const text = await res.text();
  return { status: res.status, ok: res.ok, json: parseBody(text), text, url: res.url || "" };
}

export async function rpcFetch(url, method, params, extraHeaders = {}) {
  let res = await postJson(url, method, params, extraHeaders);

  if (isRedirectStatus(res.status)) {
    const location = res.headers.get("Location");
    if (location) {
      const next = new URL(location, url);
      if (!next.pathname.endsWith("/")) next.pathname += "/";
      res = await postJson(next.toString(), method, params, extraHeaders);
    }
  }

  if (res.status === 405 && extraHeaders["X-CalledMethod"]) {
    const { "X-CalledMethod": _drop, ...rest } = extraHeaders;
    res = await postJson(url, method, params, rest);
  }

  const parsed = await readResponse(res);
  parsed.requestUrl = url;
  if (!parsed.ok) {
    parsed.error = `HTTP ${parsed.status} POST ${url}${parsed.text ? `: ${parsed.text.slice(0, 240)}` : ""}`;
  }
  return parsed;
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

  const url = authServiceUrl(stand.host);
  const resp = await rpcFetch(url, "SAP.Authenticate", {
    data: buildAuthParams(stand.login, stand.password, stand.host, device)
  });

  if (resp.json?.error || !resp.ok) {
    stand.synced = false;
    stand.lastError = resp.json?.error?.message || resp.error || `HTTP ${resp.status}`;
    await saveStands(stands);
    return { ok: false, error: stand.lastError, stands, url };
  }

  const sid = extractSid(resp.json.result ?? resp.json);
  if (sid) await persistSidCookie(stand.host, sid);
  stand.cookies = await captureCookies(stand.host);
  stand.sid = sid || stand.cookies.find((c) => c.name === "sid")?.value || "";
  stand.synced = true;
  stand.lastError = "";
  stand.syncedAt = new Date().toISOString();
  await saveStands(stands);
  return { ok: true, stands, sid: stand.sid, url };
}

function reportHeaders(stand) {
  const headers = {};
  if (stand.sid) headers["X-SBISSessionID"] = stand.sid;
  return headers;
}

export async function getReport({ standId, filter, start, end, onStatus }) {
  const { stands } = await loadState();
  const stand = stands.find((s) => s.id === standId);
  if (!stand) throw new Error("Стенд не найден");
  if (!stand.synced) throw new Error("Сначала синхронизируйте стенд");

  const url = reportServiceUrl(stand.host);
  const startDate = new Date(start);
  const endDate = new Date(end);
  const allRows = [];
  let headers = [];
  let page = 0;
  let lastJson = null;

  while (page < 40) {
    onStatus?.(`Запрос отчёта, страница ${page + 1}…`);
    const params = buildGetReportParams(filter, startDate, endDate, page, PAGE_SIZE);
    let last = await rpcFetch(url, "CommonStatistic.GetReport", params, reportHeaders(stand));

    let attempt = 0;
    while (last.ok && !last.json?.error && isPendingResult(last.json) && attempt < 30) {
      attempt += 1;
      onStatus?.(`Выполняется запрос… (${attempt})`);
      await new Promise((r) => setTimeout(r, 1000));
      last = await rpcFetch(url, "CommonStatistic.GetReport", params, reportHeaders(stand));
    }

    lastJson = last.json;
    if (last.json?.error) {
      if (isAuthError(last.json)) {
        stand.synced = false;
        stand.lastError = last.json.error.message;
        await saveStands(stands);
      }
      return { ok: false, error: last.json.error.message || JSON.stringify(last.json.error), stands, url };
    }
    if (!last.ok) {
      return { ok: false, error: last.error || `HTTP ${last.status}`, url };
    }

    const parsed = parseReportTable(last.json.result ?? last.json);
    if (!headers.length) headers = parsed.headers;
    allRows.push(...parsed.rows);
    if (!parsed.hasMore || parsed.rows.length < PAGE_SIZE) break;
    page += 1;
  }

  const charIds = (filter.characteristics || []).map((c) => c.id);
  const table = mapDisplayColumns(headers, allRows, charIds.length ? charIds : CHAR_COLUMNS);
  return { ok: true, table, raw: lastJson, stands, url };
}
