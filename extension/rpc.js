const DEFAULT_STANDS = [
  { id: "fix", host: "fix-cloud.sbis.ru", title: "FIX", login: "", password: "", synced: false, lastError: "" },
  { id: "test", host: "test-cloud.sbis.ru", title: "TEST", login: "", password: "", synced: false, lastError: "" },
  { id: "pre-test", host: "pre-test-cloud.sbis.ru", title: "PRE-TEST", login: "", password: "", synced: false, lastError: "" }
];

export const EMPTY_FILTER_TEMPLATE = {
  TZ: 3,
  characteristics: [],
  cube: "",
  dimensions: [],
  idParent: null,
  version: "1",
  comparePeriodEnabled: false,
  period: [],
  displayType: "Таблица"
};

const TECHNICAL_HEADERS = /^(idParent|dimension|name\d+|label)$/i;
const HEADER_LABELS = {
  id: "Метод",
  Метод_Метод: "Метод",
  Метод_Ответственный: "Ответственный",
  ОтветственныйЗаМетод: "Ответственный"
};

export function defaultStands() {
  return structuredClone(DEFAULT_STANDS);
}

export function standHosts() {
  return DEFAULT_STANDS.map((s) => s.host);
}

export function mergeStands(saved) {
  const defaults = defaultStands();
  const list = Array.isArray(saved) ? saved : [];
  const merged = defaults.map((d) => {
    const hit = list.find((s) => s.id === d.id || s.host === d.host);
    if (!hit) return d;
    return {
      ...d,
      login: hit.login ?? "",
      password: hit.password ?? "",
      synced: !!hit.synced,
      lastError: hit.lastError ?? "",
      sid: hit.sid,
      cookies: hit.cookies,
      syncedAt: hit.syncedAt
    };
  });
  for (const s of list) {
    if (s.id === "pre" || s.host === "pre-cloud.sbis.ru") continue;
    if (!merged.some((d) => d.id === s.id || d.host === s.host)) merged.push(s);
  }
  return merged;
}

export function toMoscowParts(date) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    y: parts.year,
    m: parts.month,
    d: parts.day,
    h: parts.hour,
    min: parts.minute,
    s: parts.second
  };
}

export function formatRpcDateTime(date) {
  const p = toMoscowParts(date);
  return `${p.y}-${p.m}-${p.d} ${p.h}:${p.min}:${p.s}+03`;
}

