import prisma from "@/lib/prisma";
import { acceptRequest } from "@/lib/dispatch";
import { generateOTP, hashOTP, signToken, verifyToken } from "@/lib/auth";
import { DEFAULT_TENANT_ID } from "@/lib/tenant";
import type { RequestStatus } from "@/types";

const TEST_CUSTOMER_PHONE = "9000000001";
const TEST_PARTNER_PHONE = "9800000002";
const TEST_LATITUDE = 25.2138;
const TEST_LONGITUDE = 75.8648;
const tenantId = DEFAULT_TENANT_ID;

type CheckResult = {
  name: string;
  ok: boolean;
  detail?: string;
};

const results: CheckResult[] = [];

function check(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`);
}

function requireRecord<T>(name: string, value: T | null | undefined): T {
  check(name, Boolean(value));
  if (!value) throw new Error(`${name} not found`);
  return value;
}

async function main() {
  console.log("Fixoo database verification checklist");

  await prisma.$connect();
  check("database connectivity", true);

  const [vehicleCount, serviceCount, pricingCount, admin, customer, partner] = await Promise.all([
    prisma.vehicleType.count({ where: { tenantId } }),
    prisma.service.count({ where: { tenantId } }),
    prisma.servicePricing.count({ where: { tenantId } }),
    prisma.admin.findUnique({ where: { tenantId_phone: { tenantId, phone: "9999999999" } } }),
    prisma.user.findUnique({ where: { tenantId_phone: { tenantId, phone: TEST_CUSTOMER_PHONE } } }),
    prisma.partner.findUnique({
      where: { tenantId_phone: { tenantId, phone: TEST_PARTNER_PHONE } },
      include: { location: true, vehicleTypes: true },
    }),
  ]);

  check("seed vehicle records", vehicleCount >= 3, `${vehicleCount} vehicle types`);
  check("seed service records", serviceCount >= 3, `${serviceCount} services`);
  check("seed pricing records", pricingCount >= 3, `${pricingCount} pricing rows`);
  requireRecord("seed admin record", admin);
  const testCustomer = requireRecord("test customer record", customer);
  const testPartner = requireRecord("test partner record", partner);
  check("test partner approved and online", testPartner.isApproved && testPartner.isOnline);
  check("test partner location exists", Boolean(testPartner.location));
  check("test partner vehicle support exists", testPartner.vehicleTypes.length >= 3);

  const otpCode = generateOTP();
  await prisma.oTP.create({
    data: {
      tenantId,
      phone: TEST_CUSTOMER_PHONE,
      code: hashOTP(TEST_CUSTOMER_PHONE, "customer", otpCode),
      role: "customer",
      userId: testCustomer.id,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    },
  });

  const token = signToken({
    id: testCustomer.id,
    phone: testCustomer.phone,
    role: "customer",
    name: testCustomer.name ?? undefined,
    tenantId,
  });
  check("login token signing and verification", verifyToken(token)?.id === testCustomer.id);

  const puncture = requireRecord(
    "puncture repair service",
    await prisma.service.findUnique({ where: { tenantId_name: { tenantId, name: "PUNCTURE_REPAIR" } } })
  );
  const bike = requireRecord(
    "bike vehicle type",
    await prisma.vehicleType.findUnique({ where: { tenantId_name: { tenantId, name: "BIKE" } } })
  );
  const pricing = requireRecord(
    "puncture bike pricing",
    await prisma.servicePricing.findUnique({
      where: {
        tenantId_serviceId_vehicleTypeId: {
          tenantId,
          serviceId: puncture.id,
          vehicleTypeId: bike.id,
        },
      },
    })
  );

  const request = await prisma.serviceRequest.create({
    data: {
      tenantId,
      userId: testCustomer.id,
      serviceId: puncture.id,
      vehicleTypeId: bike.id,
      latitude: TEST_LATITUDE,
      longitude: TEST_LONGITUDE,
      address: "Fixoo automated test location",
      area: "Kota Test Area",
      serviceFee: pricing.serviceFee,
      platformFee: pricing.platformFee,
      nightSurcharge: 0,
      totalAmount: pricing.serviceFee.plus(pricing.platformFee),
      status: "REQUESTED",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  });
  check("request creation flow", request.status === "REQUESTED", request.id);

  await prisma.partnerBroadcast.upsert({
    where: {
      tenantId_requestId_partnerId: {
        tenantId,
        requestId: request.id,
        partnerId: testPartner.id,
      },
    },
    update: { response: null, respondedAt: null },
    create: {
      tenantId,
      requestId: request.id,
      partnerId: testPartner.id,
    },
  });

  check("partner acceptance flow", await acceptRequest(request.id, testPartner.id, tenantId));

  for (const status of ["ON_THE_WAY", "ARRIVED", "REPAIR_IN_PROGRESS", "COMPLETED"] as RequestStatus[]) {
    const timestampFields: Record<string, Date> = {};
    if (status === "ON_THE_WAY") timestampFields.onTheWayAt = new Date();
    if (status === "ARRIVED") timestampFields.arrivedAt = new Date();
    if (status === "REPAIR_IN_PROGRESS") timestampFields.startedAt = new Date();
    if (status === "COMPLETED") timestampFields.completedAt = new Date();

    const changed = await prisma.serviceRequest.updateMany({
      where: { id: request.id, tenantId },
      data: { status, ...timestampFields },
    });
    const updated = await prisma.serviceRequest.findFirst({ where: { id: request.id, tenantId } });
    check(`lifecycle ${status}`, changed.count === 1 && updated?.status === status);
  }

  const completedRequest = requireRecord(
    "completed request reload",
    await prisma.serviceRequest.findFirst({ where: { id: request.id, tenantId } })
  );

  await prisma.transaction.upsert({
    where: { tenantId_requestId: { tenantId, requestId: request.id } },
    update: {},
    create: {
      tenantId,
      requestId: request.id,
      partnerId: testPartner.id,
      totalAmount: completedRequest.totalAmount,
      platformFee: completedRequest.platformFee,
      partnerEarning: completedRequest.serviceFee,
      status: "COMPLETED",
      paidAt: new Date(),
    },
  });
  check("completed request transaction", true);

  const failures = results.filter((result) => !result.ok);
  console.log("\nChecklist summary");
  for (const result of results) {
    console.log(`- [${result.ok ? "x" : " "}] ${result.name}${result.detail ? ` (${result.detail})` : ""}`);
  }

  if (failures.length > 0) {
    throw new Error(`${failures.length} verification checks failed`);
  }
}

main()
  .catch((error) => {
    console.error("Database verification failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
