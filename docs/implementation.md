# Together implementation plan

Approved scope: a private two-person application for discussions, weekend scheduling, agreements, goals, appreciation, and monthly household allocations. Recipient alone chooses the date and time. Topic creation notifies the recipient; scheduling notifies the creator.

Architecture: React/TypeScript frontend, Express JSON API, persistent SQLite using Node 24, cookie sessions, server-side authorization, private invitation-based registration. OpenWA server adapter and SMTP email transport use environment credentials only. Explicit demo preview uses separate client-only sample data and never sends notifications.

- [x] Backend: test authentication, two-member pairing, private drafts, recipient-only scheduling, weekend validation, notifications, and persistence. Implement API in server/*.js.
- [x] Frontend: build responsive dashboard, topic forms/detail/scheduling, calendar, goals, agreements, money, notifications, account setup in src/.
- [x] Integrations: provider configuration and honest delivery status; recurring 7th reminder with deduplication. No live messages during testing.
- [x] Verification: automated backend tests, TypeScript/build, browser flows and mobile layout. Document deployment and credentials required.

API contract: GET /api/state returns {user,partner,topics,goals,agreements,appreciations,notifications,finance,integration}. User: {id,name,email,whatsapp}. Topic: {id,authorId,title,description,category,status,date,time,duration,outcome,createdAt}. Goal: {id,title,target,current,unit}. Agreement: {id,text,acceptedBy:string[]}. Finance: {month,incomes:Record<userId,number>,expenses:number,savings:number,accounts:[],transfers:[]}. All authenticated mutations return JSON, errors {error:string}.

Endpoints: POST /api/register {name,email,password,whatsapp,inviteCode?}; /api/login {email,password}; /api/logout; GET /api/invite; POST /api/topics {title,description,category,draft}; PATCH /api/topics/:id {action:'publish'|'schedule'|'resolve',date?,time?,duration?,outcome?}; POST /api/goals; PATCH /api/goals/:id {current}; POST /api/agreements {text}; PATCH /api/agreements/:id; POST /api/appreciations {text}; PUT /api/finance {month,income,expenses,savings,accounts,transfers}; POST /api/notifications/read. All data belongs to the single couple, private drafts filtered server-side.

Visual direction: bespoke consumer dashboard, sage accent, off-white canvas, white surfaces, Lora headings and clean sans body; low motion (2/10), moderate density (5/10), visual variance 5/10. UI/UX Pro Max and Emil interaction rules guide product UI; Taste applies to welcome composition, not dense dashboard rules. Visible focus, native accessible dialogs, reduced motion, 44px controls, no fabricated live state.
