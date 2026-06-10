# Development Notes

Running notes on decisions made, issues encountered, and how they were resolved during implementation. Written to support a post-assignment discussion with the interviewer and to inform the final README.

---

## Tech Stack Decisions

### TypeScript on the backend
The assignment spec does not explicitly require TypeScript, but it is the industry standard for full-stack JavaScript projects today. Adding it to the backend (`server/`) keeps the codebase consistent with the frontend (which gets TypeScript for free from the Vite React TS template) and catches shape mismatches between the scraper, API, and UI at compile time rather than at runtime.

Setup: `typescript`, `ts-node`, `@types/node`, and `@types/express` as dev dependencies; a `tsconfig.json` with `target: ES2020`, `module: commonjs`, `strict: true`. The server is run directly via `npm start` (`ts-node index.ts`) — no separate compile step needed during development.

### Playwright for HTTP requests
The original spec calls for native `fetch` (Node 18+). This works for most sites, but `kickertech.com/jobs/` is protected by **Cloudflare's Managed Challenge**, which issues a 403 to any HTTP client that does not look like a real browser — including `fetch`, `curl`, and `axios`.

The solution is to use **Playwright** to drive a real Chrome window that passes the Cloudflare check, then hand the rendered HTML to Cheerio for parsing. Playwright is only used to fetch HTML; all data extraction is still done by Cheerio.

---

## Cloudflare Bot Protection — Issue and Fix

### The problem
`kickertech.com` uses Cloudflare's Managed Challenge. Any HTTP client (fetch, curl, axios) receives a `403` and an HTML challenge page instead of the actual content. This applies regardless of the IP address — it is a site-wide policy based on request fingerprinting, not IP reputation.

Key point: visiting the site in a regular browser on the same IP works fine. The difference is not the IP — it is how the request looks.

### What Cloudflare checks
Cloudflare's challenge script inspects the browser environment before allowing access. The most decisive signal it uses is `navigator.webdriver`: a browser flag that is `true` when a page is being controlled by automation (Playwright, Puppeteer, Selenium) and `false` in a real user session. Any automated tool that does not patch this flag is immediately identified as a bot.

### The fix
Playwright's `context.addInitScript()` runs a script in every page before any other JavaScript executes — including Cloudflare's challenge script. Patching `navigator.webdriver` to `false` here makes the automated Chrome window indistinguishable from a real session:

```ts
await context.addInitScript(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => false });
});
```

With this in place, Cloudflare passes the browser silently (no CAPTCHA, no redirect), and the page loads normally.

