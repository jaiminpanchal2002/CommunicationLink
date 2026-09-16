// Vercel Cron target — replaces the setInterval reminder worker.
// Vercel sends `Authorization: Bearer <CRON_SECRET>` when the CRON_SECRET env
// var is set, which we verify so the endpoint cannot be triggered by outsiders.
import { createApp } from '../server/app.js';
import { createPostgresStore } from '../server/store.js';

export default async function handler(req, res) {
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const store = await createPostgresStore(process.env.DATABASE_URL);
  const { runWorker } = createApp({ store, env: process.env });
  await runWorker(new Date());
  await store.flush();
  res.status(200).json({ ok: true, ranAt: new Date().toISOString() });
}
