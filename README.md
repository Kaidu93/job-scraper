# Kickertech Job Scraper

A full-stack web application that scrapes job listings from [kickertech.com/jobs](https://kickertech.com/jobs/) on demand and displays them in a structured table.

Built as a take-home assessment for the Full Stack Javascript Developer role at Kickertech.

## What It Does

Click a single button. The app fetches all current job listings and displays them with team, location, title, salary range, a link to the job detail page, and a direct LinkedIn application link.

The LinkedIn link requires a second HTTP pass — it lives inside a hidden element on each job's detail page and is extracted directly from the DOM without any interaction.

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js + Express + TypeScript |
| Scraping | Playwright (page fetching) + Cheerio (HTML parsing) |
| Frontend | React + TypeScript + Vite |
| State | Redux Toolkit |

**Why Playwright instead of fetch/axios?** `kickertech.com` is behind Cloudflare's Managed Challenge, which returns 403 to any plain HTTP client regardless of headers. Playwright drives a real Chrome window with `navigator.webdriver` patched to `false` — the flag Cloudflare uses to detect automation — so the challenge passes silently. Cheerio still does all HTML parsing; Playwright is only used to obtain the rendered HTML.

## Prerequisites

- Node.js 18+
- npm
- Google Chrome installed (Playwright uses the system Chrome binary)

## Setup

**1. Install server dependencies and the Playwright browser**

```bash
cd server
npm install
npx playwright install chromium
```

**2. Install client dependencies**

```bash
cd client
npm install
```

## Running the App

Both processes must be running simultaneously.

**Terminal 1 — start the Express server (port 3000):**

```bash
cd server
npm start
```

**Terminal 2 — start the Vite dev server:**

```bash
cd client
npm run dev
```

Open the URL printed by Vite (typically `http://localhost:5173`) and click **Scrape Jobs**.

The Vite dev proxy forwards `/api` requests to `http://localhost:3000`, so no CORS configuration is needed.

## Project Structure

```
├── server/
│   ├── index.ts       # Express entry point — GET /api/jobs
│   └── scraper.ts     # scrapeJobs(): listing page + detail pages
└── client/
    └── src/
        ├── store/
        │   ├── index.ts       # Redux store config
        │   └── jobsSlice.ts   # fetchJobs thunk + state shape
        └── components/
            └── JobList.tsx    # Button, loading, error, and results table
```

## API

### `GET /api/jobs`

Returns an array of job objects. Always responds 200 — scrape failures (site unreachable, structure changed, no listings) collapse to an empty array so the frontend has a single empty-state surface to render.

```ts
{
  team: string
  location: string
  title: string
  detailsLink: string
  salaryMin: number
  salaryMax: number
  linkedInLink: string | null  // null if the detail page had no LinkedIn link
}
```

## Notes

- Each scrape opens a single Chrome window — this is expected. All pages (listing + detail pages) are fetched within that one window, which closes when the scrape completes.
- Detail pages are fetched sequentially (not in parallel) to avoid triggering rate limiting.
- No database, no caching — data is fetched fresh on every button click.
