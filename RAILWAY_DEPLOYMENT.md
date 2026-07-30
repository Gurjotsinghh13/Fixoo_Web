# Fixoo Railway Deployment Guide

This backend should be deployed as three Railway services from the same repo:

1. `fixoo-web`: Next.js API/admin/customer web app.
2. `fixoo-socket`: Socket.IO server.
3. `fixoo-worker`: request expiry worker.

Railway exposes one `$PORT` per service, so Socket.IO should not be hidden behind the Next.js web service on port `3001`.

## Build Commands

Use for all services:

```bash
npm install
npm run build
```

## Start Commands

Web service:

```bash
npm run start:web
```

Socket service:

```bash
npm run start:socket
```

Worker service:

```bash
npm run start:worker
```

For the socket service, set:

No separate socket port variable is required on Railway. The socket service reads Railway's `PORT` automatically.

## Migrations

The existing Supabase database was baselined into Prisma migrations. Future deploys should run:

```bash
npx prisma migrate deploy
```

Do not run `prisma migrate reset` on production.

## Required Railway Variables

Database:

```env
DATABASE_URL=
DIRECT_URL=
DATABASE_HEALTH_TIMEOUT_MS=5000
ENABLE_STARTUP_DB_CHECK=false
```

Authentication:

```env
JWT_SECRET=
FIXOO_TENANT_ID=default
```

URLs:

```env
NEXT_PUBLIC_APP_URL=https://<fixoo-web>.up.railway.app
NEXT_PUBLIC_SOCKET_URL=https://<fixoo-socket>.up.railway.app
SOCKET_INTERNAL_URL=https://<fixoo-socket>.up.railway.app
APP_ALLOWED_ORIGINS=<fixoo-web>.up.railway.app
```

Socket:

```env
SOCKET_INTERNAL_SECRET=
SOCKET_ALLOW_REMOTE_EMIT=true
```

OTP:

```env
ENABLE_DEV_OTP=false
MSG91_API_KEY=
MSG91_TEMPLATE_ID=
```

Google Maps:

```env
NEXT_PUBLIC_GOOGLE_MAPS_KEY=
```

Razorpay:

```env
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
NEXT_PUBLIC_RAZORPAY_KEY_ID=
```

Support:

```env
SUPPORT_PHONE=
SUPPORT_WHATSAPP=
```

Worker:

```env
EXPIRY_WORKER_BATCH_SIZE=100
EXPIRY_WORKER_MAX_BATCHES=10
```

## Deployment Steps

1. Push this repo to GitHub.
2. Create Railway project.
3. Create service `fixoo-web` from GitHub repo.
4. Set root directory to `fixoo-web` if deploying from a parent repo.
5. Add environment variables from `.env.example`.
6. Deploy `fixoo-web`.
7. Run migration deploy:

```bash
npx prisma migrate deploy
```

8. Create service `fixoo-socket` from the same repo.
9. Use start command:

```bash
npm run start:socket
```

10. Create service `fixoo-worker` from the same repo.
11. Use start command:

```bash
npm run start:worker
```

13. Set `NEXT_PUBLIC_SOCKET_URL` and `SOCKET_INTERNAL_URL` to the socket service public URL.
14. Redeploy web and worker after socket URL is known.

## GitHub Deployment Checklist

- [ ] `.env` and `.env.local` are not committed.
- [ ] `prisma/migrations` is committed.
- [ ] `package-lock.json` is committed.
- [ ] `railway.json` is committed.
- [ ] `RAILWAY_DEPLOYMENT.md` is committed.
- [ ] Railway variables are configured.
- [ ] Supabase backups are enabled.

## Post-Deployment Verification

Web:

```bash
curl https://<fixoo-web>.up.railway.app/api/health/db
```

Socket:

```bash
curl https://<fixoo-socket>.up.railway.app/health
```

Prisma:

```bash
npx prisma migrate status
npx prisma migrate deploy
```

If Supabase reaches the DB but times out on `pg_advisory_lock`, run:

```bash
PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=1 npx prisma migrate deploy
```

Authentication:

```text
Send OTP -> verify OTP -> /api/auth/me returns current user.
```

Marketplace:

```text
Customer creates request -> partner receives broadcast -> partner accepts -> tracking updates.
```

## Rollback Plan

1. In Railway, redeploy the previous successful deployment for each service.
2. Do not run `migrate reset`.
3. If a migration was deployed and caused issues, create a forward-only corrective migration.
4. If Socket.IO fails, keep web online and temporarily set `DISABLE_SOCKET_EMIT=true` only for diagnosis.
5. Restore Supabase backup only for data corruption incidents.

## Flutter Compatibility

After deployment, Flutter should use:

```bash
--dart-define=FIXOO_API_BASE_URL=https://<fixoo-web>.up.railway.app
--dart-define=FIXOO_SOCKET_URL=https://<fixoo-socket>.up.railway.app
```
