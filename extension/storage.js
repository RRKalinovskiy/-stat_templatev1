import { DEFAULT_FILTER_JSON, mergeStands, normalizeFilterObject } from "./rpc.js";

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
  const data = await storeGet(["stands", "filters", "device", "lastReport", "selectedFilterId", "selectedStandId"]);
  const stands = mergeStands(data.stands);
  if (JSON.stringify(stands) !== JSON.stringify(data.stands)) await storeSet({ stands });
  let filters = data.filters || [];
  if (!filters.length) {
    filters = [{ id: crypto.randomUUID(), name: "Ошибки по методам", json: structuredClone(DEFAULT_FILTER_JSON) }];
    await storeSet({ filters });
  }
  return {
    stands,
    filters,
    device: data.device || (await ensureDevice()),
    lastReport: data.lastReport || null,
    selectedFilterId: data.selectedFilterId || filters[0]?.id || "",
    selectedStandId: data.selectedStandId || stands[0]?.id || ""
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

export async function saveSelection({ selectedFilterId, selectedStandId }) {
  const patch = {};
  if (selectedFilterId !== undefined) patch.selectedFilterId = selectedFilterId;
  if (selectedStandId !== undefined) patch.selectedStandId = selectedStandId;
  if (Object.keys(patch).length) await storeSet(patch);
}

export function parseFilterJson(json) {
  return normalizeFilterObject(json);
}
