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
  const { app, runWorker } = createApp({ store, env: process.env });

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

  // After any state-changing request, drain the notification outbox now instead
  // of waiting for the daily cron, so emails/WhatsApp go out within seconds of
  // the action. Time-based reminders (monthly, discussion) still run via /api/cron.
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method || 'GET')) {
    try { await runWorker(new Date()); await store.flush(); } catch { /* delivery retries on the next action or cron */ }
  }
}
