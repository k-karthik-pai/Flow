# Flow

A Chrome extension that blocks distractions using your site lists and an optional
Gemini-powered daily focus goal.

**[Install Flow from the Chrome Web Store](https://chromewebstore.google.com/detail/flow/gmeloppnbmbeogmaiemeoflnlpgfefeh)**

## Everyday use

1. Open the toolbar popup and add domains to your manual blocklist. No API key is required.
2. Optionally open Settings and save your own [Gemini API key](https://aistudio.google.com/app/apikey), then set a daily goal in the popup. API availability, quotas and charges depend on your Google account.
3. Flow generates a goal-based blocklist and evaluates other visited pages using their URL path and title. New AI decisions happen after navigation, so content can be visible while evaluation runs.
4. On a blocked page, submit a reason for access. With a key and today's goal, the AI can grant access to that domain for the browser session (also cleared on goal change or the daily reset). Up to 15 completed appeals are allowed per day.
5. Use Settings to manage lists, view statistics, select a theme, or enable **Whitelist-only mode**.

Whitelist entries override blocking. Domain entries match that domain and its
subdomains; add different country domains separately. Whitelist-only mode permits
your whitelist, approved appeals, and the built-in search/local-development domains
in `utils/domains.js`. It works without a key or goal. Manual rules remain available
if the AI is unavailable; there is no built-in default blocklist.

The goal resets at local midnight. Flow may open its goal page on browser startup
when a key exists and no goal is set; it does not replace Chrome's new-tab page.
The interface has no pause/disable button, but you remain in control through Chrome's
extension manager. This is a personal focus tool, not a tamper-proof access control.

## Privacy

AI is optional. Saving a key enables sending your goal, evaluated page domains,
URL paths and titles, and submitted appeal text to Google Gemini. Query strings,
fragments and URL credentials are removed from AI browsing requests. Local/session
storage holds preferences and focus records. There is no Flow backend or analytics.
Read [PRIVACY.md](PRIVACY.md) before enabling AI.

## Develop or load unpacked

No build step or runtime dependencies are required. Chrome 102 or later is required;
use a current Chrome release for day-to-day use.

1. Clone/download this repository.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Choose **Load unpacked** and select the directory containing `manifest.json`.
4. After editing, reload the extension and refresh existing test tabs.

Use an isolated Chrome profile for testing so your everyday lists and goals stay intact.

## Verify and package an update

With Node.js 22+ and Python 3 installed:

```sh
npm test
npm run package
```

Tests use mocked Chrome and Gemini APIs; no real key or API charges are required.
Packaging produces `dist/flow-1.0.1.zip` containing only extension runtime files,
its license and privacy policy. No repository metadata, test code or local secrets
are included. Upload the ZIP to your existing Flow item in the Chrome Web Store
Developer Dashboard, review its privacy disclosures and submit the update for review.
The source version must exceed the currently published version. Before submitting,
test AI analysis and appeals with your own key and provide a public URL for
[PRIVACY.md](PRIVACY.md) in the dashboard's privacy-policy field.

## Permissions and architecture

- `storage`: preferences, goals, API key, statistics, appeals and session decisions.
- `declarativeNetRequest`: redirect blocked top-level website requests.
- `tabs`: read visited URLs/titles for focus evaluation and redirect distracting pages.
- `alarms`: reset daily state and restore internal pause timers.
- `<all_urls>`: apply site blocking and content checks across websites and contact Gemini.

All executable code is bundled locally. Chrome internal pages and other protected
surfaces cannot be blocked like normal websites. See [ARCHITECTURE.md](ARCHITECTURE.md)
for implementation details. Released under the [MIT License](LICENSE).
