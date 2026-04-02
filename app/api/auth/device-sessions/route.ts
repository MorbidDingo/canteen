import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { session as sessionTable, user as userTable, account as accountTable } from "@/lib/db/schema";
import { eq, and, gt, desc } from "drizzle-orm";
import { auth } from "@/lib/auth";

// Use better-auth's built-in password verify (scrypt-based)
async function verifyUserPassword(stored: string, input: string): Promise<boolean> {
  try {
    return await (await auth.$context).password.verify({ hash: stored, password: input });
  } catch {
    return false;
  }
}

// POST — list active sessions for a user (requires email + password verification)
// Used when login fails due to device limit, to show which sessions can be revoked
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { email, password } = body;

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password required" }, { status: 400 });
  }

  // 1. Find user by email
  const [userRow] = await db
    .select({ id: userTable.id, role: userTable.role, name: userTable.name })
    .from(userTable)
    .where(eq(userTable.email, email.toLowerCase().trim()))
    .limit(1);

  if (!userRow) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  // 2. Verify password via account table
  const [acc] = await db
    .select({ password: accountTable.password })
    .from(accountTable)
    .where(
      and(
        eq(accountTable.userId, userRow.id),
        eq(accountTable.providerId, "credential"),
      ),
    )
    .limit(1);

  if (!acc?.password) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const isValid = await verifyUserPassword(acc.password, password);
  if (!isValid) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  // 3. Get active sessions
  const now = new Date();
  const sessions = await db
    .select({
      id: sessionTable.id,
      userAgent: sessionTable.userAgent,
      ipAddress: sessionTable.ipAddress,
      createdAt: sessionTable.createdAt,
    })
    .from(sessionTable)
    .where(
      and(
        eq(sessionTable.userId, userRow.id),
        gt(sessionTable.expiresAt, now),
      ),
    )
    .orderBy(desc(sessionTable.createdAt));

  return NextResponse.json({
    sessions: sessions.map((s) => ({
      id: s.id,
      userAgent: s.userAgent,
      ipAddress: s.ipAddress ? maskIp(s.ipAddress) : null,
      createdAt: s.createdAt,
    })),
  });
}

// DELETE — revoke a specific session (requires email + password)
export async function DELETE(request: NextRequest) {
  const body = await request.json();
  const { email, password, sessionId } = body;

  if (!email || !password || !sessionId) {
    return NextResponse.json({ error: "Email, password, and sessionId required" }, { status: 400 });
  }

  // 1. Find user
  const [userRow] = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.email, email.toLowerCase().trim()))
    .limit(1);

  if (!userRow) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  // 2. Verify password
  const [acc] = await db
    .select({ password: accountTable.password })
    .from(accountTable)
    .where(
      and(
        eq(accountTable.userId, userRow.id),
        eq(accountTable.providerId, "credential"),
      ),
    )
    .limit(1);

  if (!acc?.password) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const isValid = await verifyUserPassword(acc.password, password);
  if (!isValid) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  // 3. Delete the session — only if it belongs to this user
  const [deleted] = await db
    .delete(sessionTable)
    .where(
      and(
        eq(sessionTable.id, sessionId),
        eq(sessionTable.userId, userRow.id),
      ),
    )
    .returning({ id: sessionTable.id });

  if (!deleted) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

function maskIp(ip: string): string {
  // Show partial IP for privacy: 192.168.x.x → 192.168.*.*
  const parts = ip.split(".");
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.*.*`;
  }
  // IPv6: show first segment
  return ip.split(":").slice(0, 2).join(":") + ":***";
}
