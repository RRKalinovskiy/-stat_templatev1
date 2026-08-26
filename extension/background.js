import {
  loadState,
  saveStands,
  buildAuthParams,
  buildGetReportParams,
  rpcBody,
  parseReportTable,
  mapDisplayColumns
} from "./rpc.js";

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handle(msg)
    .then(sendResponse)
    .catch((err) => sendResponse({ ok: false, error: err.message || String(err) }));
  return true;
});

async function handle(msg) {
  if (msg.type === "syncStand") return syncStand(msg.standId);
  if (msg.type === "getReport") return getReport(msg);
  return { ok: false, error: "unknown message" };
}

async function rpcFetch(url, body) {
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json;charset=utf-8",
      Accept: "application/json"
    },
    body: JSON.stringify(body)
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

async function syncStand(standId) {
  const { stands, device } = await loadState();
  const stand = stands.find((s) => s.id === standId);
  if (!stand) throw new Error("Стенд не найден");
  if (!stand.login || !stand.password) throw new Error("Укажите логин и пароль");

  const url = `https://${stand.host}/auth/service/`;
  const body = rpcBody("SAP.Authenticate", { data: buildAuthParams(stand.login, stand.password, stand.host, device) });
  const resp = await rpcFetch(url, body);

  if (resp.json?.error) {
    stand.synced = false;
    stand.lastError = resp.json.error.message || JSON.stringify(resp.json.error);
    await saveStands(stands);
    return { ok: false, error: stand.lastError, stands };
  }
  if (!resp.ok) {
    stand.synced = false;
    stand.lastError = `HTTP ${resp.status}`;
    await saveStands(stands);
    return { ok: false, error: stand.lastError, stands };
  }

  stand.synced = true;
  stand.lastError = "";
  stand.syncedAt = new Date().toISOString();
  await saveStands(stands);
  return { ok: true, stands };
}

function isPending(json) {
  const r = json?.result;
  if (!r) return false;
  const status = r.status || r.Статус || r.state;
  if (typeof status === "string" && /wait|pending|process|выполн/i.test(status)) return true;
  if (r.d && typeof r.d === "object" && !Array.isArray(r.d) && r.d.Статус) return true;
  return false;
}

async function getReport({ standId, filter, start, end }) {
  const { stands } = await loadState();
  const stand = stands.find((s) => s.id === standId);
  if (!stand) throw new Error("Стенд не найден");
  if (!stand.synced) throw new Error("Сначала синхронизируйте стенд");

  const url = `https://${stand.host}/stats-cloud-interface/service/`;
  const params = buildGetReportParams(filter, new Date(start), new Date(end));
  const body = rpcBody("CommonStatistic.GetReport", params);

  let last = await rpcFetch(url, body);
  let attempt = 0;
  while (last.ok && !last.json?.error && isPending(last.json) && attempt < 20) {
    attempt += 1;
    await new Promise((r) => setTimeout(r, 1000));
    last = await rpcFetch(url, body);
  }

  if (last.json?.error) {
    return { ok: false, error: last.json.error.message || JSON.stringify(last.json.error), statusCode: last.status };
  }
  if (!last.ok) {
    return { ok: false, error: `HTTP ${last.status}: ${last.text.slice(0, 400)}`, statusCode: last.status };
  }

  const parsed = parseReportTable(last.json.result ?? last.json);
  const table = mapDisplayColumns(parsed.headers, parsed.rows);
  return {
    ok: true,
    table,
    raw: last.json
  };
}
