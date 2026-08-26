import { syncStand, getReport } from "./api.js";

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
