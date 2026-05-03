# Flow — Architecture & Project Overview

Flow is a strict, AI-powered productivity extension for Chrome (Manifest V3) designed as a "commitment device." Unlike standard site blockers, it removes all easy bypasses (no pause/toggle buttons) and uses AI to intelligently judge if a site aligns with a user's stated goal.

## 🏛️ Core Philosophy
- **Zero Compromise**: All "pause" and "disable" controls have been stripped from the UI to prevent cheating.
- **Goal-Oriented**: Blocking is dynamic. If the goal is "Coding," social media is blocked. If the goal is "Networking," LinkedIn is allowed.
- **AI Adjudication**: Unblocking a site requires an "Appeal" where the Gemini AI judges if the user's reason for visiting the site aligns with their goal.

## 🛠️ Technical Architecture

### 1. Network Level Blocking (DNR)
- **File**: `utils/rules.js`
- **Mechanism**: Uses `chrome.declarativeNetRequest` for high-performance, privacy-first blocking.
- **Smart Matching**: Implements TLD-agnostic matching. If `wikipedia.com` is blocked, the extension generates regex rules to block `wikipedia.org`, `wikipedia.net`, etc., automatically.

### 2. Local Fail-Safe (Content Scripts)
- **File**: `content.js`
- **Mechanism**: Injected at `document_start`. It acts as a secondary layer. If the network redirect fails, the content script hides the page instantly and redirects to the blocked page locally.

### 3. AI Engine (Gemini)
- **File**: `utils/ai.js`
- **Model**: Fallback chain starting with `gemini-3.1-flash-lite-preview` (v1beta).
- **Strategy**: Utilizes newer, lightweight models to ensure fast latency and generous free-tier rate limits (500 requests/day). Uses a "Simplified Payload" approach where system instructions are merged into the main prompt.

### 4. UI & Theme System
- **Files**: `popup/`, `options/`, `blocked.html`, `utils/theme.js`
- **Design**: Google-inspired minimalist aesthetic.
- **Theme**: Robust engine supporting **System**, **Light**, and **Dark** modes with a default to system preference.

## 📂 Key File Structure

- `manifest.json`: Defines permissions (DNR, storage, alarms) and host access (`<all_urls>`).
- `background.js`: The heart of the extension. Manages state, alarm resets (midnight reset), and coordinates rule syncing.
- `utils/storage.js`: Clean wrapper for `chrome.storage.local`.
- `blocked.html/js`: The "Intervention" page shown when a user drifts off-track. Contains the AI appeal form.
- `newtab/`: Non-intrusive goal setup page opened programmatically on browser startup for AI users.

## 🚀 Current Status
The project is fully functional as a strict focus tool. The API integration has been hardened against common regional/versioning errors, and the UI has been professionalized for a premium feel.
