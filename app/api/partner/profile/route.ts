import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePartner } from "@/lib/authorization";
import { cleanPartnerDocument, maskAadhaar } from "@/lib/security";

function cleanString(value: unknown, maxLength = 300) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function cleanRadius(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.min(Math.max(Math.round(numeric), 1), 25);
}

export async function GET(req: NextRequest) {
  try {
    const authz = await requirePartner(req, { approved: true });
    if (!authz.ok) return authz.response;
    const { tenantId, user } = authz;

    const partner = await prisma.partner.findFirst({
      where: { id: user.id, tenantId },
      select: {
        id: true,
        phone: true,
        name: true,
        shopName: true,
        address: true,
        workingHours: true,
        serviceRadius: true,
        emergencyContact: true,
        aadhaarNumber: true,
        applicationStatus: true,
        shopPhotoUrl: true,
        idProofUrl: true,
        addressProofUrl: true,
        isApproved: true,
        isSuspended: true,
      },
    });

    if (!partner) {
      return NextResponse.json({ success: false, error: "Partner not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: { ...partner, aadhaarNumber: maskAadhaar(partner.aadhaarNumber) },
    });
  } catch (error) {
    console.error("Partner profile fetch error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch partner profile" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const authz = await requirePartner(req, { approved: true });
    if (!authz.ok) return authz.response;
    const { tenantId, user } = authz;
    const body = await req.json();

    const shopName = cleanString(body.shopName, 120);
    const address = cleanString(body.address, 300);
    const workingHours = cleanString(body.workingHours, 120);
    const emergencyContact = cleanString(body.emergencyContact, 20);
    const shopPhotoUrl = cleanPartnerDocument(body.shopPhotoUrl);
    const idProofUrl = cleanPartnerDocument(body.idProofUrl);
    const addressProofUrl = cleanPartnerDocument(body.addressProofUrl);
    const serviceRadius = cleanRadius(body.serviceRadius);

    if (!shopName) {
      return NextResponse.json({ success: false, error: "Shop name is required" }, { status: 400 });
    }

    if (emergencyContact && !/^[6-9]\d{9}$/.test(emergencyContact)) {
      return NextResponse.json(
        { success: false, error: "Emergency contact must be a valid 10-digit mobile number" },
        { status: 400 }
      );
    }

    if (
      shopPhotoUrl === "__INVALID_DOCUMENT__" ||
      idProofUrl === "__INVALID_DOCUMENT__" ||
      addressProofUrl === "__INVALID_DOCUMENT__"
    ) {
      return NextResponse.json(
        { success: false, error: "Document URLs must be valid HTTPS URLs" },
        { status: 400 }
      );
    }

    const updated = await prisma.partner.updateMany({
      where: { id: user.id, tenantId },
      data: {
        shopName,
        address,
        workingHours,
        emergencyContact,
        shopPhotoUrl,
        idProofUrl,
        addressProofUrl,
        serviceRadius: serviceRadius ?? undefined,
      },
    });

    if (updated.count !== 1) {
      return NextResponse.json({ success: false, error: "Partner not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Partner profile update error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update partner profile" },
      { status: 500 }
    );
  }
}
