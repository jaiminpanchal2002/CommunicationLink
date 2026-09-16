// Single entry for every /api/* request. Vercel's catch-all filename did not
// reliably match nested paths (e.g. /api/topics/:id), so vercel.json rewrites
// all /api/* here and passes the real sub-path as ?__p=..., which we turn back
// into req.url before Express routes it. Durable writes flush before responding.
import { createApp } from '../server/app.js';
import { createPostgresStore } from '../server/store.js';

export default async function handler(req, res) {
  const parsed = new URL(req.url, 'http://local');
  const forwarded = parsed.searchParams.get('__p');
  if (forwarded !== null) {
    parsed.searchParams.delete('__p');
    const qs = parsed.searchParams.toString();
    req.url = '/api/' + forwarded + (qs ? '?' + qs : '');
  } else if (!req.url.startsWith('/api')) {
    req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
  }

  const store = await createPostgresStore(process.env.DATABASE_URL);
  const { app } = createApp({ store, env: process.env });

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
}
