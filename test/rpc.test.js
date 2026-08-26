import test from "node:test";
import assert from "node:assert/strict";
import {
  applyPeriod,
  buildGetReportParams,
  formatNumber,
  formatRpcDateTime,
  parseReportTable,
  mapDisplayColumns,
  methodDisplayName,
  mergeStands,
  reportFileName,
  extractSid,
  EMPTY_FILTER_TEMPLATE,
  VERTICAL_DETAIL_FIELDS,
  authServiceUrl,
  reportServiceUrl,
  rpcCallUrl,
  authCallUrls,
  reportCallUrls
} from "../extension/rpc.js";

const SAMPLE_FILTER = {
  TZ: 3,
  cube: "Вызовы",
  displayType: "Таблица",
  version: "1",
  comparePeriodEnabled: false,
  characteristics: [
    { id: "Количество вызовов", order: null, range: {} },
    { id: "Количество ошибок", order: "desc", range: { start: 1 } }
  ],
  dimensions: [
    { id: "Метод_Метод", isAggregated: true, top: 100 },
    { id: "time", isTimeDim: true, mode: "all_days", timePeriod: { start: "00:00", end: "23:59" }, timeStep: "day" },
    { id: "Метод_Ответственный", values: ["Панов М.В.", "Гаврилов М.В."] }
  ],
  period: [{ start: "2026-08-25T11:10:00.000Z", end: "2026-08-26T11:10:00.000Z" }]
};

test("period is replaced in filter JSON", () => {
  const start = new Date("2026-08-25T11:10:00.000Z");
  const end = new Date("2026-08-26T11:10:00.000Z");
  const next = applyPeriod(SAMPLE_FILTER, start, end);
  assert.equal(next.period[0].start, "2026-08-25T11:10:00.000Z");
  assert.equal(next.period[0].end, "2026-08-26T11:10:00.000Z");
});

test("applyPeriod does not crash on missing filter", () => {
  assert.throws(() => applyPeriod(undefined, new Date(), new Date()), /Фильтр не задан/);
  const wrapped = applyPeriod({ filter: { cube: "Вызовы", characteristics: [] } }, new Date("2026-08-25T00:00:00Z"), new Date("2026-08-26T00:00:00Z"));
  assert.equal(wrapped.cube, "Вызовы");
  assert.ok(wrapped.period);
});

test("RPC period uses Moscow offset +03", () => {
  const start = new Date("2026-08-25T11:10:00.000Z");
  assert.equal(formatRpcDateTime(start), "2026-08-25 14:10:00+03");
  const params = buildGetReportParams(SAMPLE_FILTER, start, new Date("2026-08-26T11:10:00.000Z"));
  const period = params.Фильтр.d[0].d[7].d[0];
  assert.deepEqual(period, ["2026-08-25 14:10:00+03", "2026-08-26 14:10:00+03"]);
  assert.equal(params.Навигация.d[2], 0);
  assert.equal(params.Навигация.d[1], 50);
  const vertical = params.Фильтр.d[1].d[2];
  const names = vertical.s.map((c) => c.n);
  const ownerRec = vertical.d[names.indexOf("Метод_Ответственный")];
  assert.deepEqual(ownerRec.s[0].n, "Filter");
  const filterValues = ownerRec.d[0];
  assert.equal(Array.isArray(filterValues), true);
  assert.equal(Array.isArray(filterValues[0]), false);
  assert.equal(typeof filterValues[0], "string");
  assert.ok(filterValues.includes("Панов М.В."));
  assert.equal(ownerRec.s.some((c) => c.n === "Position"), false);
  assert.equal(ownerRec.f, 9);
  const methodRec = vertical.d[names.indexOf("Метод_Метод")];
  assert.deepEqual(methodRec.s.map((c) => c.n), ["Position", "Top"]);
  assert.equal(methodRec.f, 8);
  assert.deepEqual(methodRec.d, [1, 100]);
});

test("owner dimension with UI top:100 still sends Filter, not Position", () => {
  const filter = {
    cube: "Вызовы",
    dimensions: [
      { id: "Метод_Метод", isAggregated: true, top: 100 },
      {
        id: "Метод_Ответственный",
        isAggregated: false,
        top: 100,
        values: ["Панов М.В.", "Гаврилов М.В."]
      }
    ],
    characteristics: [{ id: "Количество ошибок", range: { start: 1 } }]
  };
  const params = buildGetReportParams(filter, new Date("2026-08-25T11:10:00.000Z"), new Date("2026-08-26T11:10:00.000Z"));
  const vertical = params.Фильтр.d[1].d[2];
  const names = vertical.s.map((c) => c.n);
  const ownerRec = vertical.d[names.indexOf("Метод_Ответственный")];
  assert.equal(ownerRec.s[0].n, "Filter");
  assert.equal(ownerRec.s.some((c) => c.n === "Position"), false);
  assert.equal(typeof ownerRec.d[0][0], "string");
  assert.equal(ownerRec.f, 9);
});

