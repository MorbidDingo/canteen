import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { hashPassword } from "better-auth/crypto";
import { db } from "@/lib/db";
import { account, organization, organizationApprovalRequest, user } from "@/lib/db/schema";

const payloadSchema = z.object({
  adminName: z.string().min(2),
  adminEmail: z.string().email(),
  adminPhone: z.string().min(10),
  adminPassword: z.string().min(8),
  organizationName: z.string().min(2),
  organizationSlug: z.string().min(2).regex(/^[a-z0-9-]+$/),
  organizationType: z.enum(["SCHOOL", "COLLEGE", "OTHER"]),
});

export async function POST(request: NextRequest) {
  try {
    const parsed = payloadSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
    }

    const {
      adminName,
      adminEmail,
      adminPhone,
      adminPassword,
      organizationName,
      organizationSlug,
      organizationType,
    } = parsed.data;

    const normalizedEmail = adminEmail.trim().toLowerCase();
    const normalizedSlug = organizationSlug.trim().toLowerCase();

    const [existingUser] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, normalizedEmail))
      .limit(1);

    if (existingUser) {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }

    const [existingRequest] = await db
      .select({ id: organizationApprovalRequest.id })
      .from(organizationApprovalRequest)
      .where(
        and(
          eq(organizationApprovalRequest.requestedSlug, normalizedSlug),
          eq(organizationApprovalRequest.status, "PENDING"),
        ),
      )
      .limit(1);

    if (existingRequest) {
      return NextResponse.json({ error: "Organization slug is already requested" }, { status: 409 });
    }

    const [existingOrganization] = await db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.slug, normalizedSlug))
      .limit(1);

    if (existingOrganization) {
      return NextResponse.json({ error: "Organization slug is already in use" }, { status: 409 });
    }

    const now = new Date();
    const userId = crypto.randomUUID();
    const hashedPassword = await hashPassword(adminPassword);

    await db.transaction(async (tx) => {
      await tx.insert(user).values({
        id: userId,
        name: adminName.trim(),
        email: normalizedEmail,
        emailVerified: false,
        role: "OWNER",
        phone: adminPhone.trim(),
        createdAt: now,
        updatedAt: now,
      });

      await tx.insert(account).values({
        id: crypto.randomUUID(),
        accountId: userId,
        providerId: "credential",
        userId,
        password: hashedPassword,
        createdAt: now,
        updatedAt: now,
      });

      await tx.insert(organizationApprovalRequest).values({
        id: crypto.randomUUID(),
        applicantUserId: userId,
        requestedName: organizationName.trim(),
        requestedSlug: normalizedSlug,
        status: "PENDING",
        reviewNotes: `Requested type: ${organizationType}`,
        createdAt: now,
        updatedAt: now,
      });
    });

    return NextResponse.json({
      success: true,
      message: "Organization registration submitted for approval.",
    });
  } catch (error) {
    console.error("Organization registration error:", error);
    return NextResponse.json({ error: "Failed to register organization" }, { status: 500 });
  }
}
