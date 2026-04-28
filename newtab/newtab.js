// newtab.js — Flow New Tab Page Logic

// ─── Clock ────────────────────────────────────────────────────────────────────
function updateClock() {
  const now = new Date();
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  document.getElementById('clock').textContent = time;
}
updateClock();
setInterval(updateClock, 10000);

// ─── Greeting ─────────────────────────────────────────────────────────────────
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning 🌅';
  if (h < 17) return 'Good afternoon ☀️';
  return 'Good evening 🌙';
}
document.getElementById('greeting').textContent = getGreeting();
document.getElementById('greeting-active').textContent = getGreeting();

// ─── Load State ───────────────────────────────────────────────────────────────
async function loadState() {
  try {
    const state = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
    if (state.goal) {
      showActiveView(state);
    } else {
      showInputView(state.hasApiKey);
    }
  } catch (err) {
    showInputView(false);
    console.error('[Flow] State error:', err);
  }
}

function showInputView(hasApiKey) {
  document.getElementById('goal-input-section').style.display = 'flex';
  document.getElementById('goal-active-section').style.display = 'none';
  if (!hasApiKey) {
    // Subtle note that AI features need API key
    const note = document.createElement('p');
    note.style.cssText = 'font-size:12px;color:var(--text-3);margin-top:12px;';
    note.innerHTML = 'Tip: Add a Gemini API key in <a href="#" id="settings-link" style="color:var(--primary-light);text-decoration:none;">Flow settings</a> to enable AI auto-blocking.';
    document.getElementById('goal-input-section').appendChild(note);
    document.getElementById('settings-link')?.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.runtime.openOptionsPage();
    });
  }
}

function showActiveView(state) {
  document.getElementById('goal-input-section').style.display = 'none';
  document.getElementById('goal-active-section').style.display = 'flex';

  document.getElementById('active-goal-text').textContent = state.goal.text;

  // Stats
  const today = new Date().toISOString().slice(0, 10);
  const todayStats = state.stats?.[today] || {};
  document.getElementById('stat-blocked').textContent = todayStats.blocked || 0;
  document.getElementById('stat-appeals').textContent = state.appealsInfo?.remaining ?? '—';
  document.getElementById('stat-ai').textContent = (state.aiBlocklist || []).length || '—';
}

// ─── Set Goal ─────────────────────────────────────────────────────────────────
const goalInput = document.getElementById('goal-input');
const charHint = document.getElementById('char-hint');

goalInput.addEventListener('input', () => {
  charHint.textContent = `${goalInput.value.length} / 300`;
});

document.getElementById('btn-set-goal').addEventListener('click', submitGoal);
goalInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submitGoal();
});

async function submitGoal() {
  const text = goalInput.value.trim();
  if (!text) { goalInput.focus(); return; }

  setGoalLoading(true);
  document.getElementById('goal-error').style.display = 'none';

  try {
    const result = await chrome.runtime.sendMessage({ type: 'SET_GOAL', goal: text });
    if (result.aiError) {
      // Warn but proceed (goal set, manual list still works)
      console.warn('[Flow] AI analysis error:', result.aiError);
    }
    // Reload to show active view
    loadState();
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
  document.getElementById('ai-note').style.display = loading ? 'flex' : 'none';
}

// ─── Change Goal ──────────────────────────────────────────────────────────────
document.getElementById('btn-change-goal')?.addEventListener('click', () => {
  showInputView(true);
});

// ─── Search ───────────────────────────────────────────────────────────────────
document.getElementById('btn-search')?.addEventListener('click', doSearch);
document.getElementById('search-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') doSearch();
});

function doSearch() {
  const query = document.getElementById('search-input').value.trim();
  if (query) window.location.href = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

// ─── Init ─────────────────────────────────────────────────────────────────────
loadState();
