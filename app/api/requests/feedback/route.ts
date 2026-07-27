import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireCustomer } from "@/lib/authorization";

export async function POST(req: NextRequest) {
  try {
    const authz = await requireCustomer(req);
    if (!authz.ok) return authz.response;
    const { tenantId, user } = authz;
    const body = await req.json();
    const requestId = typeof body.requestId === "string" ? body.requestId : "";
    const rating = Number(body.rating);
    const comment = typeof body.comment === "string" ? body.comment.trim().slice(0, 1000) : null;

    if (!requestId || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json(
        { success: false, error: "requestId and rating from 1 to 5 are required" },
        { status: 400 }
      );
    }

    const request = await prisma.serviceRequest.findFirst({
      where: { id: requestId, tenantId, userId: user.id },
      select: { id: true, status: true, userId: true, partnerId: true },
    });

    if (!request) {
      return NextResponse.json({ success: false, error: "Request not found" }, { status: 404 });
    }

    if (request.status !== "COMPLETED") {
      return NextResponse.json(
        { success: false, error: "Feedback can be submitted only after completion" },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.customerFeedback.upsert({
        where: { tenantId_requestId: { tenantId, requestId } },
        update: { rating, comment },
        create: {
          tenantId,
          requestId,
          userId: user.id,
          partnerId: request.partnerId,
          rating,
          comment,
        },
      });

      if (!request.partnerId) return;

      const aggregate = await tx.customerFeedback.aggregate({
        where: { tenantId, partnerId: request.partnerId },
        _avg: { rating: true },
      });

      await tx.partner.updateMany({
        where: { id: request.partnerId, tenantId },
        data: { rating: Number((aggregate._avg.rating || rating).toFixed(2)) },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Feedback submit error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to submit feedback" },
      { status: 500 }
    );
  }
}
