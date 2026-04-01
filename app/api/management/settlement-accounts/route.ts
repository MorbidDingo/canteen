import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { organizationMembership, settlementAccount, user } from "@/lib/db/schema";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { encryptKeySecretForStorage } from "@/lib/razorpay";

const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;

const createSettlementSchema = z
  .object({
    userId: z.string().min(1).optional(),
    accountType: z.enum(["CANTEEN_ADMIN", "MANAGEMENT"]).optional(),
    label: z.string().min(2).max(120),
    method: z.enum(["BANK_ACCOUNT", "UPI"]),
    bankAccountNumber: z.string().optional(),
    bankIfsc: z.string().optional(),
    bankAccountHolderName: z.string().optional(),
    upiVpa: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.method === "BANK_ACCOUNT") {
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

    if (value.method === "UPI" && !value.upiVpa?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "UPI VPA is required" });
    }
  });

function maskAccount(account: {
  method: "BANK_ACCOUNT" | "UPI";
  bankAccountNumber: string | null;
  upiVpa: string | null;
}) {
  if (account.method === "BANK_ACCOUNT") {
    return account.bankAccountNumber ? "Encrypted bank account" : null;
  }

  if (!account.upiVpa) return null;
  const [userPart, domain] = account.upiVpa.split("@");
  if (!userPart || !domain) return "****";
  return `${userPart.slice(0, 2)}***@${domain}`;
}

export async function GET() {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT"],
    });

    const organizationId = access.activeOrganizationId!;

    const accounts = await db
      .select({
        id: settlementAccount.id,
        userId: settlementAccount.userId,
        ownerName: user.name,
        ownerEmail: user.email,
        accountType: settlementAccount.accountType,
        label: settlementAccount.label,
        method: settlementAccount.method,
        bankAccountNumber: settlementAccount.bankAccountNumber,
        bankIfsc: settlementAccount.bankIfsc,
        bankAccountHolderName: settlementAccount.bankAccountHolderName,
        upiVpa: settlementAccount.upiVpa,
        status: settlementAccount.status,
        blockedAt: settlementAccount.blockedAt,
        blockReason: settlementAccount.blockReason,
        createdAt: settlementAccount.createdAt,
      })
      .from(settlementAccount)
      .innerJoin(user, eq(settlementAccount.userId, user.id))
      .where(eq(settlementAccount.organizationId, organizationId))
      .orderBy(desc(settlementAccount.createdAt));

    return NextResponse.json({
      accounts: accounts.map((account) => ({
        ...account,
        maskedAccount: maskAccount({
          method: account.method,
          bankAccountNumber: account.bankAccountNumber,
          upiVpa: account.upiVpa,
        }),
      })),
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }

    console.error("Management settlement account list error:", error);
    return NextResponse.json({ error: "Failed to fetch settlement accounts" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT"],
    });

    const organizationId = access.activeOrganizationId!;
    const parsed = createSettlementSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid data", details: parsed.error.flatten() }, { status: 400 });
    }

    const payload = parsed.data;
    const targetUserId = payload.userId || access.actorUserId;

    const [member] = await db
      .select({ role: organizationMembership.role })
      .from(organizationMembership)
      .where(
        and(
          eq(organizationMembership.organizationId, organizationId),
          eq(organizationMembership.userId, targetUserId),
          eq(organizationMembership.status, "ACTIVE"),
        ),
      )
      .limit(1);

    if (!member) {
      return NextResponse.json({ error: "Target user is not an active member in organization" }, { status: 404 });
    }

    const normalizedIfsc = payload.bankIfsc?.trim().toUpperCase() || null;
    const normalizedVpa = payload.upiVpa?.trim().toLowerCase() || null;
    const normalizedAccount = payload.bankAccountNumber?.trim() || null;
    const normalizedHolder = payload.bankAccountHolderName?.trim() || null;

    const [owner] = await db
      .select({ name: user.name, email: user.email, phone: user.phone })
      .from(user)
      .where(eq(user.id, targetUserId))
      .limit(1);

    const [created] = await db
      .insert(settlementAccount)
      .values({
        organizationId,
        userId: targetUserId,
        accountType: payload.accountType || (member.role === "ADMIN" ? "CANTEEN_ADMIN" : "MANAGEMENT"),
        label: payload.label.trim(),
        method: payload.method,
        bankAccountNumber: normalizedAccount ? encryptKeySecretForStorage(normalizedAccount) : null,
        bankIfsc: payload.method === "BANK_ACCOUNT" ? normalizedIfsc : null,
        bankAccountHolderName: payload.method === "BANK_ACCOUNT" ? normalizedHolder : null,
        upiVpa: payload.method === "UPI" ? normalizedVpa : null,
        status: "PENDING_VERIFICATION",
      })
      .returning({ id: settlementAccount.id, status: settlementAccount.status });

    return NextResponse.json({ account: created });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }

    console.error("Management settlement account create error:", error);
    return NextResponse.json({ error: "Failed to create settlement account" }, { status: 500 });
  }
}
