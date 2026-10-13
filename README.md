# VK API Probe

Phone-friendly Vite + React + TypeScript PWA for comparing VK reachability on normal Wi-Fi and restricted mobile data. Every probe is a direct browser `fetch` from the device to VK. There is no backend, proxy or GitHub Actions probe service.

## What the experiment measures

Seven sequential GET requests target `vk.com`, `m.vk.com`, `api.vk.com`, the public `utils.getServerTime` method, an unauthenticated `users.get` attempt, `oauth.vk.com`, and `vk.com/favicon.ico`. Each has a 9-second timeout (including reading an API response). Reports include URL, fetch mode, outcome, elapsed time and browser-visible diagnostics. Requests use `cache: "no-store"` and omit credentials. The service worker precaches only the application shell; it has no runtime cache for VK.

- **HTTP OK**: readable 2xx HTTP response. For the API attempt, a separate `apiOutcome` records a VK `response`, VK error, or unknown format. HTTP 200 with a VK error does not mean the method succeeded.
- **OPAQUE**: a `no-cors` request completed, but status, body, headers and final URL are hidden. Even an HTTP error can be opaque. This is evidence of request completion, not proof of a working API method or full VK access.
- **HTTP FAIL**: readable non-2xx response.
- **FETCH FAIL**: fetch rejected. JavaScript generally cannot distinguish CORS from DNS, TLS, browser policy or mobile-network blocking. Browser developer tools may reveal more; the app never guesses “CORS blocked.”
- **TIMEOUT**: request/body reading exceeded 9 seconds. This does not identify the underlying cause.

The existing `users.get?user_ids=1&v=5.199` attempt is preserved as a harmless token-free request, **not advertised as a currently supported unauthenticated method**. A development check returned VK error 15, “token required.” `utils.getServerTime?v=5.199` returned a successful `response` without a token in a development check on 2026-10-13; availability and CORS are still assessed afresh by the phone. The phone's readable response determines the API result; the app stores no response bodies or user records.

`navigator.onLine` is only the browser's connectivity hint. It can be true while GitHub or VK is blocked. Timing includes browser/network overhead and redirects; it is not a pure ping. Results do not prove why a host is blocked, whether every VK endpoint works, or whether authenticated operations work. Upstream/operator caching and interception are outside the application's control.

## Local development and production

Use Node 22.12+ (CI uses Node 22):

```sh
npm install
npm run dev
# Open the URL Vite prints, under /vk_api_test/
npm run typecheck
npm run build
npm run preview
# http://localhost:4173/vk_api_test/
```

The lockfile and exact dependency versions are committed. Use `npm ci` for reproducible installs. There is no lint command. Service workers are enabled in production, not the Vite development server. A phone needs HTTPS; localhost is a secure-context exception only on the same device.

## GitHub Pages deployment

`.github/workflows/deploy-pages.yml` builds on pushes to `main` or a manual workflow run. It checks out code, sets up Node, configures Pages, runs `npm ci` and the production build, uploads `dist`, and deploys through the official Pages Actions. It does not run VK probes.

In **Settings → Pages → Build and deployment → Source**, choose **GitHub Actions**. Ensure Actions are enabled and any `github-pages` environment approvals permit deployment. The expected site is:

https://artemu78.github.io/vk_api_test/

Vite base, manifest ID/start URL/scope, service worker scope and navigation fallback all use `/vk_api_test/`. Icons are local 192/512 PNGs with a separate maskable icon. This is one page: there are no client-side routes requiring a Pages 404 workaround. Use the trailing-slash URL above. The workflow artifact is `dist`; do not commit it.

## Android installation and offline operation

Open the production HTTPS site in Chrome with working Internet. Wait for **“Готово офлайн”**. Install via the app button when Chrome offers it, or Chrome menu → **Install app / Add to Home screen**. The install button is shown only when `beforeinstallprompt` is available. Installation is optional; a normal Chrome tab also uses the offline shell.

Workbox precaches HTML, JavaScript, CSS, manifest and local icons. After a completed initial service worker install, closing/reopening or refreshing the site offline loads the test UI. Updates are offered explicitly to avoid interrupting a measurement. Offline readiness concerns the app shell; it does not imply that VK is available. When `navigator.onLine` is false, the UI states that it is running offline, but probes are still allowed.

Browser storage eviction, clearing site data, private browsing or an interrupted first visit can remove/prevent the cache. Verify actual offline launch before relying on it when GitHub becomes unreachable.

## Exact experiment procedure

1. Open the GitHub Pages site while normal Internet/Wi-Fi works.
2. Wait for offline readiness; install the PWA or switch off all Internet and verify a refresh and reopen still show the UI. Restore Wi-Fi.
3. Label the run `Wi-Fi normal`, run all tests, and export the baseline JSON. Completed runs also save locally.
4. Disable Wi-Fi.
5. Enable mobile data; optionally save a `Mobile normal` run before restrictions.
6. When general mobile Internet is restricted but VK remains available, launch the already-installed/cached PWA. GitHub Pages does not need to be reachable.
7. Label the run `Mobile restricted` and run the same tests. Do not switch networks during the run (seven timeouts can take about 63 seconds).
8. Select two distinct runs in the comparison panel. Changed outcomes are highlighted; Δ ms is second minus baseline. Export both JSON reports.

Up to 20 completed runs are stored only in this browser's localStorage. Export is available for each saved run. If local storage fails, export the current run before closing. Reports contain `timestamp`, `completedAt`, label, user agent, online hints at start/end, explicitly serialized Network Information API fields (when supported), `appVersion`, and `tests`. There is no analytics or location collection. User agent/network metadata is diagnostic; do not put personal information in labels. Clearing site data also deletes saved runs.

## Verification

```sh
npm ci
npm run typecheck
npm run build
npm run test:e2e
# Requires Google Chrome installed (Playwright uses channel: chrome).
```

The production browser tests verify repository-subpath assets/manifest/icons, service worker control, offline refresh and reopen, installation eligibility (excluding the test browser’s incognito restriction), persistence/comparison/export, and that repeated external VK fetches bypass service worker caches. Probe outcomes are exercised with deterministic browser mocks; these tests do not measure the actual mobile operator or assert current VK method availability.
