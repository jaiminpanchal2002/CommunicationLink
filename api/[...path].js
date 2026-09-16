// Vercel serverless entry — handles every /api/* request.
// Loads the tiny records table into memory (sync reads), runs the Express app,
// then flushes queued writes to Neon Postgres before the function returns.
import { createApp } from '../server/app.js';
import { createPostgresStore } from '../server/store.js';

export default async function handler(req, res) {
  // The Express routes are all defined under /api; ensure the prefix is present
  // regardless of how Vercel presents the rewritten path to the function.
  if (!req.url.startsWith('/api')) req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
  const store = await createPostgresStore(process.env.DATABASE_URL);
  const { app } = createApp({ store, env: process.env });
  await new Promise((resolve) => {
    res.once('finish', resolve);
    res.once('close', resolve);
    app(req, res);
  });
  await store.flush();
}
