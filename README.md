# ⚡ Flow — AI-Powered Focus Extension

> Block distracting websites intelligently based on your daily goal. Free & open source — bring your own Gemini API key for AI features.

---

## Features

- **Daily Goal Setting** — Set what you're working on today; everything else gets blocked
- **AI Auto-Blocklist** — Gemini analyzes your goal and blocks relevant distracting sites
- **Manual Blocklist** — Always-block specific sites, no AI needed
- **Always-Allow Whitelist** — Sites that are never blocked (e.g. your university portal)
- **Appeal System** — Think a block is wrong? Submit your reason to AI; it decides
- **Pause Controls** — Pause blocking for 5/15/30 minutes when needed
- **Midnight Reset** — Goal and AI blocklist reset at midnight; new tab prompts you each day
- **Custom New Tab** — Every new tab shows your goal and stats
- **Appeal History** — Full log of all AI verdicts

---

## Installation (Developer Mode)

1. Clone or download this repo
2. Open Chrome → go to `chrome://extensions/`
3. Enable **Developer Mode** (top right toggle)
4. Click **Load unpacked** → select the `Flow/` folder
5. Flow is now installed! Open a new tab to set your first goal.

---

## Getting a Gemini API Key (Free)

1. Go to [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2. Sign in with your Google account
3. Click **Create API Key**
4. Copy the key (starts with `AIza...`)
5. Open Flow Settings → paste under **API Key**

> **Privacy:** Your API key and goal text are stored **only on your device**. They are sent directly to Google's Gemini API and nowhere else.

---

## How It Works

```
You open Chrome
       ↓
New Tab: "What's your goal today?"
       ↓
You type: "Finish machine learning assignment"
       ↓
[With API Key] Gemini analyzes → blocks youtube.com, twitter.com, instagram.com...
[Without API Key] Manual blocklist applies
       ↓
You visit YouTube → Blocked page shown
       ↓
Option A: Go back and stay focused ✅
Option B: Pause blocking for 15 min
Option C: Submit appeal → "I need to watch a PyTorch tutorial"
                ↓
         Gemini judges...
         ↓              ↓
    ALLOWED          DENIED
 (YouTube unblocked  (Stays blocked,
  this session)       reason shown)
```

---

## File Structure

```
flow/
├── manifest.json       # Chrome Extension Manifest V3
├── background.js       # Service Worker — AI calls, rule management
├── content.js          # Injected — checks if page is blocked
├── blocked.html/css/js # Blocked page with appeal form
├── newtab/             # Custom new tab — goal prompt + stats
├── popup/              # Extension popup — quick controls
├── options/            # Settings — API key, lists, stats, appeals
└── utils/
    ├── ai.js           # Gemini API integration
    ├── storage.js      # Chrome storage helpers
    └── rules.js        # declarativeNetRequest rule management
```

---

## Roadmap

- [x] Chrome Extension (Phase 1)
- [ ] Desktop App — Electron + system-level blocking (Phase 2)
- [ ] Mobile App — React Native with VPN-based DNS blocking (Phase 3)

---

## Contributing

This is open source! PRs welcome. Some ideas:
- Support for OpenAI / Claude as alternative AI providers
- Pomodoro timer integration
- Weekly productivity reports
- Cross-device sync (requires lightweight backend)
