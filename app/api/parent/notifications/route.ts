import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-server";
import {
  getParentNotifications,
  markParentNotificationsRead,
} from "@/lib/parent-notifications";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = session.user.role;
  if (role !== "PARENT") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const limitParam = request.nextUrl.searchParams.get("limit");
  const limit = Math.min(Math.max(Number(limitParam || 30), 1), 100);
  const notifications = await getParentNotifications(session.user.id, limit);
  const unreadCount = notifications.filter((n) => !n.readAt).length;

  return NextResponse.json({ notifications, unreadCount });
}

export async function PATCH(request: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = session.user.role;
  if (role !== "PARENT") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    notificationId?: string;
    markAll?: boolean;
  };

  if (!body.markAll && !body.notificationId) {
    return NextResponse.json(
      { error: "notificationId or markAll is required" },
      { status: 400 },
    );
  }

  await markParentNotificationsRead(
    session.user.id,
    body.markAll ? undefined : body.notificationId,
  );

  return NextResponse.json({ success: true });
}
