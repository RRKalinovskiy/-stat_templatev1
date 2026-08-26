import { defaultStands, DEFAULT_FILTER_JSON } from "./rpc.js";

export async function loadState() {
  const data = await chrome.storage.local.get(["stands", "filters", "device", "lastReport"]);
  const stands = data.stands?.length ? data.stands : defaultStands();
  let filters = data.filters || [];
  if (!filters.length) {
    filters = [{ id: crypto.randomUUID(), name: "Ошибки по методам", json: DEFAULT_FILTER_JSON }];
    await chrome.storage.local.set({ filters });
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
  await chrome.storage.local.set({ device });
  return device;
}

export async function saveStands(stands) {
  await chrome.storage.local.set({ stands });
}

export async function saveFilters(filters) {
  await chrome.storage.local.set({ filters });
}

export async function saveLastReport(lastReport) {
  await chrome.storage.local.set({ lastReport });
}
