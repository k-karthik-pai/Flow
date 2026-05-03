// utils/storage.js — Chrome Storage Helpers for Flow

export const STORAGE_KEYS = {
  GOAL: 'goal',
  MANUAL_BLOCKLIST: 'manualBlocklist',
  AI_BLOCKLIST: 'aiBlocklist',
  WHITELIST: 'whitelist',
  API_KEY: 'apiKey',
  BLOCKING_ENABLED: 'blockingEnabled',
  PAUSE_UNTIL: 'pauseUntil',
  APPEALS: 'appeals',
  APPEALS_TODAY: 'appealsToday',
  APPEALS_RESET_DATE: 'appealsResetDate',
  STATS: 'stats',
  ONBOARDED: 'onboarded',
  THEME: 'theme', // 'light' | 'dark' | 'system'
};

export const MAX_APPEALS_PER_DAY = 15;

export function getTodayString() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

export async function getStorage(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (result) => {
      if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
      else resolve(result);
    });
  });
}

export async function setStorage(data) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(data, () => {
      if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
      else resolve();
    });
  });
}

export async function getGoal() {
  const { goal } = await getStorage([STORAGE_KEYS.GOAL]);
  if (!goal) return null;
  // Check if goal is from today
  if (goal.date !== getTodayString()) return null;
  return goal;
}

export async function setGoal(text) {
  const goal = { text, date: getTodayString(), setAt: Date.now() };
  await setStorage({ [STORAGE_KEYS.GOAL]: goal });
  return goal;
}

export async function getManualBlocklist() {
  const { manualBlocklist } = await getStorage([STORAGE_KEYS.MANUAL_BLOCKLIST]);
  return manualBlocklist || [];
}

export async function getAIBlocklist() {
  const { aiBlocklist } = await getStorage([STORAGE_KEYS.AI_BLOCKLIST]);
  return aiBlocklist || [];
}

export async function getWhitelist() {
  const { whitelist } = await getStorage([STORAGE_KEYS.WHITELIST]);
  return whitelist || [];
}

export async function getApiKey() {
  const { apiKey } = await getStorage([STORAGE_KEYS.API_KEY]);
  return apiKey || null;
}

export async function isBlockingEnabled() {
  const { blockingEnabled, pauseUntil } = await getStorage([
    STORAGE_KEYS.BLOCKING_ENABLED,
    STORAGE_KEYS.PAUSE_UNTIL,
  ]);
  if (pauseUntil && Date.now() < pauseUntil) return false;
  return blockingEnabled !== false; // default true
}

export async function getAppealsInfo() {
  const today = getTodayString();
  const { appeals, appealsToday, appealsResetDate } = await getStorage([
    STORAGE_KEYS.APPEALS,
    STORAGE_KEYS.APPEALS_TODAY,
    STORAGE_KEYS.APPEALS_RESET_DATE,
  ]);
  const count = appealsResetDate === today ? (appealsToday || 0) : 0;
  return {
    appeals: appeals || [],
    appealsToday: count,
    remaining: MAX_APPEALS_PER_DAY - count,
  };
}

export async function recordAppeal(domain, userReason, aiVerdict, allowed) {
  const today = getTodayString();
  const { appeals, appealsToday, appealsResetDate } = await getStorage([
    STORAGE_KEYS.APPEALS,
    STORAGE_KEYS.APPEALS_TODAY,
    STORAGE_KEYS.APPEALS_RESET_DATE,
  ]);

  const currentCount = appealsResetDate === today ? (appealsToday || 0) : 0;
  const currentAppeals = appeals || [];

  const newAppeal = {
    id: Date.now().toString(),
    domain,
    userReason,
    aiVerdict,
    allowed,
    timestamp: Date.now(),
    date: today,
  };

  await setStorage({
    [STORAGE_KEYS.APPEALS]: [newAppeal, ...currentAppeals].slice(0, 100),
    [STORAGE_KEYS.APPEALS_TODAY]: currentCount + 1,
    [STORAGE_KEYS.APPEALS_RESET_DATE]: today,
  });

  return newAppeal;
}

export async function incrementBlockedStat(domain) {
  const today = getTodayString();
  const { stats } = await getStorage([STORAGE_KEYS.STATS]);
  const currentStats = stats || {};
  
  // Prune stats older than 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const cutoffDate = thirtyDaysAgo.toISOString().slice(0, 10);
  
  for (const date in currentStats) {
    if (date < cutoffDate) {
      delete currentStats[date];
    }
  }

  const todayStats = currentStats[today] || { blocked: 0, topDomains: {} };

  todayStats.blocked += 1;
  todayStats.topDomains[domain] = (todayStats.topDomains[domain] || 0) + 1;

  await setStorage({
    [STORAGE_KEYS.STATS]: {
      ...currentStats,
      [today]: todayStats,
    },
  });
}

export async function resetDailyData() {
  await setStorage({
    [STORAGE_KEYS.GOAL]: null,
    [STORAGE_KEYS.AI_BLOCKLIST]: [],
    [STORAGE_KEYS.APPEALS_TODAY]: 0,
    [STORAGE_KEYS.APPEALS_RESET_DATE]: getTodayString(),
    [STORAGE_KEYS.PAUSE_UNTIL]: null,
  });
}
