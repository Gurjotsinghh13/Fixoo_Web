import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/authorization";
import { startOfDay } from "date-fns";
import { expireOverdueRequestsForTenant } from "@/lib/request-lifecycle";

function averageSeconds(values: number[]) {
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export async function GET(req: NextRequest) {
  try {
    const authz = await requireAdmin(req);
    if (!authz.ok) return authz.response;
    const { tenantId } = authz;

    await expireOverdueRequestsForTenant(tenantId);

    const todayStart = startOfDay(new Date());
    const [requests, broadcasts] = await Promise.all([
      prisma.serviceRequest.findMany({
        where: { tenantId, createdAt: { gte: todayStart } },
        select: {
          status: true,
          createdAt: true,
          acceptedAt: true,
          arrivedAt: true,
          noShowType: true,
        },
      }),
      prisma.partnerBroadcast.findMany({
        where: { tenantId, sentAt: { gte: todayStart } },
        select: { response: true },
      }),
    ]);

    const completed = requests.filter((request) => request.status === "COMPLETED").length;
    const cancelled = requests.filter((request) => request.status === "CANCELLED").length;
    const acceptedRequests = requests.filter((request) => request.acceptedAt);
    const arrivedRequests = requests.filter((request) => request.acceptedAt && request.arrivedAt);
    const respondedBroadcasts = broadcasts.filter((broadcast) => broadcast.response);

    return NextResponse.json({
      success: true,
      data: {
        requestsToday: requests.length,
        completionRate: requests.length ? Math.round((completed / requests.length) * 100) : 0,
        cancellationRate: requests.length ? Math.round((cancelled / requests.length) * 100) : 0,
        avgAcceptTimeSeconds: averageSeconds(
          acceptedRequests.map((request) =>
            Math.max(0, Math.round((request.acceptedAt!.getTime() - request.createdAt.getTime()) / 1000))
          )
        ),
        avgArrivalTimeSeconds: averageSeconds(
          arrivedRequests.map((request) =>
            Math.max(0, Math.round((request.arrivedAt!.getTime() - request.acceptedAt!.getTime()) / 1000))
          )
        ),
        partnerResponseRate: broadcasts.length
          ? Math.round((respondedBroadcasts.length / broadcasts.length) * 100)
          : 0,
        failedRequests: requests.filter(
          (request) => request.status === "EXPIRED" || Boolean(request.noShowType)
        ).length,
      },
    });
  } catch (error) {
    console.error("Pilot metrics error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch pilot metrics" }, { status: 500 });
  }
}
