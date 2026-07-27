import { NextRequest } from "next/server";
import { hashOTP, signToken } from "@/lib/auth";
import { signPartnerRegistrationToken } from "@/lib/partner-registration-token";
import prisma from "@/lib/prisma";

process.env.DISABLE_SOCKET_EMIT = "true";

const suffix = String(Date.now()).slice(-8);
const phone = `97${suffix}`;
let partnerId = "";
let customerId = "";
let vehicleTypeId = "";
let serviceId = "";
const requestIds: string[] = [];

function check(name: string, condition: unknown) {
  if (!condition) throw new Error(`FAIL: ${name}`);
  console.log(`PASS: ${name}`);
}

function request(
  url: string,
  method: string,
  body?: unknown,
  token?: string
) {
  return new NextRequest(url, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Cookie: `fixoo_token=${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function createRequest(status: "REQUESTED" = "REQUESTED") {
  const created = await prisma.serviceRequest.create({
    data: {
      tenantId: "default",
      userId: customerId,
      serviceId,
      vehicleTypeId,
      status,
      latitude: 25.2138,
      longitude: 75.8648,
      serviceFee: 199,
      platformFee: 20,
      totalAmount: 219,
      expiresAt: new Date(Date.now() + 60_000),
    },
  });
  requestIds.push(created.id);
  return created;
}

async function cleanup() {
  if (requestIds.length) {
    await prisma.notification.deleteMany({ where: { requestId: { in: requestIds } } });
    await prisma.requestStatusHistory.deleteMany({ where: { requestId: { in: requestIds } } });
    await prisma.partnerBroadcast.deleteMany({ where: { requestId: { in: requestIds } } });
    await prisma.transaction.deleteMany({ where: { requestId: { in: requestIds } } });
    await prisma.serviceRequest.deleteMany({ where: { id: { in: requestIds } } });
  }
  if (partnerId) {
    await prisma.activityLog.deleteMany({ where: { entity: "partner", entityId: partnerId } });
    await prisma.partner.deleteMany({ where: { id: partnerId } });
  }
  if (customerId) await prisma.user.deleteMany({ where: { id: customerId } });
  if (serviceId) await prisma.service.deleteMany({ where: { id: serviceId } });
  if (vehicleTypeId) {
    await prisma.vehicleType.deleteMany({ where: { id: vehicleTypeId } });
  }
  await prisma.oTP.deleteMany({ where: { phone } });
}

async function main() {
  const [
    { POST: registerPartner },
    { POST: verifyOtp },
    { POST: setOnline },
    { POST: acceptRequestRoute },
    { PATCH: updatePartner },
    { dispatchRequest },
  ] = await Promise.all([
    import("@/app/api/partner/register/route"),
    import("@/app/api/auth/verify-otp/route"),
    import("@/app/api/partner/online/route"),
    import("@/app/api/requests/accept/route"),
    import("@/app/api/admin/partners/route"),
    import("@/lib/dispatch"),
  ]);

  await cleanup();

  const [vehicleType, service, customer, admin] = await Promise.all([
    prisma.vehicleType.create({
      data: {
        tenantId: "default",
        name: `APPROVAL_TEST_${suffix}`,
        displayName: "Approval Test Vehicle",
        sortOrder: 999,
      },
    }),
    prisma.service.create({
      data: {
        tenantId: "default",
        name: `APPROVAL_TEST_SERVICE_${suffix}`,
        displayName: "Approval Test Service",
      },
    }),
    prisma.user.create({
      data: {
        tenantId: "default",
        phone: `96${suffix}`,
        name: "Approval Test Customer",
      },
    }),
    prisma.admin.findFirstOrThrow({
      where: { tenantId: "default", isActive: true },
    }),
  ]);
  vehicleTypeId = vehicleType.id;
  serviceId = service.id;
  customerId = customer.id;

  const document = "data:image/png;base64,aGVsbG8=";
  const registrationResponse = await registerPartner(
    request("http://localhost/api/partner/register", "POST", {
      phone,
      name: "Approval Test Owner",
      shopName: "Approval Test Shop",
      address: "Test Road",
      area: "Kota",
      pincode: "324001",
      aadhaarNumber: "123456789012",
      serviceRadius: 5,
      workingHours: "9 AM - 9 PM",
      emergencyContact: phone,
      shopPhotoUrl: document,
      idProofUrl: document,
      addressProofUrl: document,
      vehicleTypeIds: [vehicleTypeId],
      registrationToken: signPartnerRegistrationToken(phone),
    })
  );
  const registrationBody = await registrationResponse.json();
  partnerId = registrationBody.data.id;

  const pendingPartner = await prisma.partner.findFirstOrThrow({
    where: { id: partnerId },
  });
  check("registration creates PENDING application", pendingPartner.applicationStatus === "PENDING");
  check("pending application starts offline", !pendingPartner.isOnline);
  check("pending application is not approved", !pendingPartner.isApproved);

  const otpCode = "654321";
  await prisma.oTP.create({
    data: {
      tenantId: "default",
      phone,
      role: "partner",
      code: hashOTP(phone, "partner", otpCode),
      expiresAt: new Date(Date.now() + 60_000),
    },
  });
  const loginResponse = await verifyOtp(
    request("http://localhost/api/auth/verify-otp", "POST", {
      phone,
      code: otpCode,
      role: "partner",
    })
  );
  const loginBody = await loginResponse.json();
  check("pending partner can login", loginResponse.status === 200);
  check("login returns PENDING status", loginBody.data.applicationStatus === "PENDING");

  const partnerToken = signToken({
    id: partnerId,
    phone,
    role: "partner",
    tenantId: "default",
  });
  const adminToken = signToken({
    id: admin.id,
    phone: admin.phone,
    role: "admin",
    tenantId: "default",
    adminRole: admin.role as "SUPER_ADMIN" | "TENANT_OWNER" | "STAFF",
  });

  const pendingOnline = await setOnline(
    request(
      "http://localhost/api/partner/online",
      "POST",
      { isOnline: true, latitude: 25.2138, longitude: 75.8648 },
      partnerToken
    )
  );
  check("pending partner cannot go online", pendingOnline.status === 403);

  const pendingDispatchRequest = await createRequest();
  await dispatchRequest(pendingDispatchRequest.id, "default");
  const pendingBroadcasts = await prisma.partnerBroadcast.count({
    where: { requestId: pendingDispatchRequest.id, partnerId },
  });
  check("pending partner receives no broadcasts", pendingBroadcasts === 0);

  const pendingAcceptRequest = await createRequest();
  await prisma.partnerBroadcast.create({
    data: {
      tenantId: "default",
      requestId: pendingAcceptRequest.id,
      partnerId,
    },
  });
  const pendingAccept = await acceptRequestRoute(
    request(
      "http://localhost/api/requests/accept",
      "POST",
      { requestId: pendingAcceptRequest.id },
      partnerToken
    )
  );
  check("pending partner cannot accept requests", pendingAccept.status === 403);

  const approve = await updatePartner(
    request(
      "http://localhost/api/admin/partners",
      "PATCH",
      { partnerId, action: "approve", note: "Pilot verification approved" },
      adminToken
    )
  );
  check("admin can approve with note", approve.status === 200);

  const approvedOnline = await setOnline(
    request(
      "http://localhost/api/partner/online",
      "POST",
      { isOnline: true, latitude: 25.2138, longitude: 75.8648 },
      partnerToken
    )
  );
  check("approved partner can go online", approvedOnline.status === 200);

  const approvedRequest = await createRequest();
  await dispatchRequest(approvedRequest.id, "default");
  const approvedBroadcast = await prisma.partnerBroadcast.findFirst({
    where: { requestId: approvedRequest.id, partnerId, response: null },
  });
  check("approved online partner receives broadcast", Boolean(approvedBroadcast));

  const approvedAccept = await acceptRequestRoute(
    request(
      "http://localhost/api/requests/accept",
      "POST",
      { requestId: approvedRequest.id },
      partnerToken
    )
  );
  check("approved partner can accept request", approvedAccept.status === 200);

  const suspend = await updatePartner(
    request(
      "http://localhost/api/admin/partners",
      "PATCH",
      { partnerId, action: "suspend", note: "Pilot suspension test" },
      adminToken
    )
  );
  check("admin can suspend with reason", suspend.status === 200);
  const suspendedPartner = await prisma.partner.findFirstOrThrow({
    where: { id: partnerId },
  });
  check("suspension immediately marks partner offline", !suspendedPartner.isOnline);
  check("suspension revokes approval", !suspendedPartner.isApproved);

  const suspendedOnline = await setOnline(
    request(
      "http://localhost/api/partner/online",
      "POST",
      { isOnline: true },
      partnerToken
    )
  );
  check("suspended partner cannot go online", suspendedOnline.status === 403);

  const reject = await updatePartner(
    request(
      "http://localhost/api/admin/partners",
      "PATCH",
      { partnerId, action: "reject", note: "Pilot rejection test" },
      adminToken
    )
  );
  check("admin can reject with reason", reject.status === 200);
  const rejectedPartner = await prisma.partner.findFirstOrThrow({
    where: { id: partnerId },
  });
  check("rejected partner cannot participate", rejectedPartner.applicationStatus === "REJECTED" && !rejectedPartner.isApproved && !rejectedPartner.isOnline);
}

main()
  .finally(async () => {
    await new Promise((resolve) => setTimeout(resolve, 200));
    await cleanup();
    await prisma.$disconnect();
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
