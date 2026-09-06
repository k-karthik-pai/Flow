import './utils/domains.js';
const { matchesDomain, normalizeDomain } = FlowDomains;
// background.js — Flow Service Worker (ES Module)
import {
  getGoal, setGoal, getManualBlocklist, getAIBlocklist, getWhitelist,
  getApiKey, isBlockingEnabled, getAppealsInfo, recordAppeal,
  incrementBlockedStat, resetDailyData, setStorage, getStorage,
  STORAGE_KEYS, getTodayString, getWhitelistOnlyMode,
} from './utils/storage.js';
import { analyzeGoal, judgeAppeal, evaluateDomainDynamically } from './utils/ai.js';
import { updateAllRules, clearAllRules } from './utils/rules.js';

// ─── Session-level state ─────────────────────────────────────────────────────
// Service workers go to sleep, so we must persist session state in chrome.storage.session
async function getSessionState() {
  const res = await chrome.storage.session.get(['sessionAllowed', 'goalTabOpened', 'evaluatedDomains']);
  return {
    sessionAllowed: res.sessionAllowed || [],
    goalTabOpened: res.goalTabOpened || false,
    evaluatedDomains: res.evaluatedDomains || {}
  };
}

async function updateSessionState(updates) {
  await chrome.storage.session.set(updates);
}

// Essential domains that should never be evaluated or blocked dynamically
const ESSENTIAL_DOMAINS = FlowDomains.essentialDomains;
const goalIdentity = goal => goal?.revision || goal?.setAt || null;
let stateQueue = Promise.resolve();
function mutateSession(fn) {
  const task = stateQueue.then(async () => {
    const state = await getSessionState();
    await updateSessionState(await fn(state));
  });
  stateQueue = task.catch(() => {});
  return task;
}

// ─── Initialization ──────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  await checkMidnightReset();
  await restorePauseAlarm();
  await syncRules();
});

chrome.runtime.onStartup.addListener(async () => {
  await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  await checkMidnightReset();
  await restorePauseAlarm();
  await syncRules();
  // Only open goal tab if: API key exists AND no goal set today
  await maybeOpenGoalTab();
});

// ─── Open goal tab only for API key users with no goal today ─────────────────
async function maybeOpenGoalTab() {
  const state = await getSessionState();
  if (state.goalTabOpened) return;
  const apiKey = await getApiKey();
  if (!apiKey) return; // no API key → don't bother user at all
  const goal = await getGoal();
  if (goal) return; // already set today
  await updateSessionState({ goalTabOpened: true });
  const url = chrome.runtime.getURL('newtab/newtab.html');
  chrome.tabs.create({ url, active: true });
}

// ─── Midnight Reset Alarm ────────────────────────────────────────────────────
async function setupMidnightAlarm() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const delayMinutes = (midnight - now) / 60000;
  await chrome.alarms.create('midnightReset', {
    delayInMinutes: delayMinutes,
  });
}

async function checkMidnightReset() {
  const { goal, dailyResetDate } = await getStorage([STORAGE_KEYS.GOAL, 'dailyResetDate']);
  if ((dailyResetDate && dailyResetDate !== getTodayString()) || (goal && goal.date !== getTodayString())) {
    await resetDailyData();
    await updateSessionState({ sessionAllowed: [], evaluatedDomains: {} });
    await clearAllRules();
    // Re-apply manual blocklist (always active)
    await syncRules();
  }
  await setStorage({ dailyResetDate: getTodayString() });
  await setupMidnightAlarm();
}

async function restorePauseAlarm() {
  const { pauseUntil } = await getStorage([STORAGE_KEYS.PAUSE_UNTIL]);
  if (pauseUntil > Date.now()) await chrome.alarms.create('pauseEnd', { when: pauseUntil });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'midnightReset') {
    await checkMidnightReset();
    await updateSessionState({ goalTabOpened: false });
  } else if (alarm.name === 'pauseEnd') {
    await setStorage({ [STORAGE_KEYS.PAUSE_UNTIL]: null });
    await syncRules();
  }
});

// ─── Rule Sync ───────────────────────────────────────────────────────────────
let syncQueue = Promise.resolve();

async function syncRules() {
  const task = syncQueue.then(async () => {
    const enabled = await isBlockingEnabled();
    if (!enabled) {
      await clearAllRules();
      return;
    }
    const [manual, ai, whitelist, whitelistOnlyMode] = await Promise.all([
      getManualBlocklist(),
      getAIBlocklist(),
      getWhitelist(),
      getWhitelistOnlyMode(),
    ]);
    const { sessionAllowed } = await getSessionState();
    await updateAllRules(manual, ai, whitelist, sessionAllowed, whitelistOnlyMode);
  });
  syncQueue = task.catch((err) => console.error('[Flow] Sync rules error:', err));
  return task;
}