export function parseMoscowDateTimeLocal(value) {
  const m = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] || "00"}+03:00`);
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function toDateTimeLocalMoscow(date) {
  if (!date || Number.isNaN(date.getTime())) return "";
  const p = toMoscowParts(date);
  return `${p.y}-${p.m}-${p.d}T${p.h}:${p.min}`;
}

export function periodFromMode(mode, now = new Date()) {
  if (mode === "24" || mode === "72") {
    const hours = mode === "24" ? 24 : 72;
    return { start: new Date(now.getTime() - hours * 3600 * 1000), end: now };
  }
  return null;
}

export function parsePeriodValue(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const s = String(value);
  const iso = s.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)/);
  if (iso) {
    const raw = iso[1];
    const d = /Z|[+-]\d{2}:\d{2}$/.test(raw) ? new Date(raw) : parseMoscowDateTimeLocal(raw.replace(" ", "T").slice(0, 16));
    return d && !Number.isNaN(d.getTime()) ? d : null;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function periodFromFilter(filter) {
  const f = normalizeFilterObject(filter);
  const p = f?.period;
  const pick = (start, end) => {
    const a = parsePeriodValue(start);
    const b = parsePeriodValue(end);
    if (!a || !b) return null;
    return { start: a, end: b };
  };
  if (Array.isArray(p) && p.length) {
    const row = p[0];
    if (Array.isArray(row)) return pick(row[0], row[1]);
    if (row && typeof row === "object") return pick(row.start ?? row.Начало, row.end ?? row.Конец);
  }
  if (p && typeof p === "object" && !Array.isArray(p)) return pick(p.start ?? p.Начало, p.end ?? p.Конец);
  return null;
}

function looksLikeDateValue(value) {
  const s = String(value ?? "");
  return /^\d{4}-\d{2}-\d{2}/.test(s) || /^\d{2}\.\d{2}\.\d{2,4}/.test(s);
}

export function formatRuDate(date) {
  const p = toMoscowParts(date);
  return `${p.d}.${p.m}.${p.y.slice(2)}`;
}

export function formatRuTime(date) {
  const p = toMoscowParts(date);
  return `${p.h}:${p.min}`;
}

export function standShortName(stand) {
  if (!stand) return "stand";
  if (typeof stand === "string") {
    const s = stand.toLowerCase();
    if (s.includes(".")) return s.replace(/-cloud\.sbis\.ru.*$/, "").replace(/\.sbis\.ru.*$/, "");
    return s;
  }
  if (stand.id) return String(stand.id).toLowerCase();
  return standShortName(stand.host || stand.title || "stand");
}

export function sanitizeFileName(name) {
  return String(name || "Отчёт")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "Отчёт";
}

export function reportFileName({ filterName, stand, date = new Date() }) {
  const p = toMoscowParts(date);
  const stamp = `${p.d}-${p.m}-${p.y.slice(2)}`;
  return `${sanitizeFileName(filterName)} (${standShortName(stand)}) ${stamp}.pdf`;
}

function rec(f, d, s) {
  return { d, s, _type: "record", f };
}

function rs(f, d, s) {
  return { d, s, _type: "recordset", f };
}

export function normalizeFilterObject(raw) {
  let json = raw;
  if (typeof json === "string") {
    try {
      json = JSON.parse(json);
    } catch {
      return null;
    }
  }
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  if (!json.characteristics && json.filter && typeof json.filter === "object" && !Array.isArray(json.filter)) {
    json = json.filter;
  }
  return json;
}

export function applyPeriod(filter, start, end) {
  const base = normalizeFilterObject(filter);
  if (!base) {
    throw new Error("Фильтр не задан или это не JSON-объект");
  }
  const next = JSON.parse(JSON.stringify(base));
  next.period = [{ start: start.toISOString(), end: end.toISOString() }];
  next.idParent = null;
  if (Array.isArray(next.dimensions)) {
    next.dimensions = next.dimensions.map((d) => {
      if (!(d.isTimeDim === true || d.id === "time")) return d;
      const copy = { ...d };
      if (Array.isArray(copy.values) && copy.values.some((v) => looksLikeDateValue(v))) copy.values = null;
      if (Array.isArray(copy.valuesCompare) && copy.valuesCompare.some((v) => looksLikeDateValue(v))) {
        copy.valuesCompare = null;
      }
      return copy;
    });
  }
  return next;
}

export function buildNavigation(page, pageSize = 50) {
  return rec(0, [true, pageSize, page], [
    { t: "Логическое", n: "ЕстьЕще" },
    { t: "Число целое", n: "РазмерСтраницы" },
    { t: "Число целое", n: "Страница" }
  ]);
}

function stringifyDimValue(v) {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return stringifyDimValue(v[0]);
  if (typeof v === "object") {
    return stringifyDimValue(v.id ?? v.name ?? v.value ?? v.Название ?? v.d);
  }
  return String(v);
}

export function normalizeDimValues(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const out = values.map(stringifyDimValue).filter((v) => v !== "");
  return out.length ? out : null;
}

function isTimeDimension(d) {
  return d.isTimeDim === true || d.id === "time";
}

function verticalTimeRecord(d) {
  const step = d?.timeStep || "day";
  const mode = d?.mode || "all_days";
  const start = d?.timePeriod?.start || "00:00";
  const end = d?.timePeriod?.end || "23:59";
  return rec(8, [[String(step)], String(mode), [String(start), String(end)], 1], [
    { t: { n: "Массив", t: "Строка" }, n: "Filter" },
    { t: "Строка", n: "FilterDays" },
    { t: { n: "Массив", t: "Строка" }, n: "FilterHours" },
    { t: "Число целое", n: "Position" }
  ]);
}

function verticalAggRecord(d) {
  const top = typeof d.top === "number" ? d.top : 100;
  return rec(8, [1, top], [
    { t: "Число целое", n: "Position" },
    { t: "Число целое", n: "Top" }
  ]);
}

function verticalFilterRecord(d) {
  const values = normalizeDimValues(d.values);
  const fields = [];
  const schema = [];
  if (values) {
    fields.push(values);
    schema.push({ t: { n: "Массив", t: "Строка" }, n: "Filter" });
  }
  if (d.excluded === true) {
    fields.push(true);
    schema.push({ t: "Логическое", n: "Excluded" });
  }
  return rec(9, fields, schema);
}

function verticalDimRecord(d, emptyRec) {
  if (!d) return emptyRec;
  if (isTimeDimension(d)) {
    if (d.isAggregated === true) return verticalTimeRecord(d);
    return emptyRec;
  }
  const values = normalizeDimValues(d.values);
  if (values || d.excluded === true) return verticalFilterRecord(d);
  if (d.isAggregated === true) return verticalAggRecord(d);
  return emptyRec;
}

export function buildGetReportParams(filter, start, end, page = 0, pageSize = 50) {
  const f = applyPeriod(filter, start, end);
  const startDate = new Date(f.period[0].start);
  const endDate = new Date(f.period[0].end);
  const tz = f.TZ ?? 3;
  const dimensions = f.dimensions || [];

  const charS = [
    { t: "Строка", n: "id" },
    { t: "Строка", n: "order" },
    { t: "JSON-объект", n: "range" }
  ];
  const charD = (f.characteristics || []).map((c) => [c.id, c.order ?? null, c.range || {}]);

  const dimS = [
    { t: "Строка", n: "id" },
    { t: "Логическое", n: "isTimeDim" },
    { t: "Логическое", n: "isAggregated" },
    { t: { n: "Массив", t: "Строка" }, n: "values" },
    { t: { n: "Массив", t: "Строка" }, n: "valuesCompare" },
    { t: "Логическое", n: "excluded" },
    { t: "Логическое", n: "excludedCompare" },
    { t: "Число целое", n: "top" },
    { t: "Строка", n: "mode" },
    { t: "JSON-объект", n: "timePeriod" },
    { t: "Строка", n: "timeStep" }
  ];
  const dimD = dimensions.map((d) => [
    d.id,
    isTimeDimension(d) ? true : d.isTimeDim ?? null,
    d.isAggregated ?? false,
    normalizeDimValues(d.values),
    normalizeDimValues(d.valuesCompare),
    d.excluded === true ? true : d.excluded ?? null,
    d.excludedCompare ?? null,
    d.top ?? null,
    d.mode ?? null,
    d.timePeriod ?? null,
    d.timeStep ?? null
  ]);

  const periodRs = rs(
    4,
    [[formatRpcDateTime(startDate), formatRpcDateTime(endDate)]],
    [
      { t: "Дата и время", n: "start" },
      { t: "Дата и время", n: "end" }
    ]
  );

  const emptyRec = rec(7, [], []);
  const verticalIds = dimensions.map((d) => d.id).filter(Boolean);
  const dimById = Object.fromEntries(dimensions.map((d) => [d.id, d]));
  const vertical = rec(
    6,
    verticalIds.map((id) => verticalDimRecord(dimById[id], emptyRec)),
    verticalIds.map((id) => ({ t: "Запись", n: id }))
  );

  const charsAnalysis = rec(
    10,
    (f.characteristics || []).map((c) => {
      const range = c.range || {};
      const hasRange = range.start != null || range.end != null;
      if (hasRange) {
        return rec(12, [range.end ?? null, range.start ?? null, c.order === "desc"], [
          { t: "Число целое", n: "Higher" },
          { t: "Число целое", n: "Lower" },
          { t: "Логическое", n: "Top" }
        ]);
      }
      if (c.order === "desc") {
        return rec(11, [true], [{ t: "Логическое", n: "Top" }]);
      }
      return emptyRec;
    }),
    (f.characteristics || []).map((c) => ({ t: "Запись", n: c.id }))
  );

  const uiFilter = rec(
    1,
    [
      tz,
      rs(2, charD, charS),
      !!f.comparePeriodEnabled,
      f.cube ?? "",
      rs(3, dimD, dimS),
      f.displayType ?? "Таблица",
      periodRs,
      String(f.version ?? "1")
    ],
    [
      { t: "Число целое", n: "TZ" },
      { t: "Выборка", n: "characteristics" },
      { t: "Логическое", n: "comparePeriodEnabled" },
      { t: "Строка", n: "cube" },
      { t: "Выборка", n: "dimensions" },
      { t: "Строка", n: "displayType" },
      { t: "Выборка", n: "period" },
      { t: "Строка", n: "version" }
    ]
  );

  const legacyFilter = rec(
    5,
    [
      tz,
      1,
      vertical,
      formatRuTime(endDate),
      formatRuTime(startDate),
      formatRuDate(endDate),
      formatRuDate(startDate),
      f.cube ?? "",
      f.displayType ?? "Таблица",
      charsAnalysis
    ],
    [
      { t: "Число целое", n: "TZ" },
      { t: "Число целое", n: "Версия" },
      { t: "Запись", n: "Вертикальная детализация" },
      { t: "Строка", n: "ВремяКонца" },
      { t: "Строка", n: "ВремяНачала" },
      { t: "Строка", n: "ДатаКонца" },
      { t: "Строка", n: "ДатаНачала" },
      { t: "Строка", n: "Куб" },
      { t: "Строка", n: "Отображение" },
      { t: "Запись", n: "Характеристики для анализа" }
    ]
  );

  return {
    Фильтр: rec(0, [uiFilter, legacyFilter], [
      { t: "Запись", n: "filter" },
      { t: "Запись", n: "Фильтр" }
    ]),
    Сортировка: null,
    Навигация: buildNavigation(page, pageSize),
    ДопПоля: []
  };
}

export function buildAuthParams(login, password, host, device) {
  const url = `https://${host}/auth/?ret=%2F`;
  const fingerprint = {
    Language: "ru-RU",
    ScreenResolution: "1920;1080",
    TimeZone: "Europe/Moscow",
    NavigatorPlatform: "Win32",
    MaxTouchPoints: 0,
    Temp: "UserAgentData",
    DeviceModel: "windows pc",
    Platform: "Windows",
    OsVersion: "Windows: 10.0.0"
  };
  const deviceIds = {
    "1.0": device.machineId,
    "1.4": device.newMachineId,
    "1.5": device.newMachineId,
    "1.6": `1-6-${device.newMachineId}`,
    "2.0": `2-0-${device.newMachineId}`,
    OperatingSystem: device.os,
    ReadTime: String(Date.now())
  };
  return rec(0, [
    login,
    password,
    false,
    true,
    device.machineName,
    device.os,
    device.machineId,
    deviceIds,
    device.newMachineId,
    false,
    null,
    url,
    false,
    { mobile: false, model: "", platform: "Windows", platformVersion: "10.0.0", fingerPrintData: fingerprint },
    fingerprint
  ], [
    { t: "Строка", n: "login" },
    { t: "Строка", n: "password" },
    { t: "Логическое", n: "stranger" },
    { t: "Логическое", n: "from_browser" },
    { t: "Строка", n: "machine_name" },
    { t: "Строка", n: "os" },
    { t: "Строка", n: "machine_id" },
    { t: "JSON-объект", n: "device_ids" },
    { t: "Строка", n: "new_machine_id" },
    { t: "Логическое", n: "license_extended" },
    { t: "Строка", n: "license_session_id" },
    { t: "Строка", n: "full_url" },
    { t: "Логическое", n: "get_last_url" },
    { t: "JSON-объект", n: "browser_data" },
    { t: "JSON-объект", n: "device_fingerprint_data" }
  ]);
}

