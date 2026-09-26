-- Enforce at most one active service request per customer per tenant.
-- Closes the check-then-create race in app/api/requests/create/route.ts.
--
-- The status list MUST match ACTIVE_REQUEST_STATUSES in lib/request-lifecycle.ts.
-- Prisma cannot express partial indexes, so this index is not in schema.prisma;
-- if a future `prisma migrate dev` generates a DROP INDEX for it, remove that line.
--
-- If this fails with a unique violation, existing data already has duplicate
-- active requests. Find them with:
--   SELECT "tenantId", "userId", COUNT(*) FROM "service_requests"
--   WHERE "status" IN ('REQUESTED','ACCEPTED','ON_THE_WAY','ARRIVED','REPAIR_IN_PROGRESS')
--   GROUP BY 1, 2 HAVING COUNT(*) > 1;

-- CreateIndex
CREATE UNIQUE INDEX "one_active_request_per_user"
ON "service_requests" ("tenantId", "userId")
WHERE "status" IN ('REQUESTED', 'ACCEPTED', 'ON_THE_WAY', 'ARRIVED', 'REPAIR_IN_PROGRESS');
