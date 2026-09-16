// Vercel serverless entry — handles every /api/* request.
// Loads the tiny records table into memory (sync reads), runs the Express app,
// and flushes queued writes to Neon Postgres *before* the response is sent, so
// a session created during the request is durable the moment the client gets
// its cookie and immediately calls /api/state.
import { createApp } from '../server/app.js';
import { createPostgresStore } from '../server/store.js';

export default async function handler(req, res) {
  // The Express routes are all defined under /api; ensure the prefix is present
  // regardless of how Vercel presents the rewritten path to the function.
  if (!req.url.startsWith('/api')) req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
  const store = await createPostgresStore(process.env.DATABASE_URL);
  const { app } = createApp({ store, env: process.env });

  // Persist queued writes before the bytes leave: defer res.end until flush resolves.
  const originalEnd = res.end.bind(res);
  res.end = (...args) => {
    store.flush().then(() => originalEnd(...args), () => originalEnd(...args));
    return res;
  };

  await new Promise((resolve) => {
    res.once('finish', resolve);
    res.once('close', resolve);
    app(req, res);
  });
  await store.flush();
  // Notification delivery is intentionally NOT done here: sending several emails
  // inline would exceed the serverless request timeout. The outbox is drained by
  // /api/cron (Vercel Cron, and/or a frequent external scheduler).
}
