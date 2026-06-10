import { chromium, type BrowserContext } from 'playwright';
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

async function scrapeListingPage(context: BrowserContext): Promise<PartialJob[]> {
  const page = await context.newPage();
  try {
    await page.goto('https://kickertech.com/jobs/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('article.creativesplanet-ele-jobs');
    const html = await page.content();
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
  } finally {
    await page.close();
  }
}

async function scrapeDetailPage(context: BrowserContext, url: string): Promise<string | null> {
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('input.application_button', { timeout: 30000 });
    await page.click('input.application_button');
    await page.waitForSelector('.application_details a', { state: 'attached', timeout: 5000 });
    const html = await page.content();
    const $ = cheerio.load(html);
    return $('.application_details a').first().attr('href') ?? null;
  } finally {
    await page.close();
  }
}

export async function scrapeJobs(): Promise<Job[]> {
  const browser = await chromium.launch({ channel: 'chrome', headless: false });
  const context = await browser.newContext();
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  await context.newPage();
  try {
    const partialJobs = await scrapeListingPage(context);
    if (partialJobs.length === 0) {
      console.error('scrapeJobs: no job cards found on listing page');
      return [];
    }
    const jobs: Job[] = [];
    for (const partial of partialJobs) {
      let linkedInLink: string | null = null;
      try {
        linkedInLink = await scrapeDetailPage(context, partial.detailsLink);
      } catch (err) {
        console.error(`scrapeJobs: failed to fetch detail page ${partial.detailsLink}:`, err);
      }
      jobs.push({ ...partial, linkedInLink });
    }
    return jobs;
  } catch (err) {
    console.error('scrapeJobs: scrape failed:', err);
    return [];
  } finally {
    await browser.close();
  }
}
