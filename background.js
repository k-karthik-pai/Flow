// background.js — Flow Service Worker (ES Module)
import {
  getGoal, setGoal, getManualBlocklist, getAIBlocklist, getWhitelist,
  getApiKey, isBlockingEnabled, getAppealsInfo, recordAppeal,
  incrementBlockedStat, resetDailyData, setStorage, getStorage,
  STORAGE_KEYS, getTodayString,
} from './utils/storage.js';
import { analyzeGoal, judgeAppeal } from './utils/ai.js';
import { updateAllRules, clearAllRules } from './utils/rules.js';

// ─── Session-level state (lost on SW termination, that's ok) ────────────────
let sessionAllowed = []; // Domains allowed via appeal this session

// ─── Initialization ──────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async () => {
  await setStorage({ [STORAGE_KEYS.BLOCKING_ENABLED]: true });
  await setupMidnightAlarm();
  await syncRules();
  updateBadge();
});

chrome.runtime.onStartup.addListener(async () => {
  await checkMidnightReset();
  await syncRules();
  updateBadge();
});

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
    await clearAllRules();
  }
  await setupMidnightAlarm();
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'midnightReset') {
    await resetDailyData();
    sessionAllowed = [];
    await clearAllRules();
    updateBadge();
    // Restore manual blocklist rules
    await syncRules();
  } else if (alarm.name === 'pauseEnd') {
    await setStorage({ [STORAGE_KEYS.PAUSE_UNTIL]: null });
    await syncRules();
    updateBadge();
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

// ─── Badge ───────────────────────────────────────────────────────────────────
async function updateBadge() {
  const goal = await getGoal();
  const enabled = await isBlockingEnabled();

  if (!goal) {
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#7C3AED' });
    chrome.action.setTitle({ title: 'Flow — Set your goal for today!' });
  } else if (!enabled) {
    chrome.action.setBadgeText({ text: '⏸' });
    chrome.action.setBadgeBackgroundColor({ color: '#F59E0B' });
    chrome.action.setTitle({ title: 'Flow — Blocking paused' });
  } else {
    chrome.action.setBadgeText({ text: '' });
    chrome.action.setTitle({ title: 'Flow — Focused & blocking' });
  }
}

// ─── Message Handler ─────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg, sender).then(sendResponse).catch((err) => {
    console.error('[Flow] Message error:', err);
    sendResponse({ error: err.message });
  });
  return true; // Keep channel open for async
});

async function handleMessage(msg, sender) {
  switch (msg.type) {

    // ── Set Goal (with optional AI analysis) ──────────────────────────────
    case 'SET_GOAL': {
      const goal = await setGoal(msg.goal);
      sessionAllowed = [];

      const apiKey = await getApiKey();
      let aiBlocklist = [];
      let aiError = null;

      if (apiKey) {
        try {
          aiBlocklist = await analyzeGoal(apiKey, msg.goal);
          await setStorage({ [STORAGE_KEYS.AI_BLOCKLIST]: aiBlocklist });
        } catch (err) {
          aiError = err.message;
        }
      }

      await syncRules();
      updateBadge();

      return { success: true, goal, aiBlocklist, aiError };
    }

    // ── Submit Appeal ──────────────────────────────────────────────────────
    case 'SUBMIT_APPEAL': {
      const { domain, reason } = msg;
      const goal = await getGoal();
      const apiKey = await getApiKey();
      const appealsInfo = await getAppealsInfo();

      if (!apiKey) return { error: 'No API key configured.' };
      if (!goal) return { error: 'No goal set for today.' };
      if (appealsInfo.remaining <= 0) return { error: 'Daily appeal limit reached (15/day).' };

      const verdict = await judgeAppeal(apiKey, goal.text, domain, reason);

      if (verdict.allow) {
        sessionAllowed.push(domain);
        await syncRules();
      }

      await recordAppeal(domain, reason, verdict.reasoning, verdict.allow);
      return { ...verdict, remaining: appealsInfo.remaining - 1 };
    }

    // ── Toggle Blocking ────────────────────────────────────────────────────
    case 'SET_BLOCKING': {
      await setStorage({ [STORAGE_KEYS.BLOCKING_ENABLED]: msg.enabled });
      if (!msg.enabled) {
        await setStorage({ [STORAGE_KEYS.PAUSE_UNTIL]: null });
        await clearAllRules();
      } else {
        await syncRules();
      }
      updateBadge();
      return { success: true };
    }

    // ── Pause Blocking ─────────────────────────────────────────────────────
    case 'PAUSE_BLOCKING': {
      const until = Date.now() + msg.minutes * 60 * 1000;
      await setStorage({
        [STORAGE_KEYS.PAUSE_UNTIL]: until,
        [STORAGE_KEYS.BLOCKING_ENABLED]: true,
      });
      await clearAllRules();
      chrome.alarms.create('pauseEnd', { delayInMinutes: msg.minutes });
      updateBadge();
      return { success: true, pauseUntil: until };
    }

    // ── Update Blocklist/Whitelist ─────────────────────────────────────────
    case 'SYNC_RULES': {
      await syncRules();
      return { success: true };
    }

    // ── Get Full State ─────────────────────────────────────────────────────
    case 'GET_STATE': {
      const [goal, manual, ai, whitelist, apiKey, enabled, appealsInfo, pause] =
        await Promise.all([
          getGoal(),
          getManualBlocklist(),
          getAIBlocklist(),
          getWhitelist(),
          getApiKey(),
          isBlockingEnabled(),
          getAppealsInfo(),
          getStorage([STORAGE_KEYS.PAUSE_UNTIL]),
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
      };
    }

    // ── Record block stat ──────────────────────────────────────────────────
    case 'RECORD_BLOCK': {
      await incrementBlockedStat(msg.domain);
      return { success: true };
    }

    default:
      return { error: `Unknown message type: ${msg.type}` };
  }
}
