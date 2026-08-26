const DEFAULT_STANDS = [
  { id: "fix", host: "fix-cloud.sbis.ru", title: "FIX", login: "", password: "", synced: false, lastError: "" },
  { id: "test", host: "test-cloud.sbis.ru", title: "TEST", login: "", password: "", synced: false, lastError: "" },
  { id: "pre", host: "pre-cloud.sbis.ru", title: "PRE", login: "", password: "", synced: false, lastError: "" }
];

export const DEFAULT_FILTER_JSON = {
  TZ: 3,
  characteristics: [
    { id: "Количество вызовов", order: null, range: {} },
    { id: "Количество ошибок", order: "desc", range: { end: 99999999, start: 1 } },
    { id: "Общая продолжительность (мс)", order: null, range: {} },
    { id: "Максимальная продолжительность (мс)", order: null, range: {} },
    { id: "Средняя продолжительность (мс)", order: null, range: {} },
    { id: "Количество предупреждений", order: null, range: {} }
  ],
  cube: "Вызовы",
  dimensions: [
    { excluded: null, id: "Метод_Метод", isAggregated: true, isTimeDim: null, mode: null, timePeriod: null, timeStep: null, top: 100, values: null },
    { excluded: null, id: "time", isAggregated: false, isTimeDim: true, mode: "all_days", timePeriod: { end: "23:59", start: "00:00" }, timeStep: "day", top: 100, values: null },
    { excluded: null, id: "Метод_МетодПсевдоним", isAggregated: false, isTimeDim: null, mode: null, timePeriod: null, timeStep: null, top: null, values: null },
    { excluded: null, id: "WEB-Сервис_Семейство", isAggregated: false, isTimeDim: null, mode: null, timePeriod: null, timeStep: null, top: null, values: null },
    { excluded: null, id: "WEB-Сервис_Приложение", isAggregated: false, isTimeDim: null, mode: null, timePeriod: null, timeStep: null, top: null, values: null },
    { excluded: null, id: "WEB-Сервис_Сервис", isAggregated: false, isTimeDim: null, mode: null, timePeriod: null, timeStep: null, top: null, values: null },
    { excluded: null, id: "WEB-Сервис_СистемноеИмя", isAggregated: false, isTimeDim: null, mode: null, timePeriod: null, timeStep: null, top: null, values: null },
    { excluded: null, id: "БилдСервиса_БилдСервиса", isAggregated: false, isTimeDim: null, mode: null, timePeriod: null, timeStep: null, top: null, values: null },
    {
      excluded: null,
      id: "Метод_Ответственный",
      isAggregated: false,
      isTimeDim: null,
      mode: null,
      timePeriod: null,
      timeStep: null,
      top: null,
      values: [
        "Гаврилов М.В.",
        "Давлетшин Д.М.",
        "Лукьянов Н.Л.",
        "Малышев С.В.",
        "Мугинов Э.И.",
        "Панов М.В.",
        "Прозоркевич Д.А.",
        "Рыженко Д.А."
      ]
    }
  ],
  idParent: null,
  version: "1",
  comparePeriodEnabled: false,
  period: [{ start: "2026-08-25T11:10:00.000Z", end: "2026-08-26T11:10:00.000Z" }],
  displayType: "Таблица"
};

export const CHAR_COLUMNS = [
  "Количество вызовов",
  "Количество ошибок",
  "Общая продолжительность (мс)",
  "Максимальная продолжительность (мс)",
  "Средняя продолжительность (мс)",
  "Количество предупреждений"
];

