import prisma from "../lib/prisma";

async function main() {
  const partners = await prisma.partner.findMany({
    select: { id: true, tenantId: true, completedJobs: true },
  });

  let corrected = 0;
  for (const partner of partners) {
    const [actualCompletedJobs, latestCompletion] = await Promise.all([
      prisma.serviceRequest.count({
        where: {
          tenantId: partner.tenantId,
          partnerId: partner.id,
          status: "COMPLETED",
        },
      }),
      prisma.serviceRequest.findFirst({
        where: {
          tenantId: partner.tenantId,
          partnerId: partner.id,
          status: "COMPLETED",
        },
        orderBy: { completedAt: "desc" },
        select: { completedAt: true },
      }),
    ]);

    if (partner.completedJobs !== actualCompletedJobs) {
      await prisma.partner.updateMany({
        where: { id: partner.id, tenantId: partner.tenantId },
        data: {
          completedJobs: actualCompletedJobs,
          lastCompletedAt: latestCompletion?.completedAt || null,
        },
      });
      corrected += 1;
      console.log(
        `Corrected ${partner.id}: ${partner.completedJobs} -> ${actualCompletedJobs}`
      );
    }
  }

  console.log(`Partner completion reconciliation finished; corrected ${corrected} partner(s)`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
