import { syncStand, getReport } from "./api.js";
import { standHosts } from "./rpc.js";
import { loadState } from "./storage.js";

async function allHosts() {
  try {
    const { stands } = await loadState();
    return [...new Set([...standHosts(), ...(stands || []).map((s) => s.host)])];
  } catch {
    return standHosts();
  }
}

async function installCorsRules() {
  if (!chrome.declarativeNetRequest?.updateDynamicRules) return;
  const origin = `chrome-extension://${chrome.runtime.id}`;
  const hosts = await allHosts();
  const rules = hosts.map((domain, i) => ({
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
    removeRuleIds: Array.from({ length: 20 }, (_, i) => 100 + i),
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
