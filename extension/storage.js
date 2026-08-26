import { DEFAULT_FILTER_JSON, mergeStands } from "./rpc.js";

const memory = {};

function hasChromeStorage() {
  return typeof chrome !== "undefined" && chrome.storage?.local;
}

async function storeGet(keys) {
  if (!hasChromeStorage()) {
    const out = {};
    for (const k of keys) out[k] = memory[k];
    return out;
  }
  return chrome.storage.local.get(keys);
}

async function storeSet(obj) {
  Object.assign(memory, obj);
  if (hasChromeStorage()) await chrome.storage.local.set(obj);
}

export async function loadState() {
  const data = await storeGet(["stands", "filters", "device", "lastReport"]);
  const stands = mergeStands(data.stands);
  if (JSON.stringify(stands) !== JSON.stringify(data.stands)) await storeSet({ stands });
  let filters = data.filters || [];
  if (!filters.length) {
    filters = [{ id: crypto.randomUUID(), name: "Ошибки по методам", json: DEFAULT_FILTER_JSON }];
    await storeSet({ filters });
  }
  return {
    stands,
    filters,
    device: data.device || (await ensureDevice()),
    lastReport: data.lastReport || null
  };
}

async function ensureDevice() {
  const id = crypto.randomUUID();
  const device = {
    machineId: id,
    newMachineId: crypto.randomUUID(),
    machineName: "STATS-EXT",
    os: "Windows 10.0"
  };
  await storeSet({ device });
  return device;
}

export async function saveStands(stands) {
  await storeSet({ stands });
}

export async function saveFilters(filters) {
  await storeSet({ filters });
}

export async function saveLastReport(lastReport) {
  await storeSet({ lastReport });
}
