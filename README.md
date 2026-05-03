# Flow

Flow is an intent-driven productivity extension for Google Chrome. Rather than relying on static, easily bypassed blocklists, Flow utilizes local AI integration to evaluate your browsing behavior in real-time against a specific daily focus goal.

If a site distracts from your current objective, Flow blocks it. If you have a legitimate reason to access a blocked site, you can submit a written appeal to the AI for temporary access.

## Core Features

* **Intent-Based Filtering:** Set a specific goal (e.g., "Researching linear algebra" or "Writing frontend React code"). Flow uses the Gemini API to dynamically determine if the sites you visit are aligned with your objective.
* **Context-Aware Appeals:** If a necessary site is blocked, you can submit a short justification. The AI evaluates your reasoning against your goal and can dynamically unblock the site if the logic is sound.
* **Strict Discipline Mechanics:** The user interface is deliberately constrained to prevent easy bypasses. Changing goals or disabling the extension requires deliberate friction.
* **Privacy First:** Flow is entirely client-side. Your Gemini API key, daily goals, and browsing history are stored exclusively in your local browser storage (`chrome.storage.local`). The extension only transmits the domain name and page title to the AI during evaluation.
* **Offline Fallback:** If an API key is not provided or the rate limit is reached, Flow seamlessly falls back to a traditional, static blocklist mechanism.

## Prerequisites

To enable the dynamic AI features, you will need a free Google Gemini API key.

1. Navigate to [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Create a new API key.
3. Keep this key secure; you will need to paste it into the extension's settings.

## Installation

Flow is not currently published on the Chrome Web Store and must be loaded as an unpacked extension.

1. Clone or download this repository to your local machine.
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** using the toggle switch in the top right corner.
4. Click the **Load unpacked** button in the top left.
5. Select the `Flow` directory from your file system.

## Configuration & Usage

1. **API Setup:** After installation, click the Flow icon in your toolbar and open the **Settings** (gear icon). Paste your Gemini API key into the designated field and save.
2. **Set Your Intent:** Open a new tab or click the extension popup to set your focus goal for the session.
3. **Browse:** Navigate the web normally. When you visit a new domain, Flow will evaluate it. If it is deemed a distraction, the page will be immediately blocked.
4. **Appeals:** On the block screen, you have the option to explain why the site is necessary for your work. If the AI approves your reasoning, the site will be unblocked for the remainder of the session.

## Architecture & Permissions

Flow is built on Manifest V3. It leverages the `declarativeNetRequest` API for performant, synchronous blocking before a page even renders, preventing visual flashes of distracting content. The extension utilizes a fallback chain of lightweight Gemini models (e.g., `gemini-3.1-flash-lite-preview`) to minimize latency and manage API rate limits efficiently.
