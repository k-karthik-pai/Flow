// Shared by classic content scripts and extension modules.
(() => {
  function normalizeDomain(value) {
    if (typeof value !== 'string' || !value.trim() || /\s/.test(value)) return null;
    try {
      const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
      const domain = url.hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
      if (domain.length > 253 || !domain.split('.').every(p => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(p))) return null;
      return domain;
    } catch { return null; }
  }
  function matchesDomain(hostname, entry) {
    const domain = normalizeDomain(entry);
    const host = normalizeDomain(hostname);
    return Boolean(domain && host && (host === domain || host.endsWith(`.${domain}`)));
  }
  const essentialDomains = ['google.com', 'google.co.in', 'google.co.uk', 'bing.com', 'duckduckgo.com', 'yahoo.com', 'localhost', '127.0.0.1'];
  globalThis.FlowDomains = Object.freeze({ normalizeDomain, matchesDomain, essentialDomains });
})();
