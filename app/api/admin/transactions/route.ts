import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/authorization";
import { checkRateLimit, cleanPartnerDocument, rateLimitResponse } from "@/lib/security";

function parseDate(value: string | null, endOfDay = false) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (endOfDay) date.setHours(23, 59, 59, 999);
  else date.setHours(0, 0, 0, 0);
  return date;
}

export async function GET(req: NextRequest) {
  try {
    const authz = await requireAdmin(req);
    if (!authz.ok) return authz.response;
    const { tenantId } = authz;

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "all";
    const from = parseDate(searchParams.get("from"));
    const to = parseDate(searchParams.get("to"), true);

    const where: Record<string, unknown> = { tenantId };
    if (status === "PENDING_PAYMENT") {
      where.status = { in: ["PENDING_PAYMENT", "COMPLETED"] };
    } else if (status !== "all") {
      where.status = status;
    }
    if (from || to) {
      where.createdAt = {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {}),
      };
    }

    const [transactions, totals] = await Promise.all([
      prisma.transaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 100,
        include: {
          partner: { select: { id: true, name: true, shopName: true, phone: true } },
          request: {
            select: {
              id: true,
              status: true,
              area: true,
              user: { select: { name: true, phone: true } },
              service: { select: { displayName: true } },
              vehicleType: { select: { displayName: true } },
            },
          },
        },
      }),
      prisma.transaction.aggregate({
        where,
        _sum: {
          totalAmount: true,
          platformFee: true,
          partnerEarning: true,
        },
        _count: { _all: true },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        totals: {
          count: totals._count._all,
          totalAmount: Number(totals._sum.totalAmount || 0),
          platformFee: Number(totals._sum.platformFee || 0),
          partnerEarning: Number(totals._sum.partnerEarning || 0),
        },
        statusTotals: {
          pending: transactions.filter((txn) =>
            ["PENDING_PAYMENT", "COMPLETED"].includes(txn.status)
          ).length,
          confirmed: transactions.filter((txn) => txn.status === "PAYMENT_CONFIRMED").length,
          refunded: transactions.filter((txn) => txn.status === "REFUNDED").length,
        },
        transactions: transactions.map((txn) => ({
          id: txn.id,
          requestId: txn.requestId,
          status: txn.status === "COMPLETED" ? "PENDING_PAYMENT" : txn.status,
          totalAmount: Number(txn.totalAmount),
          platformFee: Number(txn.platformFee),
          partnerEarning: Number(txn.partnerEarning),
          paymentMethod: txn.paymentMethod,
          razorpayId: txn.razorpayId,
          paidAt: txn.paidAt?.toISOString(),
          settledAt: txn.settledAt?.toISOString(),
          refundedAt: txn.refundedAt?.toISOString(),
          paymentNote: txn.paymentNote,
          paymentEvidenceUrl: txn.paymentEvidenceUrl,
          createdAt: txn.createdAt.toISOString(),
          partner: txn.partner,
          request: txn.request,
        })),
      },
    });
  } catch (error) {
    console.error("Admin transactions GET error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch transactions" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const authz = await requireAdmin(req);
    if (!authz.ok) return authz.response;
    const { tenantId, user } = authz;
    const limit = checkRateLimit(`admin-payment:${tenantId}:${user.id}`, {
      limit: 60,
      windowMs: 10 * 60 * 1000,
      lockMs: 15 * 60 * 1000,
    });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

    const body = await req.json();
    const transactionId = typeof body.transactionId === "string" ? body.transactionId : "";
    const action = typeof body.action === "string" ? body.action : "";
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 1000) : "";
    const evidence = cleanPartnerDocument(body.paymentEvidenceUrl, 1_500_000);

    if (!transactionId || !action) {
      return NextResponse.json(
        { success: false, error: "transactionId and action are required" },
        { status: 400 }
      );
    }
    if (evidence === "__INVALID_DOCUMENT__") {
      return NextResponse.json(
        { success: false, error: "Evidence must be a valid HTTPS image/PDF URL or supported upload" },
        { status: 400 }
      );
    }

    const transaction = await prisma.transaction.findFirst({
      where: { id: transactionId, tenantId },
      select: { id: true, requestId: true, status: true },
    });
    if (!transaction) {
      return NextResponse.json({ success: false, error: "Transaction not found" }, { status: 404 });
    }

    let data: Record<string, unknown>;
    if (action === "confirm_cash") {
      if (!["PENDING_PAYMENT", "COMPLETED"].includes(transaction.status)) {
        return NextResponse.json(
          { success: false, error: "Only pending payments can be confirmed" },
          { status: 409 }
        );
      }
      data = {
        status: "PAYMENT_CONFIRMED",
        paymentMethod: "CASH",
        paidAt: new Date(),
        paymentNote: note || "Cash payment confirmed by admin",
        ...(evidence ? { paymentEvidenceUrl: evidence } : {}),
      };
    } else if (action === "refund") {
      if (transaction.status !== "PAYMENT_CONFIRMED") {
        return NextResponse.json(
          { success: false, error: "Only confirmed payments can be refunded" },
          { status: 409 }
        );
      }
      if (note.length < 3) {
        return NextResponse.json(
          { success: false, error: "Refund reason is required" },
          { status: 400 }
        );
      }
      data = {
        status: "REFUNDED",
        refundedAt: new Date(),
        paymentNote: note,
        ...(evidence ? { paymentEvidenceUrl: evidence } : {}),
      };
    } else if (action === "save_note") {
      if (!note && !evidence) {
        return NextResponse.json(
          { success: false, error: "Add a note or payment evidence" },
          { status: 400 }
        );
      }
      data = {
        ...(note ? { paymentNote: note } : {}),
        ...(evidence ? { paymentEvidenceUrl: evidence } : {}),
      };
    } else {
      return NextResponse.json({ success: false, error: "Invalid action" }, { status: 400 });
    }

    const changed = await prisma.transaction.updateMany({
      where: { id: transactionId, tenantId, status: transaction.status },
      data,
    });
    if (changed.count !== 1) {
      return NextResponse.json(
        { success: false, error: "Payment changed. Refresh and try again." },
        { status: 409 }
      );
    }

    await prisma.activityLog.create({
      data: {
        tenantId,
        adminId: user.id,
        action,
        entity: "transaction",
        entityId: transactionId,
        metadata: { requestId: transaction.requestId, fromStatus: transaction.status },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Admin transactions PATCH error:", error);
    return NextResponse.json({ success: false, error: "Payment action failed" }, { status: 500 });
  }
}
