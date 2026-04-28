// popup.js — Flow Extension Popup Logic

let state = null;

// ─── Load State ───────────────────────────────────────────────────────────────
async function loadState() {
  try {
    state = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
    renderUI();
  } catch (err) {
    document.getElementById('status-text').textContent = 'Error loading state';
  }
}

function renderUI() {
  if (!state) return;

  // Goal section
  if (state.goal) {
    document.getElementById('section-set-goal').style.display = 'none';
    document.getElementById('section-active-goal').style.display = 'flex';
    document.getElementById('active-goal-text').textContent = state.goal.text;
  } else {
    document.getElementById('section-set-goal').style.display = 'block';
    document.getElementById('section-active-goal').style.display = 'none';
  }

  // Status
  const dot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const statChip = document.getElementById('stat-chip');

  if (state.pauseUntil && Date.now() < state.pauseUntil) {
    const mins = Math.ceil((state.pauseUntil - Date.now()) / 60000);
    dot.className = 'status-indicator paused';
    statusText.textContent = `Paused · ${mins}m remaining`;
  } else if (!state.blockingEnabled) {
    dot.className = 'status-indicator off';
    statusText.textContent = 'Blocking off';
  } else {
    dot.className = 'status-indicator' + (state.goal ? ' on' : ' off');
    statusText.textContent = state.goal ? 'Blocking active' : 'Waiting for goal';
  }

  // Stat chip
  const totalBlocked = (state.manualBlocklist?.length || 0) + (state.aiBlocklist?.length || 0);
  if (totalBlocked > 0) { statChip.textContent = `${totalBlocked} sites`; statChip.style.display = ''; }

  // API key banner
  document.getElementById('api-banner').style.display = !state.hasApiKey ? 'flex' : 'none';

  // Controls
  document.getElementById('controls').style.display = 'block';
  document.getElementById('btn-toggle-off').style.display = state.blockingEnabled ? '' : 'none';
  document.getElementById('btn-toggle-on').style.display = !state.blockingEnabled ? '' : 'none';

  // Manual blocklist
  renderBlocklist(state.manualBlocklist || [], 'manual-list', 'manual-count', false);

  // AI blocklist
  const aiList = state.aiBlocklist || [];
  if (aiList.length > 0 && state.hasApiKey) {
    document.getElementById('ai-section').style.display = 'block';
    renderBlocklist(aiList, 'ai-list', 'ai-count', true);
  }
}

function renderBlocklist(items, listId, countId, isAI) {
  const list = document.getElementById(listId);
  const countEl = document.getElementById(countId);
  if (countEl) countEl.textContent = items.length;

  list.innerHTML = '';
  if (items.length === 0) {
    const li = document.createElement('li');
    li.className = 'list-empty';
    li.textContent = isAI ? 'No AI sites yet' : 'No sites added yet';
    list.appendChild(li);
    return;
  }

  items.forEach((item, idx) => {
    const domain = typeof item === 'string' ? item : item.domain;
    const reason = typeof item === 'object' && item.reason ? item.reason : null;
    const li = document.createElement('li');
    li.className = `site-item${isAI ? ' ai' : ''}`;
    li.innerHTML = `
      <div class="site-dot"></div>
      <span class="site-name">${domain}</span>
      ${reason ? `<span class="site-reason" title="${reason}">${reason}</span>` : ''}
      ${!isAI ? `<button class="remove-btn" data-index="${idx}" aria-label="Remove">✕</button>` : ''}
    `;
    list.appendChild(li);
  });

  if (!isAI) {
    list.querySelectorAll('.remove-btn').forEach((btn) => {
      btn.addEventListener('click', () => removeSite(parseInt(btn.dataset.index)));
    });
  }
}

// ─── Set Goal ─────────────────────────────────────────────────────────────────
document.getElementById('btn-set-goal').addEventListener('click', submitGoal);
document.getElementById('goal-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitGoal(); }
});

async function submitGoal() {
  const text = document.getElementById('goal-input').value.trim();
  if (!text) return;

  setGoalLoading(true);
  document.getElementById('goal-error').style.display = 'none';

  try {
    const result = await chrome.runtime.sendMessage({ type: 'SET_GOAL', goal: text });
    state = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
    renderUI();
  } catch (err) {
    document.getElementById('goal-error').textContent = err.message;
    document.getElementById('goal-error').style.display = 'block';
  } finally {
    setGoalLoading(false);
  }
}

function setGoalLoading(loading) {
  document.getElementById('btn-set-goal').disabled = loading;
  document.getElementById('goal-btn-text').style.display = loading ? 'none' : 'inline';
  document.getElementById('goal-spinner').style.display = loading ? 'block' : 'none';
}

document.getElementById('btn-reset-goal').addEventListener('click', () => {
  document.getElementById('section-set-goal').style.display = 'block';
  document.getElementById('section-active-goal').style.display = 'none';
});

// ─── Add Site ─────────────────────────────────────────────────────────────────
document.getElementById('btn-add-site').addEventListener('click', addSite);
document.getElementById('site-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addSite();
});

async function addSite() {
  const input = document.getElementById('site-input');
  let domain = input.value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  if (!domain) return;

  const current = state?.manualBlocklist || [];
  if (current.includes(domain)) { input.value = ''; return; }

  const updated = [...current, domain];
  await chrome.storage.local.set({ manualBlocklist: updated });
  await chrome.runtime.sendMessage({ type: 'SYNC_RULES' });
  input.value = '';
  state.manualBlocklist = updated;
  renderBlocklist(updated, 'manual-list', 'manual-count', false);
  document.getElementById('manual-count').textContent = updated.length;
}

async function removeSite(index) {
  const current = state?.manualBlocklist || [];
  const updated = current.filter((_, i) => i !== index);
  await chrome.storage.local.set({ manualBlocklist: updated });
  await chrome.runtime.sendMessage({ type: 'SYNC_RULES' });
  state.manualBlocklist = updated;
  renderBlocklist(updated, 'manual-list', 'manual-count', false);
}

// ─── Controls ─────────────────────────────────────────────────────────────────
document.getElementById('btn-pause-5').addEventListener('click', () => pause(5));
document.getElementById('btn-pause-15').addEventListener('click', () => pause(15));
document.getElementById('btn-pause-30').addEventListener('click', () => pause(30));

async function pause(minutes) {
  await chrome.runtime.sendMessage({ type: 'PAUSE_BLOCKING', minutes });
  await loadState();
}

document.getElementById('btn-toggle-off').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'SET_BLOCKING', enabled: false });
  await loadState();
});
document.getElementById('btn-toggle-on').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'SET_BLOCKING', enabled: true });
  await loadState();
});

// ─── Settings ─────────────────────────────────────────────────────────────────
document.getElementById('btn-options').addEventListener('click', () => chrome.runtime.openOptionsPage());
document.getElementById('btn-banner-settings')?.addEventListener('click', () => chrome.runtime.openOptionsPage());

// ─── Init ─────────────────────────────────────────────────────────────────────
loadState();
