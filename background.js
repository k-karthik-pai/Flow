// background.js — Flow Service Worker (ES Module)
import {
  getGoal, setGoal, getManualBlocklist, getAIBlocklist, getWhitelist,
  getApiKey, isBlockingEnabled, getAppealsInfo, recordAppeal,
  incrementBlockedStat, resetDailyData, setStorage, getStorage,
  STORAGE_KEYS, getTodayString,
} from './utils/storage.js';
import { analyzeGoal, judgeAppeal, evaluateDomainDynamically } from './utils/ai.js';
import { updateAllRules, clearAllRules } from './utils/rules.js';

// ─── Session-level state ─────────────────────────────────────────────────────
let sessionAllowed = [];
let goalTabOpened = false; // prevent opening goal tab more than once per session
let evaluatedDomains = {}; // Cache for dynamic AI blocking

// Essential domains that should never be evaluated or blocked dynamically
const ESSENTIAL_DOMAINS = [
  'google.com', 'google.co.in', 'google.co.uk',
  'bing.com', 'duckduckgo.com', 'yahoo.com',
  'localhost', '127.0.0.1'
];

// ─── Initialization ──────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async () => {
  await setStorage({ [STORAGE_KEYS.BLOCKING_ENABLED]: true });
  await setupMidnightAlarm();
  await syncRules();
});

chrome.runtime.onStartup.addListener(async () => {
  await checkMidnightReset();
  await syncRules();
  // Only open goal tab if: API key exists AND no goal set today
  await maybeOpenGoalTab();
});

// ─── Open goal tab only for API key users with no goal today ─────────────────
async function maybeOpenGoalTab() {
  if (goalTabOpened) return;
  const apiKey = await getApiKey();
  if (!apiKey) return; // no API key → don't bother user at all
  const goal = await getGoal();
  if (goal) return; // already set today
  goalTabOpened = true;
  const url = chrome.runtime.getURL('newtab/newtab.html');
  chrome.tabs.create({ url, active: true });
}

// ─── Midnight Reset Alarm ────────────────────────────────────────────────────
async function setupMidnightAlarm() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const delayMinutes = (midnight - now) / 60000;
  chrome.alarms.create('midnightReset', {
    delayInMinutes: delayMinutes,
    periodInMinutes: 24 * 60,
  });
}

async function checkMidnightReset() {
  const { goal } = await getStorage([STORAGE_KEYS.GOAL]);
  if (goal && goal.date !== getTodayString()) {
    await resetDailyData();
    sessionAllowed = [];
    evaluatedDomains = {};
    await clearAllRules();
    // Re-apply manual blocklist (always active)
    await syncRules();
  }
  await setupMidnightAlarm();
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'midnightReset') {
    await resetDailyData();
    sessionAllowed = [];
    evaluatedDomains = {};
    goalTabOpened = false;
    await clearAllRules();
    await syncRules(); // re-apply manual blocklist
  } else if (alarm.name === 'pauseEnd') {
    await setStorage({ [STORAGE_KEYS.PAUSE_UNTIL]: null });
    await syncRules();
  }
});

// ─── Rule Sync ───────────────────────────────────────────────────────────────
async function syncRules() {
  const enabled = await isBlockingEnabled();
  if (!enabled) {
    await clearAllRules();
    return;
  }
  const [manual, ai, whitelist] = await Promise.all([
    getManualBlocklist(),
    getAIBlocklist(),
    getWhitelist(),
  ]);
  await updateAllRules(manual, ai, whitelist, sessionAllowed);
}

// ─── Message Handler ─────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg, sender).then(sendResponse).catch((err) => {
    console.error('[Flow] Message error:', err);
    sendResponse({ error: err.message });
  });
  return true;
});

