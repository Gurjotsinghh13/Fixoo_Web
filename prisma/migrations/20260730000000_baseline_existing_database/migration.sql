-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('REQUESTED', 'ACCEPTED', 'ON_THE_WAY', 'ARRIVED', 'REPAIR_IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "BroadcastResponse" AS ENUM ('ACCEPTED', 'REJECTED', 'TIMEOUT');

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default',

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partners" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shopName" TEXT NOT NULL,
    "address" TEXT,
    "serviceRadius" INTEGER NOT NULL DEFAULT 3,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "isSuspended" BOOLEAN NOT NULL DEFAULT false,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalJobs" INTEGER NOT NULL DEFAULT 0,
    "completedJobs" INTEGER NOT NULL DEFAULT 0,
    "acceptanceRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default',
    "aadhaarNumber" TEXT,
    "addressProofUrl" TEXT,
    "applicationNotes" TEXT,
    "applicationStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "approvedAt" TIMESTAMP(3),
    "emergencyContact" TEXT,
    "idProofUrl" TEXT,
    "lastCompletedAt" TIMESTAMP(3),
    "lastOnlineAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "shopPhotoUrl" TEXT,
    "suspendedAt" TIMESTAMP(3),
    "workingHours" TEXT,
    "area" TEXT,
    "pincode" TEXT,

    CONSTRAINT "partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_activities" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default',
    "partnerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "note" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_review_notes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default',
    "partnerId" TEXT NOT NULL,
    "adminId" TEXT,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_review_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_locations" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default',
    "accuracy" DOUBLE PRECISION,
    "heading" DOUBLE PRECISION,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "speed" DOUBLE PRECISION,

    CONSTRAINT "partner_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_vehicle_types" (
    "partnerId" TEXT NOT NULL,
    "vehicleTypeId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default',

    CONSTRAINT "partner_vehicle_types_pkey" PRIMARY KEY ("tenantId","partnerId","vehicleTypeId")
);

-- CreateTable
CREATE TABLE "vehicle_types" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "icon" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "tenantId" TEXT NOT NULL DEFAULT 'default',

    CONSTRAINT "vehicle_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "category" TEXT NOT NULL DEFAULT 'ROADSIDE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "tenantId" TEXT NOT NULL DEFAULT 'default',

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_pricing" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "vehicleTypeId" TEXT NOT NULL,
    "serviceFee" DECIMAL(10,2) NOT NULL,
    "platformFee" DECIMAL(10,2) NOT NULL,
    "nightSurcharge" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "etaMin" INTEGER NOT NULL DEFAULT 10,
    "etaMax" INTEGER NOT NULL DEFAULT 20,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "tenantId" TEXT NOT NULL DEFAULT 'default',

    CONSTRAINT "service_pricing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "partnerId" TEXT,
    "serviceId" TEXT NOT NULL,
    "vehicleTypeId" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "address" TEXT,
    "area" TEXT,
    "serviceFee" DECIMAL(10,2) NOT NULL,
    "platformFee" DECIMAL(10,2) NOT NULL,
    "nightSurcharge" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "searchRadius" INTEGER NOT NULL DEFAULT 3,
    "expiresAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "onTheWayAt" TIMESTAMP(3),
    "arrivedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default',
    "estimatedDistanceKm" DOUBLE PRECISION,
    "estimatedEtaSeconds" INTEGER,
    "etaUpdatedAt" TIMESTAMP(3),
    "noShowAt" TIMESTAMP(3),
    "noShowReason" TEXT,
    "noShowType" TEXT,
    "supportReason" TEXT,
    "supportStatus" TEXT,
    "supportUpdatedAt" TIMESTAMP(3),

    CONSTRAINT "service_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_feedback" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default',
    "requestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "partnerId" TEXT,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_support_notes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default',
    "requestId" TEXT NOT NULL,
    "adminId" TEXT,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "request_support_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_status_history" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default',
    "requestId" TEXT NOT NULL,
    "adminId" TEXT,
    "actorRole" TEXT NOT NULL,
    "actorId" TEXT,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "request_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_broadcasts" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seenAt" TIMESTAMP(3),
    "response" "BroadcastResponse",
    "respondedAt" TIMESTAMP(3),
    "tenantId" TEXT NOT NULL DEFAULT 'default',

    CONSTRAINT "partner_broadcasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otps" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'customer',
    "userId" TEXT,
    "partnerId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "tenantId" TEXT NOT NULL DEFAULT 'default',

    CONSTRAINT "otps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "platformFee" DECIMAL(10,2) NOT NULL,
    "partnerEarning" DECIMAL(10,2) NOT NULL,
    "paymentMethod" TEXT,
    "razorpayId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL DEFAULT 'default',
    "paymentEvidenceUrl" TEXT,
    "paymentNote" TEXT,
    "refundedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "partnerId" TEXT,
    "requestId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL DEFAULT 'default',

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admins" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'SUPER_ADMIN',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL DEFAULT 'default',

    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" TEXT NOT NULL,
    "adminId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL DEFAULT 'default',

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'string',
    "label" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default',

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE INDEX "users_tenantId_idx" ON "users"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenantId_phone_key" ON "users"("tenantId", "phone");

-- CreateIndex
CREATE INDEX "partners_isOnline_isApproved_idx" ON "partners"("isOnline", "isApproved");

-- CreateIndex
CREATE INDEX "partners_tenantId_idx" ON "partners"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "partners_tenantId_phone_key" ON "partners"("tenantId", "phone");

-- CreateIndex
CREATE INDEX "partner_activities_tenantId_partnerId_idx" ON "partner_activities"("tenantId", "partnerId");

-- CreateIndex
CREATE INDEX "partner_activities_type_idx" ON "partner_activities"("type");

-- CreateIndex
CREATE INDEX "partner_review_notes_tenantId_partnerId_idx" ON "partner_review_notes"("tenantId", "partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "partner_locations_partnerId_key" ON "partner_locations"("partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "partner_locations_tenantId_partnerId_key" ON "partner_locations"("tenantId", "partnerId");

-- CreateIndex
CREATE INDEX "partner_vehicle_types_tenantId_idx" ON "partner_vehicle_types"("tenantId");

-- CreateIndex
CREATE INDEX "vehicle_types_tenantId_idx" ON "vehicle_types"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_types_tenantId_name_key" ON "vehicle_types"("tenantId", "name");

-- CreateIndex
CREATE INDEX "services_tenantId_idx" ON "services"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "services_tenantId_name_key" ON "services"("tenantId", "name");

-- CreateIndex
CREATE INDEX "service_pricing_tenantId_idx" ON "service_pricing"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "service_pricing_tenantId_serviceId_vehicleTypeId_key" ON "service_pricing"("tenantId", "serviceId", "vehicleTypeId");

-- CreateIndex
CREATE INDEX "service_requests_userId_idx" ON "service_requests"("userId");

-- CreateIndex
CREATE INDEX "service_requests_partnerId_idx" ON "service_requests"("partnerId");

-- CreateIndex
CREATE INDEX "service_requests_tenantId_idx" ON "service_requests"("tenantId");

-- CreateIndex
CREATE INDEX "service_requests_status_idx" ON "service_requests"("status");

-- CreateIndex
CREATE INDEX "service_requests_status_expiresAt_idx" ON "service_requests"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "service_requests_createdAt_idx" ON "service_requests"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "customer_feedback_requestId_key" ON "customer_feedback"("requestId");

-- CreateIndex
CREATE INDEX "customer_feedback_tenantId_idx" ON "customer_feedback"("tenantId");

-- CreateIndex
CREATE INDEX "customer_feedback_tenantId_partnerId_idx" ON "customer_feedback"("tenantId", "partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "customer_feedback_tenantId_requestId_key" ON "customer_feedback"("tenantId", "requestId");

-- CreateIndex
CREATE INDEX "request_support_notes_tenantId_requestId_idx" ON "request_support_notes"("tenantId", "requestId");

-- CreateIndex
CREATE INDEX "request_status_history_tenantId_requestId_idx" ON "request_status_history"("tenantId", "requestId");

-- CreateIndex
CREATE INDEX "partner_broadcasts_tenantId_idx" ON "partner_broadcasts"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "partner_broadcasts_requestId_partnerId_key" ON "partner_broadcasts"("requestId", "partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "partner_broadcasts_tenantId_requestId_partnerId_key" ON "partner_broadcasts"("tenantId", "requestId", "partnerId");

-- CreateIndex
CREATE INDEX "otps_phone_used_idx" ON "otps"("phone", "used");

-- CreateIndex
CREATE INDEX "otps_tenantId_phone_role_used_idx" ON "otps"("tenantId", "phone", "role", "used");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_requestId_key" ON "transactions"("requestId");

-- CreateIndex
CREATE INDEX "transactions_tenantId_idx" ON "transactions"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_tenantId_requestId_key" ON "transactions"("tenantId", "requestId");

-- CreateIndex
CREATE INDEX "notifications_tenantId_idx" ON "notifications"("tenantId");

-- CreateIndex
CREATE INDEX "admins_tenantId_idx" ON "admins"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "admins_tenantId_phone_key" ON "admins"("tenantId", "phone");

-- CreateIndex
CREATE INDEX "activity_logs_entity_entityId_idx" ON "activity_logs"("entity", "entityId");

-- CreateIndex
CREATE INDEX "activity_logs_tenantId_idx" ON "activity_logs"("tenantId");

-- CreateIndex
CREATE INDEX "app_settings_tenantId_idx" ON "app_settings"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "app_settings_tenantId_key_key" ON "app_settings"("tenantId", "key");

-- AddForeignKey
ALTER TABLE "partner_activities" ADD CONSTRAINT "partner_activities_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_review_notes" ADD CONSTRAINT "partner_review_notes_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_locations" ADD CONSTRAINT "partner_locations_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_vehicle_types" ADD CONSTRAINT "partner_vehicle_types_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_vehicle_types" ADD CONSTRAINT "partner_vehicle_types_vehicleTypeId_fkey" FOREIGN KEY ("vehicleTypeId") REFERENCES "vehicle_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_pricing" ADD CONSTRAINT "service_pricing_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_pricing" ADD CONSTRAINT "service_pricing_vehicleTypeId_fkey" FOREIGN KEY ("vehicleTypeId") REFERENCES "vehicle_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_vehicleTypeId_fkey" FOREIGN KEY ("vehicleTypeId") REFERENCES "vehicle_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_feedback" ADD CONSTRAINT "customer_feedback_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_feedback" ADD CONSTRAINT "customer_feedback_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "service_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_feedback" ADD CONSTRAINT "customer_feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_support_notes" ADD CONSTRAINT "request_support_notes_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "service_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_status_history" ADD CONSTRAINT "request_status_history_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "service_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_broadcasts" ADD CONSTRAINT "partner_broadcasts_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_broadcasts" ADD CONSTRAINT "partner_broadcasts_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "service_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "otps" ADD CONSTRAINT "otps_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "otps" ADD CONSTRAINT "otps_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "service_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "service_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

