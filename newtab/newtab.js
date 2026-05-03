// newtab.js — Flow Goal Page (opened programmatically for API key users)

function updateClock() {
  document.getElementById('clock').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
updateClock();
setInterval(updateClock, 1000);

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}
document.getElementById('greeting').textContent = getGreeting();
document.getElementById('greeting-active').textContent = getGreeting();

async function loadState() {
  try {
    const state = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
    if (state.goal) {
      showActive(state);
    } else {
      showInput();
    }
  } catch {
    showInput();
  }
}

function showInput() {
  document.getElementById('goal-input-section').style.display = '';
  document.getElementById('goal-active-section').style.display = 'none';
}

function showActive(state) {
  document.getElementById('goal-input-section').style.display = 'none';
  document.getElementById('goal-active-section').style.display = '';
  document.getElementById('active-goal-text').textContent = state.goal.text;
  const today = new Date().toISOString().slice(0, 10);
  const todayStats = state.stats?.[today] || {};
  document.getElementById('stat-blocked').textContent = todayStats.blocked || 0;
  document.getElementById('stat-appeals').textContent = state.appealsInfo?.remaining ?? '—';
  document.getElementById('stat-ai').textContent = (state.aiBlocklist || []).length || '—';
}

// Goal input
const goalInput = document.getElementById('goal-input');
const charHint = document.getElementById('char-hint');
goalInput.addEventListener('input', () => { charHint.textContent = `${goalInput.value.length}/300`; });

document.getElementById('btn-set-goal').addEventListener('click', submitGoal);
goalInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submitGoal(); });

async function submitGoal() {
  const text = goalInput.value.trim();
  if (!text) { goalInput.focus(); return; }
  setLoading(true);
  document.getElementById('goal-error').style.display = 'none';
  try {
    await chrome.runtime.sendMessage({ type: 'SET_GOAL', goal: text });
    loadState();
  } catch (err) {
    document.getElementById('goal-error').textContent = err.message;
    document.getElementById('goal-error').style.display = 'block';
  } finally {
    setLoading(false);
  }
}

function setLoading(on) {
  document.getElementById('btn-set-goal').disabled = on;
  document.getElementById('goal-btn-text').style.display = on ? 'none' : '';
  document.getElementById('goal-spinner').style.display = on ? 'block' : 'none';
}

document.getElementById('btn-change-goal')?.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'SET_GOAL', goal: null });
  showInput();
});

loadState();