test("empty filter template still uses the fixed vertical detail schema", () => {
  const params = buildGetReportParams(EMPTY_FILTER_TEMPLATE, new Date("2026-08-25T11:10:00.000Z"), new Date("2026-08-26T11:10:00.000Z"));
  assert.equal(params.Фильтр.d[0].d[3], "");
  assert.equal(params.Фильтр.d[0].d[4].d.length, 0);
  assert.equal(params.Фильтр.d[0].d[1].d.length, 0);
  const vertical = params.Фильтр.d[1].d[2];
  assert.deepEqual(vertical.s.map((c) => c.n), VERTICAL_DETAIL_FIELDS);
  assert.equal(vertical.d.length, VERTICAL_DETAIL_FIELDS.length);
});

test("numbers use space thousands separator", () => {
  assert.equal(formatNumber(10849078), "10 849 078");
  assert.equal(formatNumber(1704.76), "1 704.76");
});

test("parse recordset and map columns like the stats table", () => {
  const result = {
    d: [["CoreV3.Collecting", "Панов М.В.", 6364, 36, 10849078, 5000, 1704.76, 2]],
    s: [
      { n: "Метод_Метод" },
      { n: "Метод_Ответственный" },
      { n: "Количество вызовов" },
      { n: "Количество ошибок" },
      { n: "Общая продолжительность (мс)" },
      { n: "Максимальная продолжительность (мс)" },
      { n: "Средняя продолжительность (мс)" },
      { n: "Количество предупреждений" }
    ],
    _type: "recordset"
  };
  const parsed = parseReportTable(result);
  const table = mapDisplayColumns(parsed.headers, parsed.rows);
  assert.equal(table.headers[0], "Метод");
  assert.equal(table.headers[1], "Ответственный");
  assert.equal(table.headers[2], "Количество вызовов");
  assert.equal(table.rows[0][0], "CoreV3.Collecting");
  assert.equal(table.rows[0][2], "6 364");
  assert.equal(table.rows[0][3], "36");
});

test("method name strips $$ composite key", () => {
  assert.equal(methodDisplayName("CoreV3.Collecting$$Панов М.В.", "Панов М.В."), "CoreV3.Collecting (Панов М.В.)");
  assert.equal(methodDisplayName("CoreV3.Collecting$$Панов М.В.", ""), "CoreV3.Collecting (Панов М.В.)");
  assert.equal(methodDisplayName("CRMClients.ListClientsOnline$$Гаврилов М.В."), "CRMClients.ListClientsOnline (Гаврилов М.В.)");
  const table = mapDisplayColumns(
    ["Метод_Метод", "Количество вызовов"],
    [["CoreV3.Collecting$$Панов М.В.", 10]]
  );
  assert.equal(table.rows[0][0], "CoreV3.Collecting (Панов М.В.)");
});

test("auth and report endpoints match stand services without srv=1", () => {
  assert.equal(authServiceUrl("fix-cloud.sbis.ru"), "https://fix-cloud.sbis.ru/auth/service/");
  assert.equal(authServiceUrl("test-cloud.sbis.ru"), "https://test-cloud.sbis.ru/auth/service/");
  assert.equal(authServiceUrl("pre-test-cloud.sbis.ru"), "https://pre-test-cloud.sbis.ru/auth/service/");
  assert.equal(
    reportServiceUrl("fix-cloud.sbis.ru"),
    "https://fix-cloud.sbis.ru/stats-cloud-interface/service/"
  );
  assert.equal(
    rpcCallUrl(authServiceUrl("fix-cloud.sbis.ru")),
    "https://fix-cloud.sbis.ru/auth/service/?id=1&protocol=7"
  );
  assert.equal(
    rpcCallUrl(reportServiceUrl("fix-cloud.sbis.ru")),
    "https://fix-cloud.sbis.ru/stats-cloud-interface/service/?id=1&protocol=7"
  );
  assert.deepEqual(authCallUrls("fix-cloud.sbis.ru"), [
    "https://fix-cloud.sbis.ru/auth/service/?id=1&protocol=7",
    "https://fix-cloud.sbis.ru/auth/service/?id=1&protocol=7&srv=1"
  ]);
  assert.equal(
    reportCallUrls("fix-cloud.sbis.ru")[0],
    "https://fix-cloud.sbis.ru/stats-cloud-interface/service/?id=1&protocol=7"
  );
});

test("report file name is filter (stand) date", () => {
  const name = reportFileName({
    filterName: "Ошибки по методам",
    stand: { id: "fix", host: "fix-cloud.sbis.ru" },
    date: new Date("2026-08-26T12:00:00+03:00")
  });
  assert.equal(name, "Ошибки по методам (fix) 26-08-26.pdf");
});

test("mergeStands adds pre-test without dropping saved logins", () => {
  const merged = mergeStands([
    { id: "fix", host: "fix-cloud.sbis.ru", title: "FIX", login: "Viewer", password: "x", synced: true },
    { id: "pre", host: "pre-cloud.sbis.ru", title: "PRE", login: "old", password: "y" }
  ]);
  assert.equal(merged.find((s) => s.id === "fix").login, "Viewer");
  const preTest = merged.find((s) => s.id === "pre-test");
  assert.equal(preTest.host, "pre-test-cloud.sbis.ru");
  assert.equal(merged.some((s) => s.id === "pre" || s.host === "pre-cloud.sbis.ru"), false);
  assert.equal(authServiceUrl(preTest.host), "https://pre-test-cloud.sbis.ru/auth/service/");
});

