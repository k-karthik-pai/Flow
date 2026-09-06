import { saveSiteList } from '../utils/messages.js';
import '../utils/domains.js';
import { localDate } from '../utils/date.js';
// popup.js — Flow Extension Popup

function escapeHTML(str) {
  if (!str) return '';
  return String(str).replace(/[&<>'"]/g, tag => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[tag]));
}

let state = null;

async function loadState() {
  try {
    state = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
    renderUI();
  } catch (err) {
    document.getElementById('status-text').textContent = 'Error loading';
  }
}

function renderUI() {
  if (!state) return;

  // Goal
  if (!state.hasApiKey) {
    document.getElementById('section-set-goal').style.display = 'none';
    document.getElementById('section-active-goal').style.display = 'none';
  } else if (state.goal) {
    document.getElementById('section-set-goal').style.display = 'none';
    document.getElementById('section-active-goal').style.display = 'flex';
    document.getElementById('active-goal-text').textContent = state.goal.text;
  } else {
    document.getElementById('section-set-goal').style.display = 'block';
    document.getElementById('section-active-goal').style.display = 'none';
  }

  // Status
  const dot = document.getElementById('status-dot');
  const text = document.getElementById('status-text');
  const chip = document.getElementById('stat-chip');

  if (state.pauseUntil && Date.now() < state.pauseUntil) {
    const mins = Math.ceil((state.pauseUntil - Date.now()) / 60000);
    dot.className = 'status-dot paused';
    text.textContent = `Paused · ${mins}m left`;
  } else if (!state.blockingEnabled) {
    dot.className = 'status-dot off';
    text.textContent = 'Blocking off';
  } else {
    dot.className = 'status-dot' + (state.hasApiKey && !state.goal ? ' off' : ' on');
    text.textContent = !state.hasApiKey ? 'Manual blocking active' : (state.goal ? 'Blocking active' : 'Waiting for goal');
  }

  const total = (state.manualBlocklist?.length || 0) + (state.aiBlocklist?.length || 0);
  if (total > 0) {
    chip.textContent = `${total} sites`;
    chip.style.display = '';
  } else {
    chip.style.display = 'none';
  }

  const strictChip = document.getElementById('strict-chip');
  if (strictChip) {
    strictChip.style.display = state.whitelistOnlyMode ? '' : 'none';
  }

  // Lists
  renderList(state.manualBlocklist || [], 'manual-list', 'manual-count', false);
  const ai = state.aiBlocklist || [];
  if (ai.length > 0 && state.hasApiKey) {
    document.getElementById('ai-section').style.display = 'block';
    renderList(ai, 'ai-list', 'ai-count', true);
  } else {
    document.getElementById('ai-section').style.display = 'none';
  }
}

function renderList(items, listId, countId, isAI) {
  const list = document.getElementById(listId);
  const countEl = document.getElementById(countId);
  if (countEl) countEl.textContent = items.length;
  list.innerHTML = '';

  if (items.length === 0) {
    list.innerHTML = `<li class="list-empty">${isAI ? 'No AI sites' : 'No sites added'}</li>`;
    return;
  }

  items.forEach((item, idx) => {
    const domain = typeof item === 'string' ? item : item.domain;
    const reason = typeof item === 'object' && item.reason ? item.reason : null;
    const li = document.createElement('li');
    li.className = `list-item${isAI ? ' ai' : ''}`;
    li.innerHTML = `
      <div class="list-dot"></div>
      <span class="list-name">${escapeHTML(domain)}</span>
      ${reason ? `<span class="list-reason" title="${escapeHTML(reason)}">${escapeHTML(reason)}</span>` : ''}
      ${!isAI ? `<button class="list-remove" data-idx="${idx}"><svg viewBox="0 0 12 12" fill="none"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg></button>` : ''}
    `;
    list.appendChild(li);
  });

  if (!isAI) {
    list.querySelectorAll('.list-remove').forEach((btn) => {
      btn.addEventListener('click', () => removeSite(parseInt(btn.dataset.idx)));
    });
  }
}

// ─── Goal ─────────────────────────────────────────────────────────────────────
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
    if (result.error) throw new Error(result.error);
    state = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
    renderUI();
  } catch (err) {
    document.getElementById('goal-error').textContent = err.message;
    document.getElementById('goal-error').style.display = 'block';
  } finally {
    setGoalLoading(false);
  }
}

function setGoalLoading(on) {
  document.getElementById('btn-set-goal').disabled = on;
  document.getElementById('goal-btn-text').style.display = on ? 'none' : '';
  document.getElementById('goal-spinner').style.display = on ? 'block' : 'none';
}

document.getElementById('btn-reset-goal').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'SET_GOAL', goal: null });
  document.getElementById('section-set-goal').style.display = 'block';
  document.getElementById('section-active-goal').style.display = 'none';
});

// ─── Add/Remove Sites ─────────────────────────────────────────────────────────
document.getElementById('btn-add-site').addEventListener('click', addSite);
document.getElementById('site-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addSite();
});

async function addSite() {
  const input = document.getElementById('site-input');
  let d = FlowDomains.normalizeDomain(input.value.trim());
  if (!d) { input.setCustomValidity('Enter a valid domain or HTTP(S) URL.'); input.reportValidity(); return; }
  input.setCustomValidity('');
  const current = state?.manualBlocklist || [];
  if (current.includes(d)) { input.value = ''; return; }
  const updated = [...current, d];
  if (updated.length > 300) { alert('A maximum of 300 sites per list is supported.'); return; }
  await saveSiteList('manualBlocklist', updated);
  input.value = '';
  state.manualBlocklist = updated;
  renderUI();
}

async function removeSite(idx) {
  const updated = (state?.manualBlocklist || []).filter((_, i) => i !== idx);
  if (updated.length > 300) { alert('A maximum of 300 sites per list is supported.'); return; }
  await saveSiteList('manualBlocklist', updated);
  state.manualBlocklist = updated;
  renderUI();
}

// ─── Nav ──────────────────────────────────────────────────────────────────────
const openOptions = () => chrome.runtime.openOptionsPage();
document.getElementById('btn-options').addEventListener('click', openOptions);
document.getElementById('btn-settings-footer')?.addEventListener('click', openOptions);

loadState();
