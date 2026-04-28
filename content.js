// content.js — Injected at document_start on all pages
// Immediately hides the page to prevent flash, then checks if blocked

(async () => {
  // Skip extension pages and chrome:// pages
  const url = window.location.href;
  if (url.startsWith('chrome-extension://') || url.startsWith('chrome://') || url.startsWith('chrome-search://')) {
    return;
  }

  // Instantly hide page to prevent flash of blocked content
  const style = document.createElement('style');
  style.id = 'flow-hide';
  style.textContent = 'html { visibility: hidden !important; }';
  document.documentElement.appendChild(style);

  try {
    const hostname = window.location.hostname.replace(/^www\./, '');
    const response = await chrome.runtime.sendMessage({
      type: 'GET_STATE',
    });

    // Check if blocked
    if (!response || !response.blockingEnabled) {
      removeHide();
      return;
    }

    const allBlocked = [
      ...(response.manualBlocklist || []),
      ...(response.aiBlocklist || []).map((e) => (typeof e === 'string' ? e : e.domain)),
    ];
    const whitelist = response.whitelist || [];
    const sessionAllowed = response.sessionAllowed || [];

    const isWhitelisted = whitelist.some((d) => matchesDomain(hostname, d));
    const isSessionAllowed = sessionAllowed.some((d) => matchesDomain(hostname, d));
    const isBlocked = allBlocked.some((d) => matchesDomain(hostname, d));

    if (isBlocked && !isWhitelisted && !isSessionAllowed) {
      // Record stat and redirect to blocked page
      chrome.runtime.sendMessage({ type: 'RECORD_BLOCK', domain: hostname });
      const blockedUrl = chrome.runtime.getURL(`blocked.html?site=${encodeURIComponent(hostname)}`);
      window.location.replace(blockedUrl);
      return;
    }
  } catch (err) {
    // Service worker might be sleeping — just show the page
    console.debug('[Flow] Content check error:', err);
  }

  removeHide();
})();

function removeHide() {
  const el = document.getElementById('flow-hide');
  if (el) el.remove();
}

function matchesDomain(hostname, blockedDomain) {
  const h = hostname.toLowerCase().replace(/^www\./, '');
  const b = blockedDomain.toLowerCase().replace(/^www\./, '');
  return h === b || h.endsWith('.' + b);
}
