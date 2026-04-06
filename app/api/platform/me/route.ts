import { NextResponse } from "next/server";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";

export async function GET() {
  try {
    const access = await requireAccess({
      scope: "platform",
      allowedPlatformRoles: ["PLATFORM_OWNER", "PLATFORM_SUPPORT"],
    });

    return NextResponse.json({
      isPlatformUser: true,
      platformRole: access.actorPlatformRole,
      userId: access.actorUserId,
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ isPlatformUser: false, code: error.code }, { status: error.status });
    }

    console.error("Platform me error:", error);
    return NextResponse.json({ error: "Failed to resolve platform context" }, { status: 500 });
  }
}
