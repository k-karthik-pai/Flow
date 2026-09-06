# Flow privacy policy

Updated September 6, 2026, for version 1.0.1.

Flow blocks distracting websites according to your site lists and, optionally,
your daily goal using Google's Gemini API. Flow has no developer-operated backend,
advertising, analytics, or sale of user data.

## Data stored in your browser

Chrome extension local storage holds your Gemini API key, goal, manual and AI site
lists, whitelist, preferences, appeal reasons and verdicts, and blocked-site counts.
The key is not encrypted by Flow. These records are not synced by Flow to another
device. Daily goal and appeal state reset at local midnight; statistics are pruned
to approximately 30 days when a block is recorded. Appeal history is capped at 100
entries and cleared at the daily reset.

Chrome session storage holds up to 500 evaluated page URLs/verdicts and temporary
appeal permissions. These records clear when the browser session ends and when the
goal or day resets. Local records are removed when the extension is uninstalled.
You can remove your API key and edit site lists in Settings.

## Optional data sent to Google

Saving a Gemini API key enables AI processing. Flow sends the key to Google's
Gemini API over HTTPS for authentication. Goal analysis sends your goal; browsing
evaluation sends your goal, page domain, URL path, and title; an appeal sends your
goal, blocked domain, and written reason. URL credentials, query strings and
fragments are removed before browsing evaluation. Paths, titles and text you enter
can still contain personal information. Flow does not read page bodies, form input,
cookies, or your Chrome history database.

This data is used for the requested focus and appeal decisions. Google's processing
and retention depend on your Gemini service and billing status; see the
[Gemini API terms](https://ai.google.dev/gemini-api/terms) and
[Google privacy policy](https://policies.google.com/privacy). Removing the key stops
new AI requests; it cannot retract a request already sent to Google. With no key,
manual blocking and whitelist-only mode work without AI requests.

Flow's use of user data is limited to its visible focus-blocking features. Flow
does not use or transfer this data for advertising, creditworthiness, or unrelated
purposes, and adheres to the Chrome Web Store User Data Policy, including its
Limited Use requirements. Extension pages use system fonts without remote font
requests.

For privacy questions, use the support/contact option on the
[Flow Chrome Web Store listing](https://chromewebstore.google.com/detail/flow/gmeloppnbmbeogmaiemeoflnlpgfefeh).
