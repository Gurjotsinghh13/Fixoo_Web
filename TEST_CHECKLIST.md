# Fixoo Database and Flow Verification Checklist

## Local PostgreSQL

- [ ] PostgreSQL is installed locally.
- [ ] PostgreSQL is listening on `localhost:5432`.
- [ ] Database `fixoo` exists.
- [ ] User `fixoo` exists with password `fixoo_password`.
- [ ] `.env` uses `DATABASE_URL="postgresql://fixoo:fixoo_password@localhost:5432/fixoo"`.

## Prisma

- [ ] `npx prisma validate` succeeds.
- [ ] `npx prisma db push` succeeds.
- [ ] `npm run db:seed` succeeds.
- [ ] `npm run db:verify` succeeds.

## Seed Data

- [ ] Admin exists: `9999999999`.
- [ ] Vehicle types exist: `BIKE`, `SCOOTER`, `CAR`.
- [ ] Services exist: `PUNCTURE_REPAIR`, `BATTERY_JUMPSTART`, `FUEL_DELIVERY`.
- [ ] Puncture repair pricing exists for bike, scooter, and car.
- [ ] Demo partner exists: `9800000001`.
- [ ] Test customer exists: `9000000001`.
- [ ] Test partner exists: `9800000002`.
- [ ] Test partner is approved, online, has location, and supports all seeded vehicle types.

## Auth and Request Flow

- [ ] OTP record can be created for the test customer.
- [ ] JWT login token can be signed and verified.
- [ ] Test request can be created with status `REQUESTED`.
- [ ] Broadcast record can be created for test partner.
- [ ] Partner can accept the request.
- [ ] Request transitions through:
  - [ ] `REQUESTED`
  - [ ] `ACCEPTED`
  - [ ] `ON_THE_WAY`
  - [ ] `ARRIVED`
  - [ ] `REPAIR_IN_PROGRESS`
  - [ ] `COMPLETED`
- [ ] Completed request has a transaction row.

## Commands

```powershell
npx.cmd prisma validate
npx.cmd prisma db push
npm.cmd run db:seed
npm.cmd run db:verify
```