export function defaultStands() {
  return structuredClone(DEFAULT_STANDS);
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

export function formatRuDate(date) {
  const p = toMoscowParts(date);
  return `${p.d}.${p.m}.${p.y.slice(2)}`;
}

export function formatRuTime(date) {
  const p = toMoscowParts(date);
  return `${p.h}:${p.min}`;
}

function rec(f, d, s) {
  return { d, s, _type: "record", f };
}

function rs(f, d, s) {
  return { d, s, _type: "recordset", f };
}

export function applyPeriod(filter, start, end) {
  const next = structuredClone(filter);
  next.period = [{ start: start.toISOString(), end: end.toISOString() }];
  return next;
}

export function buildNavigation(page, pageSize = 50) {
  return rec(0, [true, pageSize, page], [
    { t: "Логическое", n: "ЕстьЕще" },
    { t: "Число целое", n: "РазмерСтраницы" },
    { t: "Число целое", n: "Страница" }
  ]);
}

export function buildGetReportParams(filter, start, end, page = 0, pageSize = 50) {
  const f = applyPeriod(filter, start, end);
  const tz = f.TZ ?? 3;

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
  const dimD = (f.dimensions || []).map((d) => [
    d.id,
    d.isTimeDim ?? null,
    d.isAggregated ?? false,
    d.values ?? null,
    d.valuesCompare ?? null,
    d.excluded ?? null,
    d.excludedCompare ?? null,
    d.top ?? null,
    d.mode ?? null,
    d.timePeriod ?? null,
    d.timeStep ?? null
  ]);

  const periodRs = rs(
    4,
    [[formatRpcDateTime(start), formatRpcDateTime(end)]],
    [
      { t: "Дата и время", n: "start" },
      { t: "Дата и время", n: "end" }
    ]
  );

  const emptyRec = rec(7, [], []);
  const dimById = Object.fromEntries((f.dimensions || []).map((d) => [d.id, d]));
  const methodDim = dimById["Метод_Метод"];
  const ownerDim = dimById["Метод_Ответственный"];

  const vertical = rec(
    6,
    [
      emptyRec,
      emptyRec,
      emptyRec,
      emptyRec,
      emptyRec,
      emptyRec,
      rec(8, [1, methodDim?.top ?? 100], [
        { t: "Число целое", n: "Position" },
        { t: "Число целое", n: "Top" }
      ]),
      emptyRec,
      rec(9, [ownerDim?.values || []], [{ t: { n: "Массив", t: "Строка" }, n: "Filter" }])
    ],
    [
      { t: "Запись", n: "WEB-Сервис_Приложение" },
      { t: "Запись", n: "WEB-Сервис_Семейство" },
      { t: "Запись", n: "WEB-Сервис_Сервис" },
      { t: "Запись", n: "WEB-Сервис_СистемноеИмя" },
      { t: "Запись", n: "time" },
      { t: "Запись", n: "БилдСервиса_БилдСервиса" },
      { t: "Запись", n: "Метод_Метод" },
      { t: "Запись", n: "Метод_МетодПсевдоним" },
      { t: "Запись", n: "Метод_Ответственный" }
    ]
  );

  const charsAnalysis = rec(
    10,
    (f.characteristics || []).map((c) => {
      if (c.range && (c.range.start != null || c.range.end != null)) {
        return rec(11, [c.range.end ?? null, c.range.start ?? null, true], [
          { t: "Число целое", n: "Higher" },
          { t: "Число целое", n: "Lower" },
          { t: "Логическое", n: "Top" }
        ]);
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
      f.cube || "Вызовы",
      rs(3, dimD, dimS),
      f.displayType || "Таблица",
      f.idParent ?? null,
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
      { t: "Строка", n: "idParent" },
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
      formatRuTime(end),
      formatRuTime(start),
      formatRuDate(end),
      formatRuDate(start),
      f.cube || "Вызовы",
      f.displayType || "Таблица",
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
    if (Array.isArray(row)) return row;
    if (row && Array.isArray(row.d)) return row.d;
    return headers.map((h) => row?.[h]);
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

function findRecordset(node, depth = 0) {
  if (!node || depth > 8) return null;
  if (node._type === "recordset" && Array.isArray(node.d) && node.s) return node;
  if (Array.isArray(node.d) && Array.isArray(node.s) && node.d.length && Array.isArray(node.d[0])) {
    return node;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findRecordset(item, depth + 1);
      if (found) return found;
    }
  } else if (typeof node === "object") {
    for (const key of ["result", "d", "data", "Таблица"]) {
      if (key in node) {
        const found = findRecordset(node[key], depth + 1);
        if (found) return found;
      }
    }
    for (const v of Object.values(node)) {
      if (v && typeof v === "object") {
        const found = findRecordset(v, depth + 1);
        if (found) return found;
      }
    }
  }
  return null;
}

export function extractSid(result) {
  const direct = findNamedValue(result, "sid") ?? findNamedValue(result, "Сид") ?? findNamedValue(result, "SID");
  if (typeof direct === "string" && direct) return direct;
  if (typeof result === "string") return result;
  return null;
}

export function mapDisplayColumns(headers, rows, characteristicIds = CHAR_COLUMNS) {
  const methodIdx = headers.findIndex((h) => /Метод_Метод$/.test(h) || h === "Метод");
  const ownerIdx = headers.findIndex((h) => /Ответственный/.test(h));
  const charIdx = characteristicIds.map((name) => headers.findIndex((h) => h === name));
  const missingChars = charIdx.every((i) => i < 0);

  const outHeaders = ["Метод БЛ", ...characteristicIds];
  const outRows = rows.map((row) => {
    const method = methodIdx >= 0 ? row[methodIdx] : row[0];
    const owner = ownerIdx >= 0 ? row[ownerIdx] : "";
    const title = owner ? `${method} (${owner})` : String(method ?? "");
    if (missingChars) {
      const rest = row.slice(methodIdx >= 0 ? 1 : 1).map((v) => formatNumber(v));
      return [title, ...characteristicIds.map((_, n) => rest[n] ?? "")];
    }
    return [title, ...charIdx.map((i) => (i >= 0 ? formatNumber(row[i]) : ""))];
  });
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
