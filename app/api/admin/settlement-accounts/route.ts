import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { canteen, canteenPaymentRouting, settlementAccount, user } from "@/lib/db/schema";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { encryptKeySecretForStorage } from "@/lib/razorpay";

const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;

const createSettlementSchema = z
  .object({
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
      allowedOrgRoles: ["ADMIN"],
    });

    const organizationId = access.activeOrganizationId!;

    const accounts = await db
      .select({
        id: settlementAccount.id,
        label: settlementAccount.label,
        accountType: settlementAccount.accountType,
        method: settlementAccount.method,
        bankAccountNumber: settlementAccount.bankAccountNumber,
        bankIfsc: settlementAccount.bankIfsc,
        bankAccountHolderName: settlementAccount.bankAccountHolderName,
        upiVpa: settlementAccount.upiVpa,
        status: settlementAccount.status,
        blockedAt: settlementAccount.blockedAt,
        blockReason: settlementAccount.blockReason,
        createdAt: settlementAccount.createdAt,
        updatedAt: settlementAccount.updatedAt,
      })
      .from(settlementAccount)
      .where(
        and(
          eq(settlementAccount.organizationId, organizationId),
          eq(settlementAccount.userId, access.actorUserId),
        ),
      )
      .orderBy(desc(settlementAccount.createdAt));

    const accountIds = accounts.map((account) => account.id);
    const routingRows =
      accountIds.length > 0
        ? await db
            .select({
              settlementAccountId: canteenPaymentRouting.settlementAccountId,
              canteenId: canteen.id,
              canteenName: canteen.name,
              canteenLocation: canteen.location,
            })
            .from(canteenPaymentRouting)
            .innerJoin(canteen, eq(canteenPaymentRouting.canteenId, canteen.id))
            .where(eq(canteen.organizationId, organizationId))
        : [];

    const routedCanteensByAccount = new Map<string, Array<{ id: string; name: string; location: string | null }>>();
    for (const row of routingRows) {
      const existing = routedCanteensByAccount.get(row.settlementAccountId) ?? [];
      existing.push({
        id: row.canteenId,
        name: row.canteenName,
        location: row.canteenLocation,
      });
      routedCanteensByAccount.set(row.settlementAccountId, existing);
    }

    return NextResponse.json({
      accounts: accounts.map((account) => ({
        ...account,
        maskedAccount: maskAccount({
          method: account.method,
          bankAccountNumber: account.bankAccountNumber,
          upiVpa: account.upiVpa,
        }),
        routedCanteens: routedCanteensByAccount.get(account.id) ?? [],
      })),
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }

    console.error("Admin settlement account list error:", error);
    return NextResponse.json({ error: "Failed to fetch settlement accounts" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["ADMIN"],
    });

    const parsed = createSettlementSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid data", details: parsed.error.flatten() }, { status: 400 });
    }

    const organizationId = access.activeOrganizationId!;
    const actorUserId = access.actorUserId;
    const payload = parsed.data;

    const normalizedIfsc = payload.bankIfsc?.trim().toUpperCase() || null;
    const normalizedVpa = payload.upiVpa?.trim().toLowerCase() || null;
    const normalizedAccount = payload.bankAccountNumber?.trim() || null;
    const normalizedHolder = payload.bankAccountHolderName?.trim() || null;

    const existing =
      payload.method === "BANK_ACCOUNT"
        ? await db
            .select({ id: settlementAccount.id })
            .from(settlementAccount)
            .where(
              and(
                eq(settlementAccount.organizationId, organizationId),
                eq(settlementAccount.userId, actorUserId),
                eq(settlementAccount.method, payload.method),
                eq(settlementAccount.bankIfsc, normalizedIfsc!),
                eq(settlementAccount.bankAccountHolderName, normalizedHolder!),
              ),
            )
            .limit(1)
        : await db
            .select({ id: settlementAccount.id })
            .from(settlementAccount)
            .where(
              and(
                eq(settlementAccount.organizationId, organizationId),
                eq(settlementAccount.userId, actorUserId),
                eq(settlementAccount.method, payload.method),
                eq(settlementAccount.upiVpa, normalizedVpa!),
              ),
            )
            .limit(1);

    if (existing.length > 0) {
      return NextResponse.json({ error: "An account with same details already exists" }, { status: 409 });
    }

    const [actor] = await db
      .select({ name: user.name, email: user.email, phone: user.phone })
      .from(user)
      .where(eq(user.id, actorUserId))
      .limit(1);

    const [created] = await db
      .insert(settlementAccount)
      .values({
        organizationId,
        userId: actorUserId,
        accountType: "CANTEEN_ADMIN",
        label: payload.label.trim(),
        method: payload.method,
        bankAccountNumber: normalizedAccount ? encryptKeySecretForStorage(normalizedAccount) : null,
        bankIfsc: payload.method === "BANK_ACCOUNT" ? normalizedIfsc : null,
        bankAccountHolderName: payload.method === "BANK_ACCOUNT" ? normalizedHolder : null,
        upiVpa: payload.method === "UPI" ? normalizedVpa : null,
        status: "PENDING_VERIFICATION",
      })
      .returning({
        id: settlementAccount.id,
        status: settlementAccount.status,
      });

    return NextResponse.json({ account: created });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }

    console.error("Admin settlement account create error:", error);
    return NextResponse.json({ error: "Failed to create settlement account" }, { status: 500 });
  }
}