test("GetReport params use the passed filter characteristics, not the default errors filter", () => {
  const custom = {
    TZ: 3,
    cube: "Вызовы",
    displayType: "Таблица",
    version: "1",
    comparePeriodEnabled: false,
    characteristics: [{ id: "Количество вызовов", order: "desc", range: {} }],
    dimensions: [{ id: "Метод_Метод", isAggregated: true, top: 10 }]
  };
  const params = buildGetReportParams(custom, new Date("2026-08-25T11:10:00.000Z"), new Date("2026-08-26T11:10:00.000Z"));
  const chars = params.Фильтр.d[0].d[1].d;
  assert.equal(chars.length, 1);
  assert.equal(chars[0][0], "Количество вызовов");
  assert.notEqual(chars[0][0], "Количество ошибок");
});

test("custom cube filter maps empty values, excluded aliases, and object list", () => {
  const custom = {
    cube: "Вызовы",
    comparePeriodEnabled: false,
    dimensions: [
      { id: "Метод_Метод", isAggregated: true, top: 100 },
      { id: "WEB-Сервис_Приложение", isAggregated: false, values: [] },
      { id: "Метод_Объект", isAggregated: false, values: ["Trigger", "Service"] },
      { id: "WEB-Сервис_Локальный стенд", isAggregated: false, values: [0] },
      { id: "time", mode: "all_days", timePeriod: { start: "00:00", end: "23:59" }, timeStep: "ten_minute", isAggregated: false },
      { id: "Метод_МетодПсевдоним", isAggregated: false, values: ["Service.ListIterator"], excluded: true }
    ],
    characteristics: [{ id: "Количество ошибок", range: { start: 1 }, order: "desc" }],
    version: "1",
    displayType: "Таблица"
  };
  const params = buildGetReportParams(custom, new Date("2026-08-24T21:00:00.000Z"), new Date("2026-08-26T13:50:00.000Z"));
  const dimRows = params.Фильтр.d[0].d[4].d;
  const appRow = dimRows.find((r) => r[0] === "WEB-Сервис_Приложение");
  assert.equal(appRow[3], null);
  const timeRow = dimRows.find((r) => r[0] === "time");
  assert.equal(timeRow[1], true);
  assert.equal(timeRow[10], "ten_minute");
  const aliasRow = dimRows.find((r) => r[0] === "Метод_МетодПсевдоним");
  assert.equal(aliasRow[5], true);
  const vertical = params.Фильтр.d[1].d[2];
  const names = vertical.s.map((c) => c.n);
  assert.deepEqual(names, VERTICAL_DETAIL_FIELDS);
  assert.equal(names.includes("Метод_Объект"), false);
  assert.equal(names.includes("WEB-Сервис_Локальный стенд"), false);
  const objectRow = dimRows.find((r) => r[0] === "Метод_Объект");
  assert.deepEqual(objectRow[3], ["Trigger", "Service"]);
  const aliasRec = vertical.d[names.indexOf("Метод_МетодПсевдоним")];
  assert.equal(aliasRec.s.some((c) => c.n === "Excluded"), true);
  const localRow = dimRows.find((r) => r[0] === "WEB-Сервис_Локальный стенд");
  assert.deepEqual(localRow[3], ["0"]);
});

test("tree-shaped GetReport rows drop service columns", () => {
  const result = {
    d: [
      [
        "CoreV3.Collecting (Панов М.В.)",
        "",
        "",
        "",
        true,
        ["Метод_Метод", "CoreV3.Collecting"],
        "Панов М.В.",
        5488,
        18,
        9884223,
        19954,
        1801.06
      ]
    ],
    s: [
      { n: "id" },
      { n: "idParent" },
      { n: "idParent@" },
      { n: "idParent$" },
      { n: "dimension" },
      { n: "name0" },
      { n: "ОтветственныйЗаМетод" },
      { n: "Количество вызовов" },
      { n: "Количество ошибок" },
      { n: "Общая продолжительность (мс)" },
      { n: "Максимальная продолжительность (мс)" },
      { n: "Средняя продолжительность (мс)" }
    ],
    _type: "recordset"
  };
  const parsed = parseReportTable(result);
  const table = mapDisplayColumns(parsed.headers, parsed.rows);
  assert.equal(table.headers.includes("idParent"), false);
  assert.equal(table.headers.includes("name0"), false);
  assert.equal(table.headers.includes("dimension"), false);
  assert.equal(table.headers[0], "Метод");
  assert.equal(table.headers[1], "Ответственный");
  assert.equal(table.rows[0][0], "CoreV3.Collecting (Панов М.В.)");
  assert.equal(table.rows[0][2], "5 488");
});

test("extract sid from auth record", () => {
  const result = { d: ["abc-sid", true], s: [{ n: "sid" }, { n: "ok" }], _type: "record" };
  assert.equal(extractSid(result), "abc-sid");
});
