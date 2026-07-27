import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { DEFAULT_TENANT_ID } from "@/lib/tenant";
import {
  checkRateLimit,
  cleanPartnerDocument,
  getClientIp,
  rateLimitResponse,
} from "@/lib/security";
import { verifyPartnerRegistrationToken } from "@/lib/partner-registration-token";

export async function GET() {
  try {
    const vehicleTypes = await prisma.vehicleType.findMany({
      where: { tenantId: DEFAULT_TENANT_ID, isActive: true },
      select: { id: true, name: true, displayName: true },
      orderBy: { sortOrder: "asc" },
    });
    return NextResponse.json({ success: true, data: vehicleTypes });
  } catch (error) {
    console.error("Partner registration options error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load registration options" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      phone,
      name,
      shopName,
      address,
      area,
      pincode,
      aadhaarNumber,
      serviceRadius,
      workingHours,
      emergencyContact,
      shopPhotoUrl,
      idProofUrl,
      addressProofUrl,
      vehicleTypeIds,
      registrationToken,
    } = body;
    const tenantId = DEFAULT_TENANT_ID;

    const submitLimit = checkRateLimit(
      `partner-register-submit:${getClientIp(req)}:${phone || "unknown"}`,
      { limit: 5, windowMs: 60 * 60 * 1000, lockMs: 60 * 60 * 1000 }
    );
    if (!submitLimit.ok) return rateLimitResponse(submitLimit.retryAfterSeconds);

    if (
      !phone ||
      !name ||
      !shopName ||
      !address ||
      !area ||
      !pincode ||
      !aadhaarNumber ||
      !workingHours ||
      !emergencyContact
    ) {
      return NextResponse.json(
        { success: false, error: "All partner application fields are required" },
        { status: 400 }
      );
    }

    if (!/^[6-9]\d{9}$/.test(phone)) {
      return NextResponse.json(
        { success: false, error: "Valid 10-digit Indian mobile number required" },
        { status: 400 }
      );
    }

    if (!verifyPartnerRegistrationToken(registrationToken, phone)) {
      return NextResponse.json(
        { success: false, error: "Phone verification is required" },
        { status: 403 }
      );
    }

    const cleanAadhaar =
      typeof aadhaarNumber === "string" ? aadhaarNumber.replace(/\D/g, "") : "";
    if (cleanAadhaar.length !== 12) {
      return NextResponse.json(
        { success: false, error: "Aadhaar number must be 12 digits" },
        { status: 400 }
      );
    }

    if (!/^\d{6}$/.test(String(pincode))) {
      return NextResponse.json(
        { success: false, error: "Pincode must be 6 digits" },
        { status: 400 }
      );
    }

    if (!/^[6-9]\d{9}$/.test(String(emergencyContact))) {
      return NextResponse.json(
        { success: false, error: "Emergency contact must be a valid mobile number" },
        { status: 400 }
      );
    }

    const parsedRadius = Number(serviceRadius);
    const safeRadius = Number.isFinite(parsedRadius)
      ? Math.min(Math.max(Math.round(parsedRadius), 1), 25)
      : 3;

    const cleanShopPhotoUrl = cleanPartnerDocument(shopPhotoUrl);
    const cleanIdProofUrl = cleanPartnerDocument(idProofUrl);
    const cleanAddressProofUrl = cleanPartnerDocument(addressProofUrl);
    if (
      !cleanShopPhotoUrl ||
      !cleanIdProofUrl ||
      !cleanAddressProofUrl ||
      cleanShopPhotoUrl === "__INVALID_DOCUMENT__" ||
      cleanIdProofUrl === "__INVALID_DOCUMENT__" ||
      cleanAddressProofUrl === "__INVALID_DOCUMENT__"
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Shop photo, ID proof and address proof are required and must be valid files",
        },
        { status: 400 }
      );
    }

    const existing = await prisma.partner.findFirst({ where: { tenantId, phone } });
    if (existing) {
      return NextResponse.json(
        { success: false, error: "A partner account already exists with this phone number" },
        { status: 409 }
      );
    }

    const requestedVehicleTypeIds = Array.isArray(vehicleTypeIds)
      ? [...new Set(vehicleTypeIds.filter((id): id is string => typeof id === "string" && id.length > 0))]
      : [];

    if (requestedVehicleTypeIds.length === 0) {
      return NextResponse.json(
        { success: false, error: "Select at least one supported vehicle type" },
        { status: 400 }
      );
    }

    if (requestedVehicleTypeIds.length > 0) {
      const validVehicleTypes = await prisma.vehicleType.findMany({
        where: { tenantId, id: { in: requestedVehicleTypeIds }, isActive: true },
        select: { id: true },
      });

      if (validVehicleTypes.length !== requestedVehicleTypeIds.length) {
        return NextResponse.json(
          { success: false, error: "One or more vehicle types are invalid" },
          { status: 400 }
        );
      }
    }

    const partner = await prisma.partner.create({
      data: {
        tenantId,
        phone,
        name: name.trim(),
        shopName: shopName.trim(),
        address: address.trim().slice(0, 300),
        area: area.trim().slice(0, 120),
        pincode: String(pincode),
        aadhaarNumber: cleanAadhaar ? cleanAadhaar.slice(-4) : null,
        serviceRadius: safeRadius,
        workingHours: workingHours.trim().slice(0, 120),
        emergencyContact: String(emergencyContact),
        shopPhotoUrl: cleanShopPhotoUrl,
        idProofUrl: cleanIdProofUrl,
        addressProofUrl: cleanAddressProofUrl,
        applicationStatus: "PENDING",
        isApproved: false,
        isSuspended: false,
        isOnline: false,
        activities: {
          create: { tenantId, type: "REGISTERED", note: "Partner application submitted" },
        },
        vehicleTypes: requestedVehicleTypeIds.length
          ? {
              create: requestedVehicleTypeIds.map((id) => ({ tenantId, vehicleTypeId: id })),
            }
          : undefined,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: partner.id,
        applicationNumber: partner.id,
        phone: partner.phone,
        name: partner.name,
        shopName: partner.shopName,
        isApproved: partner.isApproved,
        applicationStatus: partner.applicationStatus,
        message: "Registration successful. Awaiting admin approval.",
      },
    });
  } catch (error) {
    console.error("Partner register error:", error);
    return NextResponse.json(
      { success: false, error: "Registration failed" },
      { status: 500 }
    );
  }
}