export const AUTH_SERVICE_PATH = "/auth/service/";
export const REPORT_SERVICE_PATH = "/stats-cloud-interface/service/";

export function standServiceUrl(host, path) {
  const pathname = path.startsWith("/") ? path : `/${path}`;
  const withSlash = pathname.endsWith("/") ? pathname : `${pathname}/`;
  return `https://${host}${withSlash}`;
}

export function authServiceUrl(host) {
  return standServiceUrl(host, AUTH_SERVICE_PATH);
}

export function reportServiceUrl(host) {
  return standServiceUrl(host, REPORT_SERVICE_PATH);
}

export function rpcCallUrl(serviceUrl, { id = 1, protocol = 7, srv = false } = {}) {
  const u = new URL(serviceUrl);
  u.searchParams.set("id", String(id));
  u.searchParams.set("protocol", String(protocol));
  if (srv) u.searchParams.set("srv", "1");
  return u.toString();
}

export function authCallUrls(host) {
  const base = authServiceUrl(host);
  return [rpcCallUrl(base), rpcCallUrl(base, { srv: true })];
}

export function reportCallUrls(host) {
  const base = reportServiceUrl(host);
  return [rpcCallUrl(base), rpcCallUrl(base, { srv: true })];
}

export function rpcBody(method, params, id = 1) {
  return {
    jsonrpc: "2.0",
    protocol: 7,
    method,
    params,
    id
  };
}

