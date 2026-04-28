// options.js — Flow Options Page Logic

let state = null;

// ─── Tab Navigation ───────────────────────────────────────────────────────────
document.querySelectorAll('.nav-link').forEach((link) => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const tab = link.dataset.tab;
    document.querySelectorAll('.nav-link').forEach((l) => l.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    link.classList.add('active');
    document.getElementById(`tab-${tab}`).classList.add('active');
  });
});

// ─── Load All State ───────────────────────────────────────────────────────────
async function loadAll() {
  state = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
  loadApiTab();
  loadBlocklistTab();
  loadWhitelistTab();
  loadStatsTab();
  loadAppealsTab();
}

// ─── API Key Tab ──────────────────────────────────────────────────────────────
function loadApiTab() {
  const badge = document.getElementById('api-status-badge');
  const clearBtn = document.getElementById('btn-clear-key');
  if (state.hasApiKey) {
    badge.textContent = 'Configured ✓';
    badge.className = 'badge active';
    clearBtn.style.display = 'inline-flex';
    document.getElementById('api-key-input').value = '••••••••••••••••';
  } else {
    badge.textContent = 'Not configured';
    badge.className = 'badge';
    clearBtn.style.display = 'none';
  }
}

// Toggle key visibility
document.getElementById('btn-toggle-key').addEventListener('click', async () => {
  const input = document.getElementById('api-key-input');
  if (input.type === 'password') {
    // Show real key from storage
    const { apiKey } = await chrome.storage.local.get(['apiKey']);
    input.value = apiKey || '';
    input.type = 'text';
  } else {
    input.type = 'password';
    if (state.hasApiKey) input.value = '••••••••••••••••';
  }
});

document.getElementById('btn-save-key').addEventListener('click', async () => {
  const input = document.getElementById('api-key-input');
  const key = input.value.trim();
  const errorEl = document.getElementById('api-error');
  const successEl = document.getElementById('api-success');
  errorEl.style.display = 'none';
  successEl.style.display = 'none';

  if (!key || key.startsWith('•')) { errorEl.textContent = 'Please enter a valid API key.'; errorEl.style.display = 'block'; return; }
  if (!key.startsWith('AIza')) { errorEl.textContent = 'Gemini keys start with "AIza". Double check your key.'; errorEl.style.display = 'block'; return; }

  await chrome.storage.local.set({ apiKey: key });
  input.type = 'password';
  input.value = '••••••••••••••••';
  successEl.style.display = 'block';
  state.hasApiKey = true;
  loadApiTab();
});

document.getElementById('btn-clear-key').addEventListener('click', async () => {
  await chrome.storage.local.remove(['apiKey']);
  document.getElementById('api-key-input').value = '';
  document.getElementById('api-success').style.display = 'none';
  state.hasApiKey = false;
  loadApiTab();
});

// ─── Blocklist Tab ────────────────────────────────────────────────────────────
function loadBlocklistTab() {
  renderSiteList(state.manualBlocklist || [], 'manual-sites-list', 'manual-badge', removeManual, false);
  const ai = state.aiBlocklist || [];
  document.getElementById('ai-blocklist-card').style.display = ai.length > 0 ? 'block' : 'none';
  renderSiteList(ai, 'ai-sites-list', 'ai-badge', null, true);
}

document.getElementById('btn-add-manual').addEventListener('click', addManual);
document.getElementById('manual-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') addManual(); });

async function addManual() {
  const input = document.getElementById('manual-input');
  const raw = input.value.trim().toLowerCase();
  const domains = raw.split(',').map((d) => d.trim().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]).filter(Boolean);
  if (!domains.length) return;
  const current = state.manualBlocklist || [];
  const updated = [...new Set([...current, ...domains])];
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

// ─── Whitelist Tab ────────────────────────────────────────────────────────────
function loadWhitelistTab() {
  renderSiteList(state.whitelist || [], 'whitelist-sites-list', 'whitelist-badge', removeWhitelist, false);
}

document.getElementById('btn-add-whitelist').addEventListener('click', addWhitelist);
document.getElementById('whitelist-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') addWhitelist(); });

async function addWhitelist() {
  const input = document.getElementById('whitelist-input');
  const raw = input.value.trim().toLowerCase();
  const domains = raw.split(',').map((d) => d.trim().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]).filter(Boolean);
  if (!domains.length) return;
  const current = state.whitelist || [];
  const updated = [...new Set([...current, ...domains])];
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

