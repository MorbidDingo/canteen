import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { settlementAccount, settlementLedger, user } from "@/lib/db/schema";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { createContact, createFundAccount, hasRazorpayPayoutCredentials } from "@/lib/razorpay-payout";
import { encryptKeySecretForStorage } from "@/lib/razorpay";

const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;

const updateSchema = z
  .object({
    label: z.string().min(2).max(120).optional(),
    method: z.enum(["BANK_ACCOUNT", "UPI"]).optional(),
    bankAccountNumber: z.string().optional(),
    bankIfsc: z.string().optional(),
    bankAccountHolderName: z.string().optional(),
    upiVpa: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    const nextMethod = value.method;
    if (nextMethod === "BANK_ACCOUNT") {
      if (!value.bankAccountNumber?.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Bank account number is required" });
      }
      if (!value.bankIfsc?.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "IFSC is required" });
      }
      if (value.bankIfsc && !ifscRegex.test(value.bankIfsc.trim().toUpperCase())) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid IFSC format" });
      }
      if (!value.bankAccountHolderName?.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Account holder name is required" });
      }
    }

    if (nextMethod === "UPI" && !value.upiVpa?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "UPI VPA is required" });
    }
  });

async function loadOwnedAccount(organizationId: string, actorUserId: string, id: string) {
  const [row] = await db
    .select()
    .from(settlementAccount)
    .where(
      and(
        eq(settlementAccount.id, id),
        eq(settlementAccount.organizationId, organizationId),
        eq(settlementAccount.userId, actorUserId),
      ),
    )
    .limit(1);

  return row ?? null;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["ADMIN"],
    });

    const { id } = await params;
    const organizationId = access.activeOrganizationId!;
    const actorUserId = access.actorUserId;

    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid data", details: parsed.error.flatten() }, { status: 400 });
    }

    const existing = await loadOwnedAccount(organizationId, actorUserId, id);
    if (!existing) {
      return NextResponse.json({ error: "Settlement account not found" }, { status: 404 });
    }

    const payload = parsed.data;
    const nextMethod = payload.method ?? existing.method;

    const normalizedIfsc = payload.bankIfsc?.trim().toUpperCase() ?? existing.bankIfsc;
    const normalizedVpa = payload.upiVpa?.trim().toLowerCase() ?? existing.upiVpa;
    const normalizedHolder = payload.bankAccountHolderName?.trim() ?? existing.bankAccountHolderName;

    const bankDetailsChanged =
      nextMethod === "BANK_ACCOUNT" &&
      (Boolean(payload.bankAccountNumber) || normalizedIfsc !== existing.bankIfsc || normalizedHolder !== existing.bankAccountHolderName);
    const upiChanged = nextMethod === "UPI" && Boolean(payload.upiVpa && payload.upiVpa.trim() !== existing.upiVpa);
    const payoutDetailsChanged = bankDetailsChanged || upiChanged || nextMethod !== existing.method;
    const canProvisionPayoutNow = hasRazorpayPayoutCredentials();
    const pendingUpiNeedsRetry =
      !payoutDetailsChanged &&
      nextMethod === "UPI" &&
      existing.status === "PENDING_VERIFICATION" &&
      !existing.razorpayFundAccountId &&
      canProvisionPayoutNow;

    let razorpayContactId = existing.razorpayContactId;
    let razorpayFundAccountId = existing.razorpayFundAccountId;
    let status = existing.status;

    if (payoutDetailsChanged || pendingUpiNeedsRetry) {
      if (
        nextMethod === "BANK_ACCOUNT" &&
        (!payload.bankAccountNumber?.trim() || !normalizedIfsc || !normalizedHolder)
      ) {
        return NextResponse.json(
          { error: "Bank account updates require bankAccountNumber, bankIfsc, and bankAccountHolderName" },
          { status: 400 },
        );
      }

      if (nextMethod === "UPI" && !normalizedVpa) {
        return NextResponse.json({ error: "UPI VPA is required" }, { status: 400 });
      }

      status = "PENDING_VERIFICATION";
      razorpayFundAccountId = null;

      if (canProvisionPayoutNow) {
        if (!razorpayContactId) {
          const [actor] = await db
            .select({ name: user.name, email: user.email, phone: user.phone })
            .from(user)
            .where(eq(user.id, actorUserId))
            .limit(1);

          razorpayContactId = await createContact({
            name: actor?.name || payload.label || existing.label,
            email: actor?.email,
            phone: actor?.phone,
          });
        }

        razorpayFundAccountId =
          nextMethod === "BANK_ACCOUNT"
            ? await createFundAccount(razorpayContactId, {
                bankDetails: {
                  bankAccountNumber: payload.bankAccountNumber?.trim() || "",
                  bankIfsc: normalizedIfsc || "",
                  bankAccountHolderName: normalizedHolder || "",
                },
              })
            : await createFundAccount(razorpayContactId, {
                upiVpa: normalizedVpa || "",
              });

        status = "ACTIVE";
      }
    }

    const [updated] = await db
      .update(settlementAccount)
      .set({
        label: payload.label?.trim() ?? existing.label,
        method: nextMethod,
        bankAccountNumber:
          nextMethod === "BANK_ACCOUNT"
            ? payload.bankAccountNumber
              ? encryptKeySecretForStorage(payload.bankAccountNumber.trim())
              : existing.bankAccountNumber
            : null,
        bankIfsc: nextMethod === "BANK_ACCOUNT" ? normalizedIfsc : null,
        bankAccountHolderName: nextMethod === "BANK_ACCOUNT" ? normalizedHolder : null,
        upiVpa: nextMethod === "UPI" ? normalizedVpa : null,
        razorpayContactId,
        razorpayFundAccountId,
        status,
        updatedAt: new Date(),
      })
      .where(eq(settlementAccount.id, existing.id))
      .returning({
        id: settlementAccount.id,
        label: settlementAccount.label,
        method: settlementAccount.method,
        status: settlementAccount.status,
      });

    return NextResponse.json({ account: updated });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }

    console.error("Admin settlement account update error:", error);
    return NextResponse.json({ error: "Failed to update settlement account" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["ADMIN"],
    });

    const { id } = await params;
    const organizationId = access.activeOrganizationId!;
    const actorUserId = access.actorUserId;

    const existing = await loadOwnedAccount(organizationId, actorUserId, id);
    if (!existing) {
      return NextResponse.json({ error: "Settlement account not found" }, { status: 404 });
    }

    const blockingLedgers = await db
      .select({ id: settlementLedger.id })
      .from(settlementLedger)
      .where(
        and(
          eq(settlementLedger.settlementAccountId, id),
          inArray(settlementLedger.status, ["PENDING", "PROCESSING"]),
        ),
      )
      .limit(1);

    if (blockingLedgers.length > 0) {
      return NextResponse.json(
        { error: "Cannot delete account with pending or processing settlements" },
        { status: 409 },
      );
    }

    await db.delete(settlementAccount).where(eq(settlementAccount.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }

    console.error("Admin settlement account delete error:", error);
    return NextResponse.json({ error: "Failed to delete settlement account" }, { status: 500 });
  }
}
