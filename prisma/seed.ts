import prisma from "@/lib/prisma";
const tenantId = process.env.FIXOO_TENANT_ID || "default";

async function main() {
  console.log("Seeding Fixoo database...");

  await prisma.tenant.upsert({
    where: { id: tenantId },
    update: { name: "Fixoo Default Tenant", slug: tenantId, isActive: true },
    create: {
      id: tenantId,
      name: "Fixoo Default Tenant",
      slug: tenantId,
      isActive: true,
    },
  });

  const bike = await prisma.vehicleType.upsert({
    where: { tenantId_name: { tenantId, name: "BIKE" } },
    update: { tenantId },
    create: {
      tenantId,
      name: "BIKE",
      displayName: "Bike",
      icon: "bike",
      sortOrder: 1,
    },
  });

  const scooter = await prisma.vehicleType.upsert({
    where: { tenantId_name: { tenantId, name: "SCOOTER" } },
    update: { tenantId },
    create: {
      tenantId,
      name: "SCOOTER",
      displayName: "Scooter",
      icon: "scooter",
      sortOrder: 2,
    },
  });

  const car = await prisma.vehicleType.upsert({
    where: { tenantId_name: { tenantId, name: "CAR" } },
    update: { tenantId },
    create: {
      tenantId,
      name: "CAR",
      displayName: "Car",
      icon: "car",
      sortOrder: 3,
    },
  });

  console.log("Vehicle types seeded");

  const puncture = await prisma.service.upsert({
    where: { tenantId_name: { tenantId, name: "PUNCTURE_REPAIR" } },
    update: { tenantId, isActive: true },
    create: {
      tenantId,
      name: "PUNCTURE_REPAIR",
      displayName: "Puncture Repair",
      description: "On-site tyre puncture repair",
      icon: "tyre",
      category: "ROADSIDE",
      isActive: true,
    },
  });

  await prisma.service.upsert({
    where: { tenantId_name: { tenantId, name: "BATTERY_JUMPSTART" } },
    update: { tenantId },
    create: {
      tenantId,
      name: "BATTERY_JUMPSTART",
      displayName: "Battery Jump Start",
      description: "Dead battery jump start service",
      icon: "battery",
      category: "ROADSIDE",
      isActive: false,
    },
  });

  await prisma.service.upsert({
    where: { tenantId_name: { tenantId, name: "FUEL_DELIVERY" } },
    update: { tenantId },
    create: {
      tenantId,
      name: "FUEL_DELIVERY",
      displayName: "Fuel Delivery",
      description: "Emergency fuel delivery",
      icon: "fuel",
      category: "ROADSIDE",
      isActive: false,
    },
  });

  console.log("Services seeded");

  const pricingRows = [
    { vehicleTypeId: bike.id, serviceFee: 199, platformFee: 20, nightSurcharge: 50, etaMin: 10, etaMax: 15 },
    { vehicleTypeId: scooter.id, serviceFee: 199, platformFee: 20, nightSurcharge: 50, etaMin: 10, etaMax: 15 },
    { vehicleTypeId: car.id, serviceFee: 349, platformFee: 30, nightSurcharge: 75, etaMin: 15, etaMax: 20 },
  ];

  for (const row of pricingRows) {
    await prisma.servicePricing.upsert({
      where: {
        tenantId_serviceId_vehicleTypeId: {
          tenantId,
          serviceId: puncture.id,
          vehicleTypeId: row.vehicleTypeId,
        },
      },
      update: {
        tenantId,
        serviceFee: row.serviceFee,
        platformFee: row.platformFee,
        nightSurcharge: row.nightSurcharge,
        etaMin: row.etaMin,
        etaMax: row.etaMax,
        isActive: true,
      },
      create: {
        tenantId,
        serviceId: puncture.id,
        ...row,
      },
    });
  }

  console.log("Pricing seeded");

  await prisma.admin.upsert({
    where: { tenantId_phone: { tenantId, phone: "9999999999" } },
    update: { tenantId, name: "Fixoo Admin", isActive: true },
    create: {
      tenantId,
      phone: "9999999999",
      name: "Fixoo Admin",
      role: "SUPER_ADMIN",
      isActive: true,
    },
  });

  console.log("Admin seeded");

  const settings = [
    { key: "dispatch_radius_initial", value: "3", type: "number", label: "Initial Dispatch Radius (km)" },
    { key: "dispatch_timeout_seconds", value: "60", type: "number", label: "Partner Accept Timeout (seconds)" },
    { key: "night_surcharge_start", value: "22", type: "number", label: "Night Surcharge Start Hour" },
    { key: "night_surcharge_end", value: "6", type: "number", label: "Night Surcharge End Hour" },
    { key: "platform_name", value: "Fixoo", type: "string", label: "Platform Name" },
    { key: "support_phone", value: "9000000000", type: "string", label: "Support Phone Number" },
  ];

  for (const setting of settings) {
    await prisma.appSetting.upsert({
      where: { tenantId_key: { tenantId, key: setting.key } },
      update: { ...setting, tenantId },
      create: { ...setting, tenantId },
    });
  }

  console.log("App settings seeded");

  const demoPartner = await prisma.partner.upsert({
    where: { tenantId_phone: { tenantId, phone: "9800000001" } },
    update: {
      tenantId,
      name: "Ramesh Kumar",
      shopName: "Ramesh Tyre Works",
      address: "Talwandi, Kota",
      isApproved: true,
      isSuspended: false,
    },
    create: {
      tenantId,
      phone: "9800000001",
      name: "Ramesh Kumar",
      shopName: "Ramesh Tyre Works",
      address: "Talwandi, Kota",
      isApproved: true,
      isOnline: false,
      rating: 4.8,
      totalJobs: 145,
      completedJobs: 142,
    },
  });

  await prisma.partnerLocation.upsert({
    where: { tenantId_partnerId: { tenantId, partnerId: demoPartner.id } },
    update: { tenantId, latitude: 25.2138, longitude: 75.8648 },
    create: {
      tenantId,
      partnerId: demoPartner.id,
      latitude: 25.2138,
      longitude: 75.8648,
    },
  });

  for (const vehicleType of [bike, scooter]) {
    await prisma.partnerVehicleType.upsert({
      where: {
        tenantId_partnerId_vehicleTypeId: {
          tenantId,
          partnerId: demoPartner.id,
          vehicleTypeId: vehicleType.id,
        },
      },
      update: {},
      create: {
        tenantId,
        partnerId: demoPartner.id,
        vehicleTypeId: vehicleType.id,
      },
    });
  }

  const testCustomer = await prisma.user.upsert({
    where: { tenantId_phone: { tenantId, phone: "9000000001" } },
    update: { tenantId, name: "Test Customer", isActive: true },
    create: {
      tenantId,
      phone: "9000000001",
      name: "Test Customer",
      isActive: true,
    },
  });

  const testPartner = await prisma.partner.upsert({
    where: { tenantId_phone: { tenantId, phone: "9800000002" } },
    update: {
      tenantId,
      name: "Test Partner",
      shopName: "Fixoo Test Tyres",
      address: "Kota Test Area",
      isApproved: true,
      isSuspended: false,
      isOnline: true,
    },
    create: {
      tenantId,
      phone: "9800000002",
      name: "Test Partner",
      shopName: "Fixoo Test Tyres",
      address: "Kota Test Area",
      isApproved: true,
      isOnline: true,
      rating: 5,
      totalJobs: 0,
      completedJobs: 0,
    },
  });

  await prisma.partnerLocation.upsert({
    where: { tenantId_partnerId: { tenantId, partnerId: testPartner.id } },
    update: { tenantId, latitude: 25.2138, longitude: 75.8648 },
    create: {
      tenantId,
      partnerId: testPartner.id,
      latitude: 25.2138,
      longitude: 75.8648,
    },
  });

  for (const vehicleType of [bike, scooter, car]) {
    await prisma.partnerVehicleType.upsert({
      where: {
        tenantId_partnerId_vehicleTypeId: {
          tenantId,
          partnerId: testPartner.id,
          vehicleTypeId: vehicleType.id,
        },
      },
      update: {},
      create: {
        tenantId,
        partnerId: testPartner.id,
        vehicleTypeId: vehicleType.id,
      },
    });
  }

  console.log("Demo partner seeded: 9800000001");
  console.log(`Test customer seeded: ${testCustomer.phone}`);
  console.log(`Test partner seeded: ${testPartner.phone}`);
  console.log("Fixoo database seeded successfully");
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
