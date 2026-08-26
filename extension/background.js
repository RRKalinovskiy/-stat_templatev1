import { syncStand, getReport } from "./api.js";

const STANDS = ["fix-cloud.sbis.ru", "test-cloud.sbis.ru", "pre-cloud.sbis.ru"];

async function installCorsRules() {
  if (!chrome.declarativeNetRequest?.updateDynamicRules) return;
  const origin = `chrome-extension://${chrome.runtime.id}`;
  const rules = STANDS.map((domain, i) => ({
    id: 100 + i,
    priority: 2,
    action: {
      type: "modifyHeaders",
      responseHeaders: [
        { header: "Access-Control-Allow-Origin", operation: "set", value: origin },
        { header: "Access-Control-Allow-Credentials", operation: "set", value: "true" },
        { header: "Access-Control-Allow-Methods", operation: "set", value: "GET, POST, OPTIONS" },
        {
          header: "Access-Control-Allow-Headers",
          operation: "set",
          value: "content-type,x-calledmethod,x-requested-with,x-sbissessionid,accept"
        }
      ]
    },
    condition: {
      requestDomains: [domain],
      resourceTypes: ["xmlhttprequest", "other"]
    }
  }));
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: rules.map((r) => r.id),
    addRules: rules
  });
}

chrome.runtime.onInstalled.addListener(() => {
  installCorsRules().catch(() => {});
});
installCorsRules().catch(() => {});

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