// ─── Message Handler ─────────────────────────────────────────────────────────
let appealQueue = Promise.resolve();
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const task = msg?.type === 'SUBMIT_APPEAL' ? appealQueue.then(() => handleMessage(msg, sender)) : handleMessage(msg, sender);
  if (msg?.type === 'SUBMIT_APPEAL') appealQueue = task.catch(() => {});
  task.then(sendResponse).catch((err) => {
    console.error('[Flow] Message error:', err);
    sendResponse({ error: err.message });
  });
  return true;
});

async function handleMessage(msg, sender) {
  if (!msg || typeof msg.type !== 'string') throw new Error('Invalid message.');
  const trusted = sender.id === chrome.runtime.id && sender.url?.startsWith(chrome.runtime.getURL(''));
  if (!trusted && !['CHECK_BLOCKED', 'RECORD_BLOCK'].includes(msg.type)) throw new Error('Message not allowed.');
  switch (msg.type) {

    case 'SET_GOAL': {
      if (msg.goal !== null && (typeof msg.goal !== 'string' || !msg.goal.trim() || msg.goal.length > 300)) throw new Error('Enter a goal of 1–300 characters.');
      const goal = await setGoal(msg.goal?.trim() || null);
      await setStorage({ [STORAGE_KEYS.AI_BLOCKLIST]: [] });
      await updateSessionState({ sessionAllowed: [], evaluatedDomains: {} });
      
      if (!msg.goal) {
        await setStorage({ [STORAGE_KEYS.AI_BLOCKLIST]: [] });
        await syncRules();
        return { success: true, goal: null };
      }
      
      // Run AI analysis asynchronously so the UI transitions immediately
      getApiKey().then(async (apiKey) => {
        if (apiKey) {
          try {
            const aiBlocklist = await analyzeGoal(apiKey, msg.goal);
            if (goalIdentity(await getGoal()) !== goalIdentity(goal) || await getApiKey() !== apiKey) return;
            await setStorage({ [STORAGE_KEYS.AI_BLOCKLIST]: aiBlocklist });
            await syncRules();
          } catch (err) {
            console.error('[Flow] AI analysis failed:', err);
          }
        }
      }).catch(err => console.error('[Flow] Goal analysis failed:', err));

      await syncRules();
      return { success: true, goal };
    }

    case 'SUBMIT_APPEAL': {
      const { reason } = msg;
      const domain = normalizeDomain(msg.domain);
      const url = new URL(msg.url);
      if (!domain || !['http:', 'https:'].includes(url.protocol) || !matchesDomain(url.hostname, domain) || typeof reason !== 'string' || !reason.trim() || reason.length > 500) throw new Error('Invalid appeal.');
      const goal = await getGoal();
      const apiKey = await getApiKey();
      const appealsInfo = await getAppealsInfo();
      if (!apiKey) return { error: 'No API key configured.' };
      if (!goal) return { error: 'No goal set for today.' };
      if (appealsInfo.remaining <= 0) return { error: 'Daily appeal limit reached (15/day).' };
      try {
        const verdict = await judgeAppeal(apiKey, goal.text, domain, reason);
        if (goalIdentity(await getGoal()) !== goalIdentity(goal) || await getApiKey() !== apiKey) throw new Error('Your goal or API key changed. Please try again.');
        if (verdict.allow) {
          await mutateSession(state => {
            const sessionAllowed = [...new Set([...state.sessionAllowed, domain])].slice(-300);
            const evaluatedDomains = { ...state.evaluatedDomains };
            for (const key of Object.keys(evaluatedDomains)) {
              if (matchesDomain(key, domain)) evaluatedDomains[key] = 'allowed';
            }
            return { sessionAllowed, evaluatedDomains };
          });
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
      if (typeof msg.enabled !== 'boolean') throw new Error('Invalid blocking setting.');
      await chrome.alarms.clear('pauseEnd');
      await setStorage({ [STORAGE_KEYS.BLOCKING_ENABLED]: msg.enabled, [STORAGE_KEYS.PAUSE_UNTIL]: null });
      if (!msg.enabled) {
        await setStorage({ [STORAGE_KEYS.PAUSE_UNTIL]: null });
        await clearAllRules();
      } else {
        await syncRules();
      }
      return { success: true };
    }

    case 'PAUSE_BLOCKING': {
      if (!Number.isFinite(msg.minutes) || msg.minutes < 1 || msg.minutes > 1440) throw new Error('Invalid pause duration.');
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

    case 'SET_WHITELIST_ONLY_MODE': {
      await setStorage({ [STORAGE_KEYS.WHITELIST_ONLY_MODE]: Boolean(msg.enabled) });
      await syncRules();
      return { success: true };
    }

    case 'GET_STATE': {
      const [goal, manual, ai, whitelist, apiKey, enabled, appealsInfo, pause, stats, state, whitelistOnlyMode] =
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
          getSessionState(),
          getWhitelistOnlyMode(),
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
        sessionAllowed: state.sessionAllowed,
        stats: stats.stats || {},
        whitelistOnlyMode,
      };
    }

    case 'CHECK_BLOCKED': {
      const [enabled, manual, ai, whitelist, apiKey, goal, state, whitelistOnlyMode] = await Promise.all([
        isBlockingEnabled(),
        getManualBlocklist(),
        getAIBlocklist(),
        getWhitelist(),
        getApiKey(),
        getGoal(),
        getSessionState(),
        getWhitelistOnlyMode(),
      ]);
      return {
        blockingEnabled: enabled,
        manualBlocklist: manual,
        aiBlocklist: ai,
        whitelist,
        sessionAllowed: state.sessionAllowed,
        whitelistOnlyMode,
      };
    }

    case 'RECORD_BLOCK': {
      const domain = normalizeDomain(msg.domain);
      if (!domain) throw new Error('Invalid domain.');
      await incrementBlockedStat(domain);
      return { success: true };
    }

    default:
      return { error: `Unknown message type: ${msg.type}` };
  }
}

// ─── Dynamic AI Evaluation ───────────────────────────────────────────────────
const inFlight = new Set();
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if ((changeInfo.status === 'complete' || changeInfo.url) && /^https?:\/\//.test(tab.url || '')) {
    evaluateTab(tabId, tab).catch(err => console.error('[Flow] Evaluation failed:', err));
  }
});

