import express, { NextFunction, Request, Response } from 'express';
import { scrapeJobs } from './scraper';

const app = express();

app.get('/api/jobs', async (_req: Request, res: Response) => {
  const jobs = await scrapeJobs();
  res.json(jobs);
});

app.use((_err: Error, _req: Request, res: Response, _next: NextFunction) => {
  res.status(500).json({ error: _err.message });
});

app.listen(3000, () => {
  console.log('Server listening on port 3000');
});
