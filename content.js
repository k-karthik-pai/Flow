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
  document.documentElement?.appendChild(style);
  const revealTimer = setTimeout(removeHide, 2000);

  try {
    const hostname = window.location.hostname.replace(/^www\./, '');
    const response = await chrome.runtime.sendMessage({
      type: 'CHECK_BLOCKED',
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
    const isSessionAllowed = sessionAllowed.some((entry) => matchesDomain(hostname, entry));
    const isBlocked = response.whitelistOnlyMode
      ? !FlowDomains.essentialDomains.some(d => matchesDomain(hostname, d))
      : allBlocked.some((d) => matchesDomain(hostname, d));

    if (isBlocked && !isWhitelisted && !isSessionAllowed) {
      // Record stat and redirect to blocked page
      const blockedUrl = chrome.runtime.getURL(`blocked.html?site=${encodeURIComponent(hostname)}&url=${encodeURIComponent(window.location.href)}`);
      window.location.replace(blockedUrl);
      return;
    }
  } catch (err) {
    // Service worker might be sleeping — just show the page
    console.debug('[Flow] Content check error:', err);
  }

  clearTimeout(revealTimer);
  removeHide();
})();

function removeHide() {
  const el = document.getElementById('flow-hide');
  if (el) el.remove();
}

function matchesDomain(hostname, entry) {
  return FlowDomains.matchesDomain(hostname, entry);
}
