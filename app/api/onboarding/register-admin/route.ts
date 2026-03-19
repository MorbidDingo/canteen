import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { hashPassword } from "better-auth/crypto";
import { db } from "@/lib/db";
import { account, organization, organizationMembership, user } from "@/lib/db/schema";

const payloadSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(10),
  password: z.string().min(8),
  organizationSlug: z.string().min(2).regex(/^[a-z0-9-]+$/),
  role: z.enum(["ADMIN", "MANAGEMENT", "OPERATOR", "LIB_OPERATOR", "ATTENDANCE"]),
});

export async function POST(request: NextRequest) {
  try {
    const parsed = payloadSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
    }

    const { name, email, phone, password, organizationSlug, role } = parsed.data;
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedSlug = organizationSlug.trim().toLowerCase();

    const [org] = await db
      .select({ id: organization.id, status: organization.status })
      .from(organization)
      .where(eq(organization.slug, normalizedSlug))
      .limit(1);

    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    if (org.status !== "ACTIVE") {
      return NextResponse.json({ error: "Organization is not active" }, { status: 400 });
    }

    const [existingUser] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, normalizedEmail))
      .limit(1);

    if (existingUser) {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }

    const now = new Date();
    const userId = crypto.randomUUID();
    const hashedPassword = await hashPassword(password);

    await db.transaction(async (tx) => {
      await tx.insert(user).values({
        id: userId,
        name: name.trim(),
        email: normalizedEmail,
        emailVerified: false,
        role,
        phone: phone.trim(),
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

      await tx.insert(organizationMembership).values({
        id: crypto.randomUUID(),
        organizationId: org.id,
        userId,
        role,
        status: "INVITED",
        createdAt: now,
        updatedAt: now,
      });
    });

    return NextResponse.json({
      success: true,
      message: "Admin registration submitted. Access will be activated by organization management.",
    });
  } catch (error) {
    console.error("Admin registration error:", error);
    return NextResponse.json({ error: "Failed to register admin" }, { status: 500 });
  }
}
