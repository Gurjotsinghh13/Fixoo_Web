import { NextRequest, NextResponse } from "next/server";
import { verifyTokenEdge } from "@/lib/edge-auth";

const PUBLIC_PATHS = ["/login", "/partner/login", "/partner/register", "/admin/login", "/api/auth", "/api/health"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow static files
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/icons") ||
    pathname.startsWith("/manifest") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const token =
    req.cookies.get("fixoo_token")?.value ||
    req.headers.get("authorization")?.replace("Bearer ", "");
  const user = token ? await verifyTokenEdge(token) : null;

  // Not authenticated
  if (!user) {
    if (pathname.startsWith("/partner")) return NextResponse.redirect(new URL("/partner/login", req.url));
    if (pathname.startsWith("/admin")) return NextResponse.redirect(new URL("/admin/login", req.url));
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Role-based routing
  if (pathname.startsWith("/admin") && user.role !== "admin") {
    return NextResponse.redirect(new URL("/admin/login", req.url));
  }

  if (pathname.startsWith("/partner") && user.role !== "partner") {
    return NextResponse.redirect(new URL("/partner/login", req.url));
  }

  if (
    !pathname.startsWith("/partner") &&
    !pathname.startsWith("/admin") &&
    !pathname.startsWith("/api") &&
    user.role === "partner"
  ) {
    return NextResponse.redirect(new URL("/partner/dashboard", req.url));
  }

  if (
    !pathname.startsWith("/admin") &&
    !pathname.startsWith("/api") &&
    user.role === "admin"
  ) {
    return NextResponse.redirect(new URL("/admin/dashboard", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
