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
  DEFAULT_FILTER_JSON
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

test("extract sid from auth record", () => {
  const result = { d: ["abc-sid", true], s: [{ n: "sid" }, { n: "ok" }], _type: "record" };
  assert.equal(extractSid(result), "abc-sid");
});
