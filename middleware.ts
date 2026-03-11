import { NextRequest, NextResponse } from "next/server";

export async function middleware(request: NextRequest) {
  // Lightweight cookie check — the real role validation happens in
  // each route group's layout.tsx server component.
  const sessionCookie =
    request.cookies.get("better-auth.session_token") ||
    request.cookies.get("__Secure-better-auth.session_token"); // HTTPS variant

  if (!sessionCookie?.value) {
    const path = request.nextUrl.pathname;
    // API routes return 403 JSON, page routes redirect to login
    if (
      path.startsWith("/api/admin") ||
      path.startsWith("/api/operator") ||
      path.startsWith("/api/management") ||
      path.startsWith("/api/lib-operator")
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Cookie exists — let the request through.
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/api/admin/:path*",
    "/operator/:path*",
    "/api/operator/:path*",
    "/management/:path*",
    "/api/management/:path*",
    "/lib-operator/:path*",
    "/api/lib-operator/:path*",
  ],
};
