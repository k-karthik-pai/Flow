// options.js — Flow Settings

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, tag => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[tag]));
}

let state = null;

// ─── Tabs ─────────────────────────────────────────────────────────────────────
document.querySelectorAll('.sb-link').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.sb-link').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
  });
});

// ─── Load ─────────────────────────────────────────────────────────────────────
async function loadAll() {
  state = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
  loadApiTab();
  loadBlocklistTab();
  loadWhitelistTab();
  loadStatsTab();
  loadAppealsTab();
  loadThemeTab();
}

// ─── API Key ──────────────────────────────────────────────────────────────────
function loadApiTab() {
  const badge = document.getElementById('api-status-badge');
  const clearBtn = document.getElementById('btn-clear-key');
  if (state.hasApiKey) {
    badge.textContent = 'Active';
    badge.className = 'badge badge-ok';
    clearBtn.style.display = '';
    document.getElementById('api-key-input').value = '••••••••••••••••';
  } else {
    badge.textContent = 'Not set';
    badge.className = 'badge';
    clearBtn.style.display = 'none';
  }
}

document.getElementById('btn-toggle-key').addEventListener('click', async () => {
  const input = document.getElementById('api-key-input');
  const btn = document.getElementById('btn-toggle-key');
  if (input.type === 'password') {
    const { apiKey } = await chrome.storage.local.get(['apiKey']);
    input.value = apiKey || '';
    input.type = 'text';
    btn.textContent = 'Hide';
  } else {
    input.type = 'password';
    btn.textContent = 'Show';
    if (state.hasApiKey) input.value = '••••••••••••••••';
  }
});

document.getElementById('btn-save-key').addEventListener('click', async () => {
  const input = document.getElementById('api-key-input');
  const key = input.value.trim();
  const err = document.getElementById('api-error');
  const ok = document.getElementById('api-success');
  err.style.display = 'none';
  ok.style.display = 'none';
  if (!key || key.startsWith('•')) { err.textContent = 'Enter a valid key.'; err.style.display = 'block'; return; }
  if (!key.startsWith('AIza')) { err.textContent = 'Gemini keys start with "AIza".'; err.style.display = 'block'; return; }
  await chrome.storage.local.set({ apiKey: key });
  input.type = 'password';
  input.value = '••••••••••••••••';
  document.getElementById('btn-toggle-key').textContent = 'Show';
  ok.style.display = 'block';
  state.hasApiKey = true;
  loadApiTab();
});

document.getElementById('btn-clear-key').addEventListener('click', async () => {
  await chrome.storage.local.remove(['apiKey']);
  document.getElementById('api-key-input').value = '';
  document.getElementById('api-key-input').type = 'password';
  document.getElementById('btn-toggle-key').textContent = 'Show';
  document.getElementById('api-success').style.display = 'none';
  state.hasApiKey = false;
  loadApiTab();
});

// ─── Blocklist ────────────────────────────────────────────────────────────────
function loadBlocklistTab() {
  renderSL(state.manualBlocklist || [], 'manual-sites-list', 'manual-badge', removeManual, false);
  const ai = state.aiBlocklist || [];
  document.getElementById('ai-blocklist-card').style.display = ai.length ? '' : 'none';
  renderSL(ai, 'ai-sites-list', 'ai-badge', null, true);
}

document.getElementById('btn-add-manual').addEventListener('click', addManual);
document.getElementById('manual-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') addManual(); });

async function addManual() {
  const input = document.getElementById('manual-input');
  const domains = input.value.split(',').map((d) => d.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]).filter(Boolean);
  if (!domains.length) return;
  const updated = [...new Set([...(state.manualBlocklist || []), ...domains])];
  await chrome.storage.local.set({ manualBlocklist: updated });
  await chrome.runtime.sendMessage({ type: 'SYNC_RULES' });
  state.manualBlocklist = updated;
  input.value = '';
  loadBlocklistTab();
}

async function removeManual(domain) {
  const updated = (state.manualBlocklist || []).filter((d) => d !== domain);
  await chrome.storage.local.set({ manualBlocklist: updated });
  await chrome.runtime.sendMessage({ type: 'SYNC_RULES' });
  state.manualBlocklist = updated;
  loadBlocklistTab();
}

// ─── Whitelist ────────────────────────────────────────────────────────────────
function loadWhitelistTab() {
  renderSL(state.whitelist || [], 'whitelist-sites-list', 'whitelist-badge', removeWhitelist, false);
}

document.getElementById('btn-add-whitelist').addEventListener('click', addWhitelist);
document.getElementById('whitelist-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') addWhitelist(); });

async function addWhitelist() {
  const input = document.getElementById('whitelist-input');
  const domains = input.value.split(',').map((d) => d.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]).filter(Boolean);
  if (!domains.length) return;
  const updated = [...new Set([...(state.whitelist || []), ...domains])];
  await chrome.storage.local.set({ whitelist: updated });
  await chrome.runtime.sendMessage({ type: 'SYNC_RULES' });
  state.whitelist = updated;
  input.value = '';
  loadWhitelistTab();
}

