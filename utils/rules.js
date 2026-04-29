// utils/rules.js — declarativeNetRequest Dynamic Rule Management

// Rule ID ranges
const WHITELIST_ID_START = 10000;
const MANUAL_BLOCK_ID_START = 20000;
const AI_BLOCK_ID_START = 30000;
const SESSION_ALLOW_ID_START = 40000; // Temporarily allowed after appeal

const BLOCKED_PAGE_PATH = '/blocked.html';

function escapeRegexDomain(domain) {
  return domain.replace(/\./g, '\\.').replace(/-/g, '\\-');
}

function getDomainRegex(domain) {
  // Extract base domain name (e.g. "wikipedia" from "wikipedia.com")
  // We look for the last part of the domain to determine what to strip
  const parts = domain.split('.');
  let baseName = domain;
  
  if (parts.length >= 2) {
    // If it's something like wikipedia.com or google.co.uk
    // We'll take the first part as the base name if it's a simple domain
    // or use a more robust way to match "wikipedia" regardless of .com/.org
    baseName = parts[0];
  }

  const escaped = baseName.replace(/\./g, '\\.').replace(/-/g, '\\-');
  // This regex matches: (any subdomains) + baseName + . (any TLD)
  return `^https?://([a-z0-9\\-]+\\.)*${escaped}\\.[a-z]{2,}(/.*)?$`;
}

function getRedirectUrl(domain) {
  const base = chrome.runtime.getURL(BLOCKED_PAGE_PATH);
  return `${base}?site=${encodeURIComponent(domain)}`;
}

function makeBlockRule(domain, ruleId) {
  return {
    id: ruleId,
    priority: 1,
    action: {
      type: 'redirect',
      redirect: { url: getRedirectUrl(domain) },
    },
    condition: {
      regexFilter: getDomainRegex(domain),
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
      resourceTypes: ['main_frame'],
    },
  };
}

function makeSessionAllowRule(domain, ruleId) {
  return {
    id: ruleId,
    priority: 10,
    action: { type: 'allow' },
    condition: {
      regexFilter: getDomainRegex(domain),
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
 * @param {string[]} manualBlocklist - Manually blocked domains
 * @param {Array<{domain: string}>} aiBlocklist - AI-blocked domains
 * @param {string[]} whitelist - Always-allow domains
 * @param {string[]} sessionAllowed - Domains allowed via appeal this session
 */
export async function updateAllRules(
  manualBlocklist = [],
  aiBlocklist = [],
  whitelist = [],
  sessionAllowed = []
) {
  const existingIds = await getAllExistingRuleIds();

  const newRules = [];

  // Whitelist rules (highest priority)
  whitelist.forEach((domain, i) => {
    newRules.push(makeWhitelistRule(domain, WHITELIST_ID_START + i));
  });

  // Session-allowed rules (also high priority)
  sessionAllowed.forEach((domain, i) => {
    newRules.push(makeSessionAllowRule(domain, SESSION_ALLOW_ID_START + i));
  });

  // Manual block rules
  manualBlocklist.forEach((domain, i) => {
    newRules.push(makeBlockRule(domain, MANUAL_BLOCK_ID_START + i));
  });

  // AI block rules
  aiBlocklist.forEach((entry, i) => {
    const domain = typeof entry === 'string' ? entry : entry.domain;
    newRules.push(makeBlockRule(domain, AI_BLOCK_ID_START + i));
  });

  const newIds = newRules.map((r) => r.id);
  const toRemove = existingIds.filter((id) => !newIds.includes(id));

  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existingIds, // Remove all first, then add fresh
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

/**
 * Returns all currently active dynamic rules.
 */
export async function getActiveRules() {
  return chrome.declarativeNetRequest.getDynamicRules();
}
