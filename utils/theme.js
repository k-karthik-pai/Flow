// utils/theme.js — Flow Theme System (light / dark / system)
// This is NOT an ES module — it's loaded via <script> in HTML pages.

(function () {
  const STORAGE_KEY = 'theme';
  const CLASS_LIGHT = 'light';
  const CLASS_DARK = 'dark';

  function getSystemPref() {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(mode) {
    const resolved = mode === 'system' ? getSystemPref() : mode;
    document.documentElement.classList.remove(CLASS_LIGHT, CLASS_DARK);
    document.documentElement.classList.add(resolved);
    document.documentElement.setAttribute('data-theme', resolved);
  }

  function loadAndApply() {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      const mode = result[STORAGE_KEY] || 'system';
      applyTheme(mode);
    });
  }

  function setTheme(mode) {
    chrome.storage.local.set({ [STORAGE_KEY]: mode });
    applyTheme(mode);
  }

  // Listen for system theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      if ((result[STORAGE_KEY] || 'system') === 'system') {
        applyTheme('system');
      }
    });
  });

  // Apply immediately
  loadAndApply();

  // Expose globally
  window.FlowTheme = { setTheme, loadAndApply, getSystemPref };
})();