export function formatNumber(value) {
  if (value == null || value === "") return "";
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  const decimals = Number.isInteger(n) ? 0 : 2;
  const [int, frac] = n.toFixed(decimals).split(".");
  const withSpaces = int.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return frac ? `${withSpaces}.${frac}` : withSpaces;
}

export function parseReportTable(result) {
  const found = findRecordset(result);
  if (!found) return { headers: [], rows: [], hasMore: false };
  const headers = (found.s || []).map((c) => c.n || c.id || "");
  const rows = (found.d || []).map((row) => {
    if (Array.isArray(row)) return row.map(flattenCell);
    if (row && Array.isArray(row.d)) return row.d.map(flattenCell);
    return headers.map((h) => flattenCell(row?.[h]));
  });
  return { headers, rows, hasMore: detectHasMore(result, rows.length) };
}

export function detectHasMore(result, rowCount) {
  const flag = findNamedValue(result, "ЕстьЕще");
  if (typeof flag === "boolean") return flag;
  if (rowCount >= 50) return true;
  return false;
}

function findNamedValue(node, name, depth = 0) {
  if (!node || depth > 10) return undefined;
  if (node.s && node.d && Array.isArray(node.s)) {
    const idx = node.s.findIndex((c) => c.n === name);
    if (idx >= 0 && Array.isArray(node.d) && !Array.isArray(node.d[0])) return node.d[idx];
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      const v = findNamedValue(item, name, depth + 1);
      if (v !== undefined) return v;
    }
  } else if (typeof node === "object") {
    for (const v of Object.values(node)) {
      if (v && typeof v === "object") {
        const found = findNamedValue(v, name, depth + 1);
        if (found !== undefined) return found;
      }
    }
  }
  return undefined;
}

