// blocked.js — Flow Blocked Page Logic

const params = new URLSearchParams(window.location.search);
const blockedDomain = params.get('site') || 'this site';
const blockedUrl = params.get('url') || `https://${blockedDomain}`;

document.getElementById('block-domain').textContent = blockedDomain;

let hasApiKey = false;
let appealsRemaining = 0;

// ─── Load State ───────────────────────────────────────────────────────────────
async function loadState() {
  try {
    const state = await chrome.runtime.sendMessage({ type: 'GET_STATE' });

    // Goal
    if (state.goal) {
      document.getElementById('goal-text').textContent = state.goal.text;
    } else {
      document.getElementById('goal-reminder').style.display = 'none';
    }

    // AI reason for blocking
    const aiEntry = (state.aiBlocklist || []).find(
      (e) => (typeof e === 'string' ? e : e.domain) === blockedDomain
    );
    if (aiEntry && aiEntry.reason) {
      document.getElementById('ai-reason').style.display = 'flex';
      document.getElementById('ai-reason-text').textContent = aiEntry.reason;
    }

    // API key & appeal section
    hasApiKey = state.hasApiKey;
    appealsRemaining = state.appealsInfo?.remaining ?? 0;

    if (!hasApiKey) {
      document.getElementById('appeal-section').style.display = 'none';
      document.getElementById('no-api-card').style.display = 'block';
    } else {
      document.getElementById('appeal-count').textContent =
        `${appealsRemaining} appeal${appealsRemaining !== 1 ? 's' : ''} left today`;
    }
  } catch (err) {
    document.getElementById('goal-text').textContent = 'Could not load goal.';
    console.error('[Flow] State load error:', err);
  }
}

// ─── Appeal ───────────────────────────────────────────────────────────────────
const textarea = document.getElementById('appeal-input');
const charCount = document.getElementById('char-count');

textarea.addEventListener('input', () => {
  charCount.textContent = textarea.value.length;
});

document.getElementById('btn-appeal').addEventListener('click', async () => {
  const reason = textarea.value.trim();
  if (!reason) {
    textarea.focus();
    textarea.style.borderColor = 'rgba(239,68,68,0.5)';
    setTimeout(() => (textarea.style.borderColor = ''), 1500);
    return;
  }

  if (appealsRemaining <= 0) {
    showVerdict(false, 'Daily limit reached.', "You've used all 15 appeals for today.");
    return;
  }

  setLoading(true);

  try {
    const result = await chrome.runtime.sendMessage({
      type: 'SUBMIT_APPEAL',
      domain: blockedDomain,
      url: blockedUrl,
      reason,
    });

    if (result.error) {
      showVerdict(false, 'Error', result.error);
    } else if (result.allow) {
      showVerdict(true, '✅ Access Granted', result.reasoning);
      // Update appeal count
      appealsRemaining = result.remaining;
      document.getElementById('appeal-count').textContent =
        `${appealsRemaining} appeal${appealsRemaining !== 1 ? 's' : ''} left today`;
      // Redirect after 2s
      setTimeout(() => {
        window.location.replace(blockedUrl);
      }, 2000);
    } else {
      showVerdict(false, '❌ Access Denied', result.reasoning);
      appealsRemaining = result.remaining;
      document.getElementById('appeal-count').textContent =
        `${appealsRemaining} appeal${appealsRemaining !== 1 ? 's' : ''} left today`;
    }
  } catch (err) {
    showVerdict(false, 'Error', err.message);
  } finally {
    setLoading(false);
  }
});

function setLoading(loading) {
  const btn = document.getElementById('btn-appeal');
  const text = document.getElementById('appeal-btn-text');
  const spinner = document.getElementById('appeal-spinner');
  btn.disabled = loading;
  text.style.display = loading ? 'none' : 'inline';
  spinner.style.display = loading ? 'block' : 'none';
}

function showVerdict(allow, title, reason) {
  const el = document.getElementById('verdict');
  el.className = `verdict ${allow ? 'ok' : 'no'}`;
  el.style.display = 'flex';
  document.getElementById('verdict-icon').textContent = allow ? '✅' : '❌';
  document.getElementById('verdict-title').textContent = title;
  document.getElementById('verdict-reason').textContent = reason;
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ─── Back Button ──────────────────────────────────────────────────────────────
document.getElementById('btn-back').addEventListener('click', () => {
  if (history.length > 1 && document.referrer) {
    history.back();
  } else {
    window.location.replace('https://www.google.com/');
  }
});

// ─── Settings Link ────────────────────────────────────────────────────────────
const settingsBtn = document.getElementById('btn-settings');
if (settingsBtn) {
  settingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────
loadState();
