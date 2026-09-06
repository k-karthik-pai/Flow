# Flow architecture

Flow is a Manifest V3 extension with no build step, backend, or runtime dependencies.

- `background.js`: coordinates messages, daily reset alarms, serialized rule updates,
  appeal decisions and dynamic page evaluation. AI results are checked against the
  active goal/key and current tab URL before redirecting.
- `utils/domains.js`: shared exact-domain/subdomain normalization and matching.
  DNR uses equivalent anchored regexes; unrelated domains and other TLDs do not match.
- `utils/rules.js`: dynamic main-frame redirect rules, with higher-priority whitelist
  and appeal permissions. Strict mode adds a catch-all rule plus essential exceptions.
  Rule replacement is atomic through Chrome's DNR API.
- `content.js`: secondary blocking checks at document start. A bounded visibility
  guard restores the page if the worker does not respond. It uses the same domain
  semantics and strict-mode exceptions as the worker.
- `blocked.js`: restores the original target, records block statistics and submits
  appeals. Raw DNR target URLs preserve query delimiters and percent escapes.
- `utils/ai.js`: Gemini JSON requests with a stable `gemini-3.1-flash-lite` default,
  compatible fallbacks, bounded requests, and validated verdicts. New dynamic
  evaluations fail open when AI is unavailable; existing lists continue to apply.
- `utils/storage.js` / `utils/date.js`: local settings and local-calendar daily state.
  Session storage caches decisions and approved domains across worker suspension.
- `popup/`, `options/`, `newtab/`: user interface; `utils/theme.js` and shared CSS
  implement system/light/dark themes. The goal page opens programmatically.

Local storage is restricted to trusted extension contexts. Content scripts can
request blocking state and record blocks but cannot invoke settings/goal/appeal
commands. No API key is returned in UI state messages. AI requests contain URL
paths and titles, not page bodies; query strings and fragments are stripped.

The tests in `tests/` exercise rule boundaries, AI validation, message boundaries,
update/startup behavior, reset behavior, and delayed-result regressions. Browser
verification remains necessary for DNR and extension UI behavior.