async function handleMessage(msg, sender) {
  switch (msg.type) {

    case 'SET_GOAL': {
      const goal = await setGoal(msg.goal);
      sessionAllowed = [];
      evaluatedDomains = {};
      const apiKey = await getApiKey();
      let aiBlocklist = [];
      let aiError = null;
      if (apiKey) {
        try {
          console.log('[Flow] Analyzing goal with AI:', msg.goal);
          aiBlocklist = await analyzeGoal(apiKey, msg.goal);
          console.log('[Flow] AI analysis result:', aiBlocklist);
          await setStorage({ [STORAGE_KEYS.AI_BLOCKLIST]: aiBlocklist });
        } catch (err) {
          console.error('[Flow] AI analysis failed:', err);
          aiError = err.message;
        }
      }
      await syncRules();
      return { success: true, goal, aiBlocklist, aiError };
    }

    case 'SUBMIT_APPEAL': {
      const { domain, url, reason } = msg;
      const goal = await getGoal();
      const apiKey = await getApiKey();
      const appealsInfo = await getAppealsInfo();
      if (!apiKey) return { error: 'No API key configured.' };
      if (!goal) return { error: 'No goal set for today.' };
      if (appealsInfo.remaining <= 0) return { error: 'Daily appeal limit reached (15/day).' };
      try {
        console.log('[Flow] Judging appeal for:', domain, 'Reason:', reason);
        const verdict = await judgeAppeal(apiKey, goal.text, domain, reason);
        console.log('[Flow] Appeal verdict:', verdict);
        if (verdict.allow) {
          sessionAllowed.push(url || `https://${domain}`);
          await syncRules();
        }
        await recordAppeal(domain, reason, verdict.reasoning, verdict.allow);
        return { ...verdict, remaining: appealsInfo.remaining - 1 };
      } catch (err) {
        console.error('[Flow] Appeal judgment failed:', err);
        return { error: err.message };
      }
    }

    case 'SET_BLOCKING': {
      await setStorage({ [STORAGE_KEYS.BLOCKING_ENABLED]: msg.enabled });
      if (!msg.enabled) {
        await setStorage({ [STORAGE_KEYS.PAUSE_UNTIL]: null });
        await clearAllRules();
      } else {
        await syncRules();
      }
      return { success: true };
    }

    case 'PAUSE_BLOCKING': {
      const until = Date.now() + msg.minutes * 60 * 1000;
      await setStorage({
        [STORAGE_KEYS.PAUSE_UNTIL]: until,
        [STORAGE_KEYS.BLOCKING_ENABLED]: true,
      });
      await clearAllRules();
      chrome.alarms.create('pauseEnd', { delayInMinutes: msg.minutes });
      return { success: true, pauseUntil: until };
    }

    case 'SYNC_RULES': {
      await syncRules();
      return { success: true };
    }

    case 'GET_STATE': {
      const [goal, manual, ai, whitelist, apiKey, enabled, appealsInfo, pause, stats] =
        await Promise.all([
          getGoal(),
          getManualBlocklist(),
          getAIBlocklist(),
          getWhitelist(),
          getApiKey(),
          isBlockingEnabled(),
          getAppealsInfo(),
          getStorage([STORAGE_KEYS.PAUSE_UNTIL]),
          getStorage([STORAGE_KEYS.STATS]),
        ]);
      return {
        goal,
        manualBlocklist: manual,
        aiBlocklist: ai,
        whitelist,
        hasApiKey: Boolean(apiKey),
        blockingEnabled: enabled,
        pauseUntil: pause.pauseUntil || null,
        appealsInfo,
        sessionAllowed,
        stats: stats.stats || {},
      };
    }

    case 'RECORD_BLOCK': {
      await incrementBlockedStat(msg.domain);
      return { success: true };
    }

    default:
      return { error: `Unknown message type: ${msg.type}` };
  }
}

// ─── Dynamic AI Evaluation ───────────────────────────────────────────────────
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !tab.url) return;
  if (!tab.url.startsWith('http')) return;

  const enabled = await isBlockingEnabled();
  if (!enabled) return;

  const [apiKey, goal, manual, ai, whitelist] = await Promise.all([
    getApiKey(), getGoal(), getManualBlocklist(), getAIBlocklist(), getWhitelist()
  ]);

  if (!apiKey || !goal) return;

  try {
    const urlObj = new URL(tab.url);
    const domain = urlObj.hostname.replace(/^www\./, '');
    
    // Check caches and lists
    if (ESSENTIAL_DOMAINS.includes(domain)) return;
    if (evaluatedDomains[tab.url]) return;
    if (whitelist.some(d => domain.includes(d) || d.includes(domain))) return;
    if (manual.some(d => domain.includes(d) || d.includes(domain))) return;
    if (ai.some(e => {
      const b = typeof e === 'string' ? e : e.domain;
      return domain.includes(b) || b.includes(domain);
    })) return;
    if (sessionAllowed.some(allowedUrl => tab.url.startsWith(allowedUrl))) return;

    // Mark as evaluating to prevent duplicate calls
    evaluatedDomains[tab.url] = true;
    
    // Ask Gemini
    const isDistracting = await evaluateDomainDynamically(apiKey, goal.text, domain, tab.url, tab.title);
    
    if (isDistracting) {
      console.log(`[Flow] Dynamically blocked: ${domain}`);
      const updatedAiList = [...ai, { domain, reason: 'Dynamically flagged by AI based on your goal.' }];
      await setStorage({ [STORAGE_KEYS.AI_BLOCKLIST]: updatedAiList });
      await syncRules();
      
      // Redirect the current tab
      chrome.tabs.update(tabId, {
        url: chrome.runtime.getURL(`blocked.html?site=${encodeURIComponent(domain)}&url=${encodeURIComponent(tab.url)}`)
      });
    } else {
      console.log(`[Flow] Dynamically allowed: ${domain}`);
    }
  } catch (err) {
    console.error('[Flow] Dynamic evaluation failed:', err);
  }
});
