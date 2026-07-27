import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { checkDatabaseHealth } from "@/lib/database-health";
import { requireAdmin } from "@/lib/authorization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const health = await checkDatabaseHealth();
  const wantsDetails = new URL(req.url).searchParams.get("details") === "true";

  if (wantsDetails) {
    const authz = await requireAdmin(req);
    if (!authz.ok) return authz.response;
    return NextResponse.json(health, { status: health.ok ? 200 : 503 });
  }

  return NextResponse.json(
    { ok: health.ok, checkedAt: health.checkedAt },
    { status: health.ok ? 200 : 503 }
  );
}
