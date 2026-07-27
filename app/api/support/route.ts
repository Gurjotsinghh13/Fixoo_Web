import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    success: true,
    data: {
      phone: process.env.SUPPORT_PHONE || "9000000000",
      whatsapp: process.env.SUPPORT_WHATSAPP || process.env.SUPPORT_PHONE || "9000000000",
    },
  });
}