function scoreRecordset(node) {
  const names = (node.s || []).map((c) => c.n || c.id || "");
  let score = (node.d || []).length + names.length;
  if (names.some((n) => /Количество|продолжительность/i.test(n))) score += 10000;
  if (names.includes("id") || names.includes("Метод_Метод")) score += 50;
  return score;
}

function collectRecordsets(node, depth, out) {
  if (!node || depth > 8) return;
  if (node._type === "recordset" && Array.isArray(node.d) && node.s) out.push(node);
  else if (Array.isArray(node.d) && Array.isArray(node.s) && node.d.length && Array.isArray(node.d[0])) out.push(node);
  if (Array.isArray(node)) {
    for (const item of node) collectRecordsets(item, depth + 1, out);
  } else if (typeof node === "object") {
    for (const v of Object.values(node)) {
      if (v && typeof v === "object") collectRecordsets(v, depth + 1, out);
    }
  }
}

function findRecordset(node) {
  const found = [];
  collectRecordsets(node, 0, found);
  if (!found.length) return null;
  found.sort((a, b) => scoreRecordset(b) - scoreRecordset(a));
  return found[0];
}

export function extractSid(result) {
  const direct = findNamedValue(result, "sid") ?? findNamedValue(result, "Сид") ?? findNamedValue(result, "SID");
  if (typeof direct === "string" && direct) return direct;
  if (typeof result === "string") return result;
  return null;
}

