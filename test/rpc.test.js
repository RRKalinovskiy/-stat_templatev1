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
  DEFAULT_FILTER_JSON,
  authServiceUrl,
  reportServiceUrl,
  rpcCallUrl,
  authCallUrls,
  reportCallUrls
} from "../extension/rpc.js";

test("period is replaced in filter JSON", () => {
  const start = new Date("2026-08-25T11:10:00.000Z");
  const end = new Date("2026-08-26T11:10:00.000Z");
  const next = applyPeriod(DEFAULT_FILTER_JSON, start, end);
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
  const params = buildGetReportParams(DEFAULT_FILTER_JSON, start, new Date("2026-08-26T11:10:00.000Z"));
  const period = params.Фильтр.d[0].d[7].d[0];
  assert.deepEqual(period, ["2026-08-25 14:10:00+03", "2026-08-26 14:10:00+03"]);
  assert.equal(params.Навигация.d[2], 0);
  assert.equal(params.Навигация.d[1], 50);
  const vertical = params.Фильтр.d[1].d[2];
  const ownerRec = vertical.d[8];
  assert.deepEqual(ownerRec.s[0].n, "Filter");
  const filterValues = ownerRec.d[0];
  assert.equal(Array.isArray(filterValues), true);
  assert.equal(Array.isArray(filterValues[0]), false);
  assert.equal(typeof filterValues[0], "string");
  assert.ok(filterValues.includes("Панов М.В."));
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
  assert.equal(table.headers[0], "Метод БЛ");
  assert.equal(table.rows[0][0], "CoreV3.Collecting (Панов М.В.)");
  assert.equal(table.rows[0][1], "6 364");
  assert.equal(table.rows[0][2], "36");
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
  assert.ok(names.includes("Метод_Объект"));
  assert.equal(names.includes("Метод_Ответственный"), false);
  const objectRec = vertical.d[names.indexOf("Метод_Объект")];
  assert.deepEqual(objectRec.d[0], ["Trigger", "Service"]);
  const aliasRec = vertical.d[names.indexOf("Метод_МетодПсевдоним")];
  assert.equal(aliasRec.s.some((c) => c.n === "Excluded"), true);
  const localRec = vertical.d[names.indexOf("WEB-Сервис_Локальный стенд")];
  assert.deepEqual(localRec.d[0], ["0"]);
});

test("extract sid from auth record", () => {
  const result = { d: ["abc-sid", true], s: [{ n: "sid" }, { n: "ok" }], _type: "record" };
  assert.equal(extractSid(result), "abc-sid");
});