// ─── Generic Site List Renderer ───────────────────────────────────────────────
function renderSiteList(items, listId, badgeId, onRemove, isAI) {
  const list = document.getElementById(listId);
  const badge = document.getElementById(badgeId);
  if (badge) badge.textContent = `${items.length} site${items.length !== 1 ? 's' : ''}`;
  list.innerHTML = '';

  if (items.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty-state';
    li.textContent = isAI ? 'No AI blocklist generated yet.' : 'No sites added yet.';
    list.appendChild(li);
    return;
  }

  items.forEach((item) => {
    const domain = typeof item === 'string' ? item : item.domain;
    const reason = typeof item === 'object' ? item.reason : null;
    const li = document.createElement('li');
    li.className = 'site-item';
    li.innerHTML = `
      <span class="site-name">${domain}</span>
      ${reason ? `<span class="site-reason" title="${reason}">${reason}</span>` : ''}
      ${onRemove ? `<button class="btn-remove" title="Remove">✕</button>` : ''}
    `;
    if (onRemove) {
      li.querySelector('.btn-remove').addEventListener('click', () => onRemove(domain));
    }
    list.appendChild(li);
  });
}

// ─── Stats Tab ────────────────────────────────────────────────────────────────
function loadStatsTab() {
  const { stats } = state;
  const today = new Date().toISOString().slice(0, 10);
  const todayData = stats?.[today] || { blocked: 0, topDomains: {} };

  document.getElementById('stat-today').textContent = todayData.blocked || 0;

  // Total
  let total = 0;
  const allDomains = {};
  Object.values(stats || {}).forEach((day) => {
    total += day.blocked || 0;
    Object.entries(day.topDomains || {}).forEach(([d, c]) => { allDomains[d] = (allDomains[d] || 0) + c; });
  });
  document.getElementById('stat-total').textContent = total;

  // Streak
  let streak = 0;
  const d = new Date();
  while (true) {
    const key = d.toISOString().slice(0, 10);
    if (stats?.[key]?.blocked > 0) { streak++; d.setDate(d.getDate() - 1); } else break;
  }
  document.getElementById('stat-streak').textContent = streak;

  // Top sites
  const topList = document.getElementById('top-sites-list');
  const sorted = Object.entries(allDomains).sort((a, b) => b[1] - a[1]).slice(0, 10);
  topList.innerHTML = '';
  if (!sorted.length) {
    topList.innerHTML = '<li class="empty-state">No data yet.</li>';
  } else {
    sorted.forEach(([domain, count]) => {
      const li = document.createElement('li');
      li.className = 'site-item';
      li.innerHTML = `<span class="site-name">${domain}</span><span class="site-reason">${count} block${count !== 1 ? 's' : ''}</span>`;
      topList.appendChild(li);
    });
  }
}

// ─── Appeals Tab ─────────────────────────────────────────────────────────────
function loadAppealsTab() {
  const info = state.appealsInfo || { appealsToday: 0, remaining: 15, appeals: [] };
  const used = 15 - (info.remaining ?? 15);
  document.getElementById('appeals-used').textContent = used;
  document.getElementById('appeals-bar').style.width = `${(used / 15) * 100}%`;

  const list = document.getElementById('appeals-list');
  const appeals = info.appeals || [];
  list.innerHTML = '';

  if (!appeals.length) {
    list.innerHTML = '<div class="empty-state">No appeals submitted yet.</div>';
    return;
  }

  appeals.forEach((a) => {
    const date = new Date(a.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const div = document.createElement('div');
    div.className = 'appeal-item';
    div.innerHTML = `
      <div class="appeal-meta">
        <span class="appeal-domain">${a.domain}</span>
        <span class="appeal-verdict ${a.allowed ? 'allow' : 'deny'}">${a.allowed ? 'Allowed' : 'Denied'}</span>
        <span class="appeal-date">${date}</span>
      </div>
      <div class="appeal-reason-label">Your reason</div>
      <div class="appeal-reason-text">${a.userReason}</div>
      <div class="appeal-ai-reasoning">🤖 ${a.aiVerdict}</div>
    `;
    list.appendChild(div);
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────
loadAll();
