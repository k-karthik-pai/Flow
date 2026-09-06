// Keep list edits and installed rules consistent if Chrome rejects a rule update.
export async function saveSiteList(key, updated) {
  const previous = await chrome.storage.local.get([key]);
  await chrome.storage.local.set({ [key]: updated });
  const result = await chrome.runtime.sendMessage({ type: 'SYNC_RULES' });
  if (result?.error) {
    await chrome.storage.local.set({ [key]: previous[key] || [] });
    await chrome.runtime.sendMessage({ type: 'SYNC_RULES' });
    alert(`Could not update the site list: ${result.error}`);
    throw new Error(result.error);
  }
}
