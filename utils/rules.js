import './domains.js';
// utils/rules.js — declarativeNetRequest Dynamic Rule Management

// Rule ID ranges
const WHITELIST_ID_START = 10000;
const MANUAL_BLOCK_ID_START = 20000;
const AI_BLOCK_ID_START = 30000;
const SESSION_ALLOW_ID_START = 40000; // Temporarily allowed after appeal

const BLOCKED_PAGE_PATH = '/blocked.html';

function getDomainRegex(domain) {
  const cleaned = FlowDomains.normalizeDomain(domain);
  if (!cleaned) throw new Error('Invalid domain in site list.');
  const escaped = cleaned.replace(/\./g, '\\.');
  return `^https?://([a-z0-9-]+\\.)*${escaped}\\.?(:[0-9]+)?(/.*)?$`;
}

function makeBlockRule(domain, ruleId) {
  const base = chrome.runtime.getURL(BLOCKED_PAGE_PATH);
  // \\0 represents the entire matched URL in the regexSubstitution
  const regexSub = `${base}?site=${encodeURIComponent(domain)}&raw=\\0`;
  return {
    id: ruleId,
    priority: 1,
    action: {
      type: 'redirect',
      redirect: { regexSubstitution: regexSub },
    },
    condition: {
      regexFilter: getDomainRegex(domain),
      isUrlFilterCaseSensitive: false,
      resourceTypes: ['main_frame'],
    },
  };
}

function makeWhitelistRule(domain, ruleId) {
  return {
    id: ruleId,
    priority: 10, // Higher priority overrides block rules
    action: { type: 'allow' },
    condition: {
      regexFilter: getDomainRegex(domain),
      isUrlFilterCaseSensitive: false,
      resourceTypes: ['main_frame'],
    },
  };
}

const ESSENTIAL_ALLOW_ID_START = 50000;
const WHITELIST_ONLY_BLOCK_ID = 60000;

const ESSENTIAL_DOMAINS = FlowDomains.essentialDomains;

function makeSessionAllowRule(item, ruleId) {
  let domain = item;
  if (item.startsWith('http')) {
    try {
      domain = new URL(item).hostname.replace(/^www\./, '');
    } catch {
      domain = item;
    }
  }
  return makeWhitelistRule(domain, ruleId);
}

function makeCatchAllBlockRule(ruleId) {
  const base = chrome.runtime.getURL(BLOCKED_PAGE_PATH);
  const regexSub = `${base}?site=non-whitelisted&raw=\\0`;
  return {
    id: ruleId,
    priority: 2,
    action: {
      type: 'redirect',
      redirect: { regexSubstitution: regexSub },
    },
    condition: {
      regexFilter: '^https?://.*$',
      resourceTypes: ['main_frame'],
    },
  };
}

async function getAllExistingRuleIds() {
  const rules = await chrome.declarativeNetRequest.getDynamicRules();
  return rules.map((r) => r.id);
}

/**
 * Syncs all blocking and whitelist rules with the current lists.
 */
export async function updateAllRules(
  manualBlocklist = [],
  aiBlocklist = [],
  whitelist = [],
  sessionAllowed = [],
  whitelistOnlyMode = false
) {
  // Ignore malformed legacy/AI entries so one bad value cannot disable all rules.
  const domains = entries => [...new Set(entries.map(d => FlowDomains.normalizeDomain(d)).filter(Boolean))];
  manualBlocklist = domains(manualBlocklist);
  whitelist = domains(whitelist);
  sessionAllowed = domains(sessionAllowed);
  aiBlocklist = domains(aiBlocklist.map(e => typeof e === 'string' ? e : e?.domain));
  const existingIds = await getAllExistingRuleIds();

  const newRules = [];

  // Whitelist rules (highest priority: 10)
  whitelist.forEach((domain, i) => {
    newRules.push(makeWhitelistRule(domain, WHITELIST_ID_START + i));
  });

  // Session-allowed rules (highest priority: 10)
  sessionAllowed.forEach((item, i) => {
    newRules.push(makeSessionAllowRule(item, SESSION_ALLOW_ID_START + i));
  });

  if (whitelistOnlyMode) {
    // In Whitelist-Only mode, allow essential domains at priority 10
    ESSENTIAL_DOMAINS.forEach((domain, i) => {
      newRules.push(makeWhitelistRule(domain, ESSENTIAL_ALLOW_ID_START + i));
    });
    // And block everything else at priority 2
    newRules.push(makeCatchAllBlockRule(WHITELIST_ONLY_BLOCK_ID));
  } else {
    // Normal Blacklist Mode
    manualBlocklist.forEach((domain, i) => {
      newRules.push(makeBlockRule(domain, MANUAL_BLOCK_ID_START + i));
    });

    aiBlocklist.forEach((entry, i) => {
      const domain = typeof entry === 'string' ? entry : entry.domain;
      newRules.push(makeBlockRule(domain, AI_BLOCK_ID_START + i));
    });
  }



  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existingIds,
      addRules: newRules,
    });
  } catch (err) {
    console.error('[Flow] Rule update error:', err);
    throw err;
  }
}

/**
 * Clears all blocking rules (used when blocking is paused/disabled).
 */
export async function clearAllRules() {
  const existingIds = await getAllExistingRuleIds();
  if (existingIds.length > 0) {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existingIds,
      addRules: [],
    });
  }
}

