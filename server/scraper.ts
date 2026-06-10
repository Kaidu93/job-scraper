import { chromium } from 'playwright';
import * as cheerio from 'cheerio';

export interface PartialJob {
  team: string;
  location: string;
  title: string;
  detailsLink: string;
  salaryMin: number;
  salaryMax: number;
}

export interface Job extends PartialJob {
  linkedInLink: string | null;
}

// Fetches the rendered HTML of a URL using a real Chrome window.
// Patching navigator.webdriver to false prevents Cloudflare from
// identifying the browser as automated.
async function fetchHtml(url: string): Promise<string> {
  const browser = await chromium.launch({ channel: 'chrome', headless: false });
  const context = await browser.newContext();
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('article.creativesplanet-ele-jobs');
  const html = await page.content();
  await browser.close();
  return html;
}

export async function scrapeDetailPage(url: string): Promise<string | null> {
  const browser = await chromium.launch({ channel: 'chrome', headless: false });
  const context = await browser.newContext();
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input.application_button', { timeout: 30000 });
  await page.click('input.application_button');
  await page.waitForSelector('.application_details a', { state: 'attached', timeout: 5000 });
  const html = await page.content();
  await browser.close();

  const $ = cheerio.load(html);
  const href = $('.application_details a').first().attr('href');
  return href ?? null;
}

export async function scrapeJobs(): Promise<Job[]> {
  try {
    const partialJobs = await scrapeListingPage();
    if (partialJobs.length === 0) {
      console.error('scrapeJobs: no job cards found on listing page');
      return [];
    }
    const jobs: Job[] = [];
    for (const partial of partialJobs) {
      let linkedInLink: string | null = null;
      try {
        linkedInLink = await scrapeDetailPage(partial.detailsLink);
      } catch (err) {
        console.error(`scrapeJobs: failed to fetch detail page ${partial.detailsLink}:`, err);
      }
      jobs.push({ ...partial, linkedInLink });
    }
    return jobs;
  } catch (err) {
    console.error('scrapeJobs: scrape failed:', err);
    return [];
  }
}

export async function scrapeListingPage(): Promise<PartialJob[]> {
  const html = await fetchHtml('https://kickertech.com/jobs/');
  const $ = cheerio.load(html);

  const jobs: PartialJob[] = [];

  $('article.creativesplanet-ele-jobs').each((_, el) => {
    const team = $(el).find('h4.pbmit-company-name strong').text().trim();
    const location = $(el).find('.cspt-jobs-location').text().trim();

    const titleEl = $(el).find('h3.pbmit-job-position a');
    const title = titleEl.text().trim();
    const href = titleEl.attr('href') ?? '';
    const detailsLink = href ? new URL(href, 'https://kickertech.com/').toString() : '';

    const salaryText = $(el).find('li.cspt-jobs-salary').text().trim();
    const salaryMatch = salaryText.match(/(\d+)\s*[-–]\s*(\d+)/);
    const salaryMin = salaryMatch ? parseInt(salaryMatch[1], 10) : 0;
    const salaryMax = salaryMatch ? parseInt(salaryMatch[2], 10) : 0;

    jobs.push({ team, location, title, detailsLink, salaryMin, salaryMax });
  });

  return jobs;
}
