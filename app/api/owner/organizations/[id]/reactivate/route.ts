import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { organization, organizationMembership, organizationReactivationRequest } from "@/lib/db/schema";
import { getSession } from "@/lib/auth-server";
import crypto from "crypto";

async function requireOwnerOfOrganization(organizationId: string) {
  const session = await getSession();
  if (!session?.user?.id) {
    throw new Error("UNAUTHENTICATED");
  }

  const [membership] = await db
    .select({ id: organizationMembership.id })
    .from(organizationMembership)
    .where(
      and(
        eq(organizationMembership.organizationId, organizationId),
        eq(organizationMembership.userId, session.user.id),
        eq(organizationMembership.role, "OWNER"),
        eq(organizationMembership.status, "ACTIVE"),
      ),
    )
    .limit(1);

  if (!membership) {
    throw new Error("FORBIDDEN");
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await requireOwnerOfOrganization(id);

    const body = (await request.json().catch(() => ({}))) as { reason?: string };
    const reason = body.reason?.trim() || "Requesting reactivation for suspended organization";

    const [org] = await db
      .select({ status: organization.status })
      .from(organization)
      .where(eq(organization.id, id))
      .limit(1);

    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    if (org.status !== "SUSPENDED") {
      return NextResponse.json(
        { error: "Reactivation can only be requested for suspended organizations" },
        { status: 400 },
      );
    }

    const [pending] = await db
      .select({ id: organizationReactivationRequest.id })
      .from(organizationReactivationRequest)
      .where(
        and(
          eq(organizationReactivationRequest.organizationId, id),
          eq(organizationReactivationRequest.status, "PENDING"),
        ),
      )
      .limit(1);

    if (pending) {
      return NextResponse.json({
        success: true,
        alreadyPending: true,
        requestId: pending.id,
        message: "A reactivation request is already pending platform review",
      });
    }

    const now = new Date();
    const [created] = await db
      .insert(organizationReactivationRequest)
      .values({
        id: crypto.randomUUID(),
        organizationId: id,
        requestedByUserId: session.user.id,
        status: "PENDING",
        reason,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: organizationReactivationRequest.id });

    return NextResponse.json({
      success: true,
      requestId: created.id,
      message: "Reactivation request submitted to platform owner",
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Owner access required for this organization" }, { status: 403 });
    }

    console.error("Owner reactivate organization error:", error);
    return NextResponse.json({ error: "Failed to submit reactivation request" }, { status: 500 });
  }
}
