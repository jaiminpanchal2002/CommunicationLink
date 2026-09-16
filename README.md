# Together

A private two-person space for weekend conversations, shared agreements, goals, appreciation and monthly household planning.

## Open the app

Requires Node.js 24. Run `npm install`, then `npm run dev`. Open http://127.0.0.1:5173.

The first local user creates an account without an invitation. Enter your name, email, a password of at least 12 characters, and your WhatsApp number with country code. Spaces in phone numbers are accepted.

After registering, open **Settings → Get partner invite code**. Your partner creates their separate account using that code. Registration closes after two accounts. Sign in with the details you created; the interactive demo has no login credentials and creates no real account.

Local personal data is stored in `data/together.sqlite`. The old root-level `together.sqlite` was a development scratch database and is preserved separately. Automated tests use isolated databases and never modify your personal accounts.

## Included

- Password hashing, private cookie sessions, two-member invitations and server authorization.
- Private drafts, shared topics, recipient-only future Saturday/Sunday scheduling in India Standard Time, overlap checks, and discussion takeaways.
- In-app notifications, WhatsApp and email adapters, provider status, bounded retry handling, discussion reminders and monthly reminders on the 7th.
- Shared goals, five starter agreements requiring acceptance, and appreciation notes.
- Separate monthly incomes, shared expense/savings targets, proportional contribution calculations, account labels and last four digits, transfer checklists, and conflict protection against stale financial edits.
- Responsive interface and a separate interactive sample-data demo.

## WhatsApp and email

Open **Settings** to save sender/gateway details and run a connection check. Secrets are stored in the private server `.env`, not returned by the API. Gmail uses smtp.gmail.com, port 465 with TLS, and an app password. Saving settings takes effect immediately. The check verifies credentials without sending a message.

Conversation priority is Low, Normal, or Urgent, independent of its draft/pending/scheduled/discussed status. Priority does not override weekend or recipient-only scheduling rules.

Scheduling emails both members a Google Calendar-compatible iCalendar invitation. Accept through your calendar client; Gmail behavior depends on the recipient's account and invitation settings. Updates retain the event UID and increment its sequence. A scheduled conversation also offers an authenticated calendar-file download. Calendar entries use a generic title and do not expose the discussion content. RSVP responses are not synchronized back into Together; this is an email invitation integration, not Google OAuth calendar synchronization.

Copy `.env.example` to `.env` and configure your provider. No real external messages are sent until a provider is connected. In-app notifications work without providers. The server must remain running for scheduled reminders.

OpenWA: set `OPENWA_BASE_URL`, `OPENWA_API_KEY`, and `OPENWA_SESSION_ID`; link a sender number in your OpenWA dashboard. Evolution API is also supported through its three corresponding environment variables and takes priority when configured. SMTP email requires the SMTP settings in `.env.example`.

OpenWA is self-hosted open-source software, not a free hosted WhatsApp account. Hosting may cost money, and unofficial WhatsApp connections may be restricted. Provider acceptance is shown separately from confirmed delivery; this app has no delivery receipt integration. Read [OpenWA](https://github.com/rmyndharis/OpenWA) and [Evolution API](https://github.com/evolution-foundation/evolution-api). API directories [Public APIs](https://github.com/public-apis/public-apis) and [Free APIs](https://free-apis.github.io/) do not replace a configured messaging gateway.

## Deployment

### Persistent Node host (Railway, Render, Fly.io, a VPS)

Run `npm run build`, then `npm start`. Use a persistent Node server and private disk storage, not ephemeral serverless storage. Set `NODE_ENV=production`, `SETUP_CODE`, `APP_ORIGIN` to your exact HTTPS origin, `DATABASE_PATH` to persistent storage, and the appropriate `HOST`. Hosted first-user signup requires the private setup code; code-free signup is restricted to a local development installation. HTTPS is required for production session cookies.

### Vercel + Neon Postgres (serverless)

The app also runs on Vercel with a Neon Postgres database. On this path the SQLite file store is replaced by `server/store.js`'s Postgres store: the small `records` table is loaded into memory per request for synchronous reads, and queued writes are flushed to Neon before each serverless response returns (`api/[...path].js`). Scheduled reminders move from the in-process `setInterval` worker to `api/cron.js`, invoked by the Vercel Cron entry in `vercel.json`.

1. Create a Neon project and copy the **pooled** connection string (`...-pooler...?sslmode=require`).
2. `npm i -g vercel && vercel login`, then run `vercel` from the project root to create the project.
3. Set these Production environment variables (Vercel dashboard or `vercel env add`):
   - `DATABASE_URL` — the Neon pooled connection string. **Required.**
   - `SETUP_CODE` — private code required to register the first account. **Required.**
   - `APP_ORIGIN` — your exact origin, e.g. `https://<project>.vercel.app`. **Required** — without it every non-GET request is rejected as a cross-origin request (HTTP 403).
   - `CRON_SECRET` — a long random string. Vercel sends it as `Authorization: Bearer <CRON_SECRET>` to the cron endpoint, which `api/cron.js` verifies.
   - `SMTP_*`, `EVOLUTION_*` / `OPENWA_*` — optional email, calendar and WhatsApp providers.
4. Deploy with `vercel --prod`, open the URL, and register the first account with `SETUP_CODE`.

`NODE_ENV=production` is set by Vercel automatically, which enables `Secure` session cookies over the required HTTPS.

**Reminder scheduling.** `vercel.json` schedules `/api/cron` once daily (`0 3 * * *`) so it deploys on the Vercel Hobby plan, which allows only daily cron jobs. The daily run covers the monthly (7th) reminder but not the one-hour-before-conversation reminder. For the hourly reminder either upgrade to Vercel Pro and change the schedule to `0 * * * *`, or trigger the endpoint from any external scheduler. Example for a free service such as cron-job.org, running every hour:

```
POST https://<project>.vercel.app/api/cron
Header: Authorization: Bearer <CRON_SECRET>
```

**Serverless notes.** The login rate limiter is in-memory, so on serverless it is per-invocation rather than global; the write-through store flushes after the response is sent. Both are acceptable for a private two-member app.

Keep the database and backups private. There is no bank connection or automated money transfer. Account recovery, notification preferences, and end-to-end encryption are not implemented in this version. Financial allocations are user-selected budget calculations, not bank or investment recommendations.

## Verification

- `npm test`: isolated server integration tests.
- `npm run build`: TypeScript and production bundle.
- `node tests/real-browser-check.mjs`: isolated real-account browser workflow against the built app (Microsoft Edge required).
- With the dev server running, `node tests/browser-check.mjs`: demo and mobile layout checks.

Detailed backend configuration: [docs/backend.md](docs/backend.md).
