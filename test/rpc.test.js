import test from "node:test";
import assert from "node:assert/strict";
import {
  applyPeriod,
  buildGetReportParams,
  formatNumber,
  formatRpcDateTime,
  parseReportTable,
  mapDisplayColumns,
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

test("auth and report endpoints match stand services without srv=1", () => {
  assert.equal(authServiceUrl("fix-cloud.sbis.ru"), "https://fix-cloud.sbis.ru/auth/service/");
  assert.equal(authServiceUrl("test-cloud.sbis.ru"), "https://test-cloud.sbis.ru/auth/service/");
  assert.equal(authServiceUrl("pre-cloud.sbis.ru"), "https://pre-cloud.sbis.ru/auth/service/");
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

test("extract sid from auth record", () => {
  const result = { d: ["abc-sid", true], s: [{ n: "sid" }, { n: "ok" }], _type: "record" };
  assert.equal(extractSid(result), "abc-sid");
});
