import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { organizationPaymentConfig } from "@/lib/db/schema";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { encryptKeySecretForStorage } from "@/lib/razorpay";
import crypto from "crypto";

export async function GET() {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT", "ADMIN"],
    });

    const organizationId = access.activeOrganizationId!;

    const [config] = await db
      .select({
        id: organizationPaymentConfig.id,
        provider: organizationPaymentConfig.provider,
        mode: organizationPaymentConfig.mode,
        keyId: organizationPaymentConfig.keyId,
        keySecretEncrypted: organizationPaymentConfig.keySecretEncrypted,
        status: organizationPaymentConfig.status,
        updatedAt: organizationPaymentConfig.updatedAt,
      })
      .from(organizationPaymentConfig)
      .where(
        and(
          eq(organizationPaymentConfig.organizationId, organizationId),
          eq(organizationPaymentConfig.provider, "RAZORPAY"),
        ),
      )
      .limit(1);

    return NextResponse.json({
      config: config
        ? {
            id: config.id,
            provider: config.provider,
            mode: config.mode,
            keyId: config.keyId,
            status: config.status,
            updatedAt: config.updatedAt,
            hasKeySecret: Boolean(config.keySecretEncrypted),
          }
        : null,
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }

    console.error("Get organization payment config error:", error);
    return NextResponse.json({ error: "Failed to fetch payment config" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT", "ADMIN"],
    });

    const organizationId = access.activeOrganizationId!;
    const body = (await request.json().catch(() => ({}))) as {
      keyId?: string;
      keySecret?: string;
      mode?: "ORG_MANAGED" | "PLATFORM_MANAGED";
      status?: "ACTIVE" | "DISABLED";
    };

    const keyId = body.keyId?.trim();
    const keySecret = body.keySecret?.trim();
    const mode = body.mode ?? "ORG_MANAGED";
    const status = body.status ?? "ACTIVE";

    if (!keyId) {
      return NextResponse.json({ error: "Razorpay key id is required" }, { status: 400 });
    }

    if (!keySecret) {
      return NextResponse.json({ error: "Razorpay key secret is required" }, { status: 400 });
    }

    const encryptedSecret = encryptKeySecretForStorage(keySecret);
    const now = new Date();

    const [existing] = await db
      .select({ id: organizationPaymentConfig.id })
      .from(organizationPaymentConfig)
      .where(
        and(
          eq(organizationPaymentConfig.organizationId, organizationId),
          eq(organizationPaymentConfig.provider, "RAZORPAY"),
        ),
      )
      .limit(1);

    if (existing) {
      await db
        .update(organizationPaymentConfig)
        .set({
          keyId,
          keySecretEncrypted: encryptedSecret,
          mode,
          status,
          updatedByUserId: access.actorUserId,
          updatedAt: now,
        })
        .where(eq(organizationPaymentConfig.id, existing.id));
    } else {
      await db.insert(organizationPaymentConfig).values({
        id: crypto.randomUUID(),
        organizationId,
        provider: "RAZORPAY",
        mode,
        keyId,
        keySecretEncrypted: encryptedSecret,
        status,
        settlementOwner: "ORG",
        updatedByUserId: access.actorUserId,
        updatedAt: now,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }

    console.error("Update organization payment config error:", error);
    return NextResponse.json({ error: "Failed to update payment config" }, { status: 500 });
  }
}