async function removeWhitelist(domain) {
  const updated = (state.whitelist || []).filter((d) => d !== domain);
  await chrome.storage.local.set({ whitelist: updated });
  await chrome.runtime.sendMessage({ type: 'SYNC_RULES' });
  state.whitelist = updated;
  loadWhitelistTab();
}

// ─── Shared site list renderer ────────────────────────────────────────────────
function renderSL(items, listId, badgeId, onRemove, isAI) {
  const list = document.getElementById(listId);
  const badge = document.getElementById(badgeId);
  if (badge) badge.textContent = items.length;
  list.innerHTML = '';
  if (items.length === 0) {
    list.innerHTML = `<li class="slist-empty">${isAI ? 'No AI blocklist yet' : 'No sites added'}</li>`;
    return;
  }
  items.forEach((item) => {
    const domain = typeof item === 'string' ? item : item.domain;
    const reason = typeof item === 'object' ? item.reason : null;
    const li = document.createElement('li');
    li.className = 'slist-item';
    li.innerHTML = `
      <span class="slist-name">${escapeHTML(domain)}</span>
      ${reason ? `<span class="slist-reason" title="${escapeHTML(reason)}">${escapeHTML(reason)}</span>` : ''}
      ${onRemove ? `<button class="slist-remove"><svg viewBox="0 0 12 12" fill="none"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg></button>` : ''}
    `;
    if (onRemove) li.querySelector('.slist-remove').addEventListener('click', () => onRemove(domain));
    list.appendChild(li);
  });
}

// ─── Stats ────────────────────────────────────────────────────────────────────
function loadStatsTab() {
  const stats = state.stats || {};
  const today = new Date().toISOString().slice(0, 10);
  const todayData = stats[today] || { blocked: 0, topDomains: {} };
  document.getElementById('stat-today').textContent = todayData.blocked || 0;
  let total = 0;
  const allDomains = {};
  Object.values(stats).forEach((day) => {
    total += day.blocked || 0;
    Object.entries(day.topDomains || {}).forEach(([d, c]) => { allDomains[d] = (allDomains[d] || 0) + c; });
  });
  document.getElementById('stat-total').textContent = total;
  let streak = 0;
  const d = new Date();
  while (stats[d.toISOString().slice(0, 10)]?.blocked > 0) { streak++; d.setDate(d.getDate() - 1); }
  document.getElementById('stat-streak').textContent = streak;

  const topList = document.getElementById('top-sites-list');
  const sorted = Object.entries(allDomains).sort((a, b) => b[1] - a[1]).slice(0, 10);
  topList.innerHTML = '';
  if (!sorted.length) { topList.innerHTML = '<li class="slist-empty">No data yet</li>'; return; }
  sorted.forEach(([domain, count]) => {
    const li = document.createElement('li');
    li.className = 'slist-item';
    li.innerHTML = `<span class="slist-name">${domain}</span><span class="slist-reason">${count}×</span>`;
    topList.appendChild(li);
  });
}

// ─── Appeals ──────────────────────────────────────────────────────────────────
function loadAppealsTab() {
  const info = state.appealsInfo || { remaining: 15, appeals: [] };
  const used = 15 - (info.remaining ?? 15);
  document.getElementById('appeals-used').textContent = used;
  document.getElementById('appeals-bar').style.width = `${(used / 15) * 100}%`;
  const list = document.getElementById('appeals-list');
  const appeals = info.appeals || [];
  list.innerHTML = '';
  if (!appeals.length) { list.innerHTML = '<div class="slist-empty" style="padding:16px 20px">No appeals yet</div>'; return; }
  appeals.forEach((a) => {
    const date = new Date(a.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const div = document.createElement('div');
    div.className = 'appeal-item';
    div.innerHTML = `
      <div class="appeal-row1">
        <span class="appeal-domain">${escapeHTML(a.domain)}</span>
        <span class="badge ${a.allowed ? 'badge-ok' : ''}" style="${!a.allowed ? 'background:var(--danger-t);color:var(--danger)' : ''}">${a.allowed ? 'Allowed' : 'Denied'}</span>
        <span class="appeal-date">${date}</span>
      </div>
      <div class="appeal-label">Your reason</div>
      <div class="appeal-text">${escapeHTML(a.userReason)}</div>
      <div class="appeal-label ai">AI verdict</div>
      <div class="appeal-text">${escapeHTML(a.aiVerdict)}</div>
    `;
    list.appendChild(div);
  });
}

// ─── Theme ────────────────────────────────────────────────────────────────────
function loadThemeTab() {
  chrome.storage.local.get(['theme'], (result) => {
    const current = result.theme || 'system';
    document.querySelector(`input[name="theme"][value="${current}"]`).checked = true;
  });
}

document.querySelectorAll('input[name="theme"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    if (radio.checked && window.FlowTheme) {
      window.FlowTheme.setTheme(radio.value);
    }
  });
});

// ─── Init ─────────────────────────────────────────────────────────────────────
loadAll();
