# Fixoo

Uber-style roadside assistance marketplace for Kota, Rajasthan.

Built with Next.js 15, TypeScript, Prisma, PostgreSQL, Socket.io, Tailwind CSS,
React Query, Zustand, Razorpay, and Google Maps.

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL database
- For Supabase: transaction pooler URL for app runtime and direct URL for Prisma schema operations

### Install

```bash
npm install
```

### Environment

Copy the example file:

```bash
cp .env.example .env.local
```

For Supabase, keep these two URLs separate:

```env
# Runtime URL used by Next.js API routes, Socket.io server, expiry worker, seed scripts.
# Use Supabase Transaction Pooler.
DATABASE_URL="postgresql://postgres.<project-ref>:<password>@<region>.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true&connection_limit=3&pool_timeout=5&connect_timeout=5"

# Prisma schema operations use this direct URL.
DIRECT_URL="postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres?sslmode=require"
```

Important:

- Do not put the direct Supabase host in `DATABASE_URL` for app runtime.
- Do not use the pooler-style username in `DIRECT_URL`; direct URL username is usually `postgres`.
- Next.js loads `.env.local` before `.env`.
- Prisma CLI loads `.env`.
- The app normalizes runtime env loading through `@next/env` so scripts, Socket.io, and the worker use the same values as Next.js.

For OTP testing without MSG91:

```env
OTP_PROVIDER=mock
```

When enabled, OTPs are generated and saved normally, then printed to the server console instead of being sent through MSG91. The API response remains the same as production.

For real SMS delivery:

```env
OTP_PROVIDER=msg91
MSG91_API_KEY=<your-msg91-api-key>
MSG91_TEMPLATE_ID=<your-msg91-template-id>
```

`ENABLE_DEV_OTP=true` is still supported for older local setups, but `OTP_PROVIDER=mock` is preferred for Railway test deployments.

### Database

```bash
npx prisma generate
npx prisma validate
npx prisma db push
npm run db:seed
```

### Development

```bash
npm run dev
```

This starts:

- Next.js on http://localhost:3000
- Socket.io on http://localhost:3001
- Request expiry worker, polling every 15 seconds

The default dev script uses the standard Next.js dev bundler. This is the
stable mode for Windows because it avoids intermittent Turbopack temp-file
races such as `.next/static/development/_buildManifest.js.tmp.*` ENOENT
errors.

```bash
next dev
```

If you specifically want to test Turbopack, run:

```bash
npm run dev:turbo
```

## Test Accounts

| Role | Phone | OTP |
| --- | --- | --- |
| Admin | 9999999999 | Printed in terminal when `ENABLE_DEV_OTP=true` |
| Test Customer | 9000000001 | Printed in terminal |
| Demo Partner | 9800000001 | Printed in terminal |
| Test Partner | 9800000002 | Printed in terminal |

## App Routes

| Route | Description |
| --- | --- |
| `/login` | Customer OTP login |
| `/home` | Customer home and vehicle selection |
| `/request` | Request creation |
| `/tracking/[id]` | Live request tracking |
| `/history` | Customer request history |
| `/profile` | Customer profile and support |
| `/partner/login` | Partner OTP login |
| `/partner/register` | Partner application flow |
| `/partner/application-status` | Pending/rejected/suspended partner status |
| `/partner/dashboard` | Online toggle and incoming jobs |
| `/partner/job/[id]` | Active job status controls |
| `/partner/earnings` | Partner earnings and performance |
| `/partner/profile` | Partner profile setup |
| `/admin/dashboard` | Admin operations overview |
| `/admin/partner-applications` | Partner approval queue |
| `/admin/partners` | Partner management |
| `/admin/requests` | Request management |
| `/admin/requests/[id]` | Request detail and recovery actions |
| `/admin/operations` | Failed/no-show/support queues |
| `/admin/transactions` | Transactions and payment actions |
| `/admin/analytics` | Marketplace analytics |
| `/admin/pricing` | Pricing configuration |

## Architecture

```text
Customer App  <->  Next.js API Routes  <->  PostgreSQL via Prisma
                         |
                         v
                  Socket.io Server
                         |
                         v
Partner App   <->  Dispatch + Worker  <->  Realtime events
```

### Prisma Runtime

- API routes import `@/lib/prisma`.
- Plain Node services import `server/prisma.js`.
- Both paths load environment variables before Prisma Client is constructed.
- Runtime uses `DATABASE_URL`.
- Prisma schema operations use `DIRECT_URL` through `prisma/schema.prisma`.

### Request Lifecycle

```text
REQUESTED
-> ACCEPTED
-> ON_THE_WAY
-> ARRIVED
-> REPAIR_IN_PROGRESS
-> COMPLETED
```

Completion creates exactly one transaction per request through unique request constraints and idempotent transaction creation.

### Dispatch Rules

Partners only receive and accept jobs when:

- `applicationStatus = APPROVED`
- `isApproved = true`
- `isSuspended = false`
- `isOnline = true`
- no active job is assigned

## Scripts

```bash
npm run dev                         # Next.js + Socket.io + expiry worker
npm run build                       # Production build
npm run lint                        # ESLint
npm run db:push                     # Prisma db push
npm run db:seed                     # Seed database
npm run db:verify                   # Database flow verification
npm run worker:expiry               # Run only expiry worker
npm run worker:expiry:verify        # Verify expiry worker logic
npm run verify:completion-idempotency
npm run verify:financial-reporting
npm run verify:partner-approval
npm run verify:partner-socket-approval
npm run audit:financial-state
```

## Health Checks

Database health:

```bash
curl http://localhost:3000/api/health/db
```

Socket health:

```bash
curl http://localhost:3001/health
```

Detailed DB health requires admin authentication:

```bash
curl "http://localhost:3000/api/health/db?details=true"
```

## Production Notes

- Use strong `JWT_SECRET` and `SOCKET_INTERNAL_SECRET`.
- Keep `.env` and `.env.local` out of Git.
- In Vercel, set `DATABASE_URL` to the Supabase transaction pooler URL.
- Set `DIRECT_URL` to the Supabase direct DB URL for Prisma operations.
- Run Socket.io and the expiry worker as persistent Node processes.
- Configure database backups in Supabase before pilot launch.

## Troubleshooting Database Connectivity

If Prisma CLI works but runtime fails:

1. Check `.env.local`; Next runtime loads it before `.env`.
2. Ensure `DATABASE_URL` is the pooler URL.
3. Ensure `DIRECT_URL` is the direct URL.
4. Restart `npm run dev`; stale Node processes can hold old env values.
5. Run:

```bash
node -e "require('./server/load-env').loadRuntimeEnv(); for (const k of ['DATABASE_URL','DIRECT_URL']) { const u = new URL(process.env[k]); console.log(k, u.hostname, u.port || '5432', u.username); }"
```

Expected:

```text
DATABASE_URL <pooler-host> 6543 postgres.<project-ref>
DIRECT_URL db.<project-ref>.supabase.co 5432 postgres
```

## Business Model

| Transaction | Customer Pays | Partner Gets | Fixoo Gets |
| --- | ---: | ---: | ---: |
| Bike puncture | Rs. 219 | Rs. 199 | Rs. 20 |
| Car puncture | Rs. 379 | Rs. 349 | Rs. 30 |

Pricing is configurable from Admin -> Pricing.

## Support

- Admin phone: 9999999999
- Support phone is configurable through environment/app settings.



