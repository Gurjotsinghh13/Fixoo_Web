import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/authorization";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const authz = await requireAdmin(req);
    if (!authz.ok) return authz.response;
    const { tenantId, user } = authz;
    const { id } = await params;
    const { note } = await req.json();

    if (!note || typeof note !== "string" || note.trim().length < 2) {
      return NextResponse.json({ success: false, error: "Note is required" }, { status: 400 });
    }

    const request = await prisma.serviceRequest.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!request) return NextResponse.json({ success: false, error: "Request not found" }, { status: 404 });

    const created = await prisma.requestSupportNote.create({
      data: {
        tenantId,
        requestId: id,
        adminId: user.id,
        note: note.trim(),
      },
    });

    await prisma.activityLog.create({
      data: {
        tenantId,
        adminId: user.id,
        action: "add_support_note",
        entity: "request",
        entityId: id,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: created.id,
        note: created.note,
        adminId: created.adminId,
        createdAt: created.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("Admin support note error:", error);
    return NextResponse.json({ success: false, error: "Failed to add note" }, { status: 500 });
  }
}