export function methodDisplayName(rawMethod, rawOwner = "") {
  const source = String(rawMethod ?? "");
  const [methodPart, ownerFromKey] = source.split("$$");
  const method = (methodPart || source).trim();
  const owner = String(rawOwner || ownerFromKey || "")
    .replace(/^\(+/, "")
    .replace(/\)+$/, "")
    .trim();
  if (owner && !method.includes(`(${owner})`)) return `${method} (${owner})`;
  return method;
}

function flattenCell(value) {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    const parts = value.map(flattenCell).filter((v) => v !== "" && v !== false);
    if (parts.length === 2 && typeof parts[0] === "string" && /^[A-Za-zА-Яа-я_]+$/.test(parts[0])) {
      return parts[1];
    }
    return parts[parts.length - 1] ?? "";
  }
  if (typeof value === "object") {
    if (Array.isArray(value.d)) return flattenCell(value.d);
    return flattenCell(value.id ?? value.name ?? value.n ?? value.value);
  }
  return String(value);
}

function isTechnicalHeader(name) {
  const h = String(name || "");
  return TECHNICAL_HEADERS.test(h) || /^idParent[@$]?$/.test(h);
}

function looksLikeDateCell(value) {
  return /^\d{4}-\d{2}-\d{2}/.test(String(value ?? ""));
}

function headerLabel(name, rows, index) {
  if (name === "id") {
    const sample = (rows || []).map((r) => r[index]).filter((v) => v !== "" && v != null).slice(0, 8);
    if (sample.length && sample.every(looksLikeDateCell)) return "Дата";
    return "Метод";
  }
  return HEADER_LABELS[name] || String(name).replace(/_/g, " ");
}

function columnHasValues(rows, index) {
  return rows.some((row) => {
    const v = row[index];
    return v !== "" && v != null && v !== false;
  });
}

function formatCell(value, row, sourceHeaders) {
  if (typeof value === "string" && value.includes("$$")) {
    const ownerIdx = sourceHeaders.findIndex((h) => /Ответственный/.test(h));
    const owner = ownerIdx >= 0 ? row[ownerIdx] : "";
    return methodDisplayName(value, owner);
  }
  if (typeof value === "boolean") return value ? "да" : "";
  if (typeof value === "number") return formatNumber(value);
  if (value == null) return "";
  return String(value);
}

export function mapDisplayColumns(headers, rows) {
  const keep = headers.map((h, i) => {
    if (isTechnicalHeader(h)) return false;
    if (h === "id") return columnHasValues(rows, i);
    if ((h === "Метод_Метод" || h === "name0") && headers.includes("id") && columnHasValues(rows, headers.indexOf("id"))) {
      return false;
    }
    if (!columnHasValues(rows, i) && !/Количество|продолжительность/i.test(h)) return false;
    return true;
  });
  const sourceIdx = headers.map((_, i) => i).filter((i) => keep[i]);
  const outHeaders = sourceIdx.map((i) => headerLabel(headers[i], rows, i));
  const outRows = rows.map((row) =>
    sourceIdx.map((i) => formatCell(row[i], row, headers))
  );
  return { headers: outHeaders, rows: outRows };
}

export function isPendingResult(json) {
  const r = json?.result;
  if (!r) return false;
  const status = r.status || r.Статус || r.state;
  if (typeof status === "string" && /wait|pending|process|выполн/i.test(status)) return true;
  return false;
}

export function isAuthError(json) {
  const msg = json?.error?.message || json?.error?.details || "";
  return /session|авториз|sid|не автори/i.test(String(msg));
}