### Why headless mode does not work
Running Chrome in headless mode (`headless: true`, Playwright's default) exposes additional signals beyond `navigator.webdriver` — differences in GPU info, missing browser APIs, and TLS record patterns that Cloudflare also checks. Using `headless: false` (a visible Chrome window) combined with the `navigator.webdriver` patch is the minimal reliable approach. The window opens and closes quickly during each scrape.

### Approaches that did not work
- **Native `fetch` with browser-like headers** — Cloudflare ignores headers when the underlying TLS fingerprint does not match Chrome.
- **`playwright-extra` + `puppeteer-extra-plugin-stealth`** — The stealth plugin patches many signals but not enough for Cloudflare's current managed challenge version.
- **VPN / IP rotation** — The block is fingerprint-based, not IP-based. Changing the IP has no effect.
- **Playwright headless with `channel: 'chrome'`** — Still detected via headless-specific signals even when using the system Chrome binary.

---

## Scraper Implementation 1

### HTML inspection approach
The Cheerio selectors were derived by fetching the raw HTML (`curl -s https://kickertech.com/jobs/ > jobs.html`) and reading the actual markup. No selectors were guessed. The page is a WordPress site using the Elementor page builder with a custom jobs widget (`cspt_jobs_element`).

### Selectors used
| Field | Selector |
|---|---|
| Job card container | `article.creativesplanet-ele-jobs` |
| Team name | `h4.pbmit-company-name strong` |
| Location | `.cspt-jobs-location` |
| Title text + link | `h3.pbmit-job-position a` |
| Salary text | `li.cspt-jobs-salary` |

### Salary parsing
Salary appears as plain text inside `li.cspt-jobs-salary`, e.g. `"2900 - 4900 EUR / Year"`. One listing uses an en-dash instead of a hyphen (`"2900 – 4400 EUR / Year"`), so the regex accounts for both:

```ts
/(\d+)\s*[-–]\s*(\d+)/
```

### `waitUntil: 'networkidle'` timeout
The first Playwright implementation used `waitUntil: 'networkidle'`, which waits until no network requests are in flight. This caused a 30-second timeout because the page has persistent background requests that never fully settle (analytics, fonts, etc.). The fix was `waitUntil: 'domcontentloaded'` followed by `page.waitForSelector('article.creativesplanet-ele-jobs')` — which waits specifically for the content we care about, not for all network activity to stop.

---

## Scraper Implementation 2

### The LinkedIn link is hidden in the initial DOM

The LinkedIn application URL lives inside a `div.application_details` element that is present in the initial page HTML but starts hidden (`display: none`):

```html
<div class="application_details" style="display: block;">
  <p>To apply for this job please visit <a href="https://www.linkedin.com/jobs/view/4168361124" rel="nofollow">www.linkedin.com</a>.</p>
</div>
```

The `href` attribute is set on the anchor in the initial HTML — no interaction is needed to read it. The scraper waits for `.application_details a` with `{ state: 'attached' }` (exists in DOM, regardless of visibility) and then reads the page HTML. Cheerio extracts the `href` from that anchor.

### Selector used
| Field | Selector |
|---|---|
| LinkedIn anchor | `.application_details a` |

### Waiting past Cloudflare on detail pages
The detail pages are behind the same Cloudflare challenge as the listing page. Using `waitUntil: 'domcontentloaded'` + `waitForSelector('.application_details a', { state: 'attached', timeout: 30000 })` handles both concerns in one step: the selector wait naturally bridges the Cloudflare challenge (the anchor only appears after the real page loads).

### `waitUntil: 'load'` timeout on detail pages
An early attempt used `waitUntil: 'load'`, which waits for all subresources. This hit a 30-second timeout for the same reason as `networkidle` — persistent background requests. Switching to `domcontentloaded` + selector wait resolved it.

---

## Scraper Implementation 3

### Structure
`scrapeJobs()` is a thin coordinator: it calls `scrapeListingPage()` to get the array of partial jobs, then loops through them **sequentially**, calling `scrapeDetailPage()` on each `detailsLink` and merging the returned `linkedInLink` into the object. A `Job` interface extends `PartialJob` with the `linkedInLink: string | null` field.

Sequential (not parallel) fetching was a deliberate choice — parallel requests to the same domain are more likely to trigger rate limiting or bot detection.

### Single browser session
The browser (`chromium.launch()`) and context (`browser.newContext()`, `addInitScript()`) are created once in `scrapeJobs()` and shared across all page fetches. Each helper (`scrapeListingPage`, `scrapeDetailPage`) receives the `BrowserContext`, opens its own page, and closes it in a `try/finally`. The browser is closed in a `finally` block in `scrapeJobs()`, guaranteeing cleanup on both success and failure.

The original implementation launched a new browser per page (N+1 launches per scrape). The refactor reduces this to one launch, one window, and one context for the full scrape.

### Error handling strategy
Two levels of error handling:
- **Outer try/catch** around the whole function: catches listing-page failures (site unreachable, Cloudflare block, zero cards parsed). Logs the cause with `console.error` and returns `[]`. This means the HTTP layer always gets a 200 with either results or an empty array — scrape failures are not the caller's problem to interpret.
- **Per-detail-page try/catch**: if a single detail page fails, `linkedInLink` is set to `null` and the loop continues. One broken detail page does not abort the whole scrape.

### Bug: `waitForSelector` defaults to `state: 'visible'`
The first end-to-end run returned all 4 jobs but with `linkedInLink: null` on every one. The Playwright error was:

```
page.waitForSelector: Timeout 5000ms exceeded.
14 × locator resolved to hidden <a href="https://www.linkedin.com/jobs/view/...">
```

The element was in the DOM from the start — it just was not visible. Playwright's `waitForSelector` defaults to `state: 'visible'`, which spins until the element is both present and visible. Since `div.application_details` starts as `display: none`, the anchor inside it never becomes visible within the timeout.

The fix was to pass `{ state: 'attached' }`, which waits only for the element to exist in the DOM regardless of visibility:

```ts
await page.waitForSelector('.application_details a', { state: 'attached', timeout: 30000 });
```

The `href` attribute is set on the anchor in the initial HTML — visibility is only needed if you want the user to see it, not if you just want to read an attribute. With `state: 'attached'` all four LinkedIn links are extracted correctly without needing to click the apply button or wait for the reveal animation. The apply button wait and click were subsequently removed as dead code.

---

## Express Server

### Structure
`index.ts` is intentionally minimal: one route (`GET /api/jobs`), one error middleware, one `app.listen`. No CORS middleware — the Vite dev proxy handles cross-origin requests in development, so there is nothing to configure on the server side.

### Error handling boundary
`scrapeJobs()` already swallows all scrape failures and returns `[]` (see subtask 2a-3), so the route handler has no try/catch of its own. The error middleware is a safety net for unexpected programming errors (e.g., a thrown exception from a future code change), not for scrape failures. Keeping the two concerns separate avoids double-handling and makes the failure modes explicit: scrape failures are a 200 with `[]`; server bugs are a 500 with `{ error: "message" }`.

---

## Redux Store

### `items: null` as a "not yet fetched" sentinel

The initial state for `items` is `null`, not `[]`. This distinguishes three states that the UI needs to render differently:

- `null` — user has not clicked yet; render nothing
- `[]` — fetch completed, server returned no jobs; render `"No job listings were found."`
- `Job[]` — fetch completed with results; render the table

Using `[]` as the initial value would collapse the first two cases, making it impossible to tell whether an empty result means "the scrape found nothing" or "the page just loaded." The `null` sentinel keeps that distinction explicit and cheap — one extra branch in the render logic, no extra state field needed.

### Error state scope

The `error` field only fires for backend-down / non-2xx responses (the `fetchJobs.rejected` path). Kickertech-side failures (site unreachable, structure changed, no listings) all arrive as a successful 200 with `[]` — by design from the `scrapeJobs()` error handling strategy. This means `error` in the Redux state represents "the Express server is broken", not "the scrape found nothing", which is the correct distinction for the UI to surface to the user.