async function evaluateTab(tabId, tab) {
  if (!await isBlockingEnabled()) return;
  const [apiKey, goal, manual, ai, whitelist, strict, state] = await Promise.all([
    getApiKey(), getGoal(), getManualBlocklist(), getAIBlocklist(), getWhitelist(), getWhitelistOnlyMode(), getSessionState()
  ]);
  const domain = normalizeDomain(tab.url);
  const bypass = entries => entries.some(d => matchesDomain(domain, d));
  if (bypass(whitelist) || bypass(state.sessionAllowed)) return;
  if (strict) {
    if (!bypass(ESSENTIAL_DOMAINS)) await redirectIfCurrent();
    return;
  }
  if (!apiKey || !goal || bypass(ESSENTIAL_DOMAINS)) return;
  if (bypass(manual) || bypass(ai.map(e => typeof e === 'string' ? e : e.domain))) return;
  const cached = state.evaluatedDomains[tab.url];
  if (cached === 'allowed') return;
  if (cached === 'blocked') { await redirectIfCurrent(); return; }
  const key = `${goal.revision || goal.setAt}:${tab.url}`;
  if (inFlight.has(key)) return;
  inFlight.add(key);
  try {
    const distracting = await evaluateDomainDynamically(apiKey, goal.text, domain, tab.url, tab.title);
    if (goalIdentity(await getGoal()) !== goalIdentity(goal) || await getApiKey() !== apiKey) return;
    await mutateSession(latest => {
      if (latest.sessionAllowed.some(d => matchesDomain(domain, d))) return {};
      const entries = { ...latest.evaluatedDomains, [tab.url]: distracting ? 'blocked' : 'allowed' };
      return { evaluatedDomains: Object.fromEntries(Object.entries(entries).slice(-500)) };
    });
    if (distracting) await redirectIfCurrent();
  } finally { inFlight.delete(key); }

  async function redirectIfCurrent() {
    const [current, enabled, currentGoal, currentKey, currentWhitelist, currentState, currentStrict] = await Promise.all([
      chrome.tabs.get(tabId), isBlockingEnabled(), getGoal(), getApiKey(), getWhitelist(), getSessionState(), getWhitelistOnlyMode()
    ]);
    if (current.url !== tab.url || !enabled || currentStrict !== strict) return;
    if (!strict && (goalIdentity(currentGoal) !== goalIdentity(goal) || currentKey !== apiKey)) return;
    if ([...currentWhitelist, ...currentState.sessionAllowed].some(d => matchesDomain(domain, d))) return;
    await chrome.tabs.update(tabId, { url: chrome.runtime.getURL(`blocked.html?site=${encodeURIComponent(domain)}&url=${encodeURIComponent(tab.url)}`) });
  }
}
