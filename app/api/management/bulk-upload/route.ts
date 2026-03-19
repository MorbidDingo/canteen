import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { user, account, child, wallet, parentControl, organizationMembership } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { runParallelForEach, type RowProgressLog } from "@/lib/bulk-upload-engine";
import * as XLSX from "xlsx";

function generatePassword(length = 10): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => chars[b % chars.length]).join("");
}

type RowData = {
  student: string;
  parent: string;
  email: string | null;
  gr: string;
  class: string | null;
  section: string | null;
};

type ResultRow = {
  row: number;
  studentName: string;
  grNumber: string;
  parentName: string;
  parentEmail: string | null;
  password: string | null;
  status: "created" | "skipped" | "error";
  message: string;
  parentId: string | null;
  isNewParent: boolean;
};

const MAX_ROWS = 5000;
const PARENT_CREATE_CONCURRENCY = Math.max(
  1,
  Number(process.env.BULK_PARENT_CREATE_CONCURRENCY || 16),
);
const STUDENT_CONCURRENCY = 48;

function normalizeRows(rawRows: Record<string, unknown>[]): RowData[] {
  return rawRows.map((raw) => {
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw)) {
      normalized[key.trim().toLowerCase()] = String(value ?? "").trim();
    }
    return {
      student: normalized["student"] || normalized["student name"] || normalized["studentname"] || "",
      parent: normalized["parent"] || normalized["parent name"] || normalized["parentname"] || "",
      email: normalized["email"] || normalized["email id"] || normalized["emailid"] || null,
      gr: normalized["gr"] || normalized["gr number"] || normalized["grnumber"] || "",
      class: normalized["class"] || normalized["classname"] || normalized["class name"] || null,
      section: normalized["section"] || null,
    };
  });
}

function validateRows(rows: RowData[]) {
  const errors: { row: number; error: string }[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row.student) errors.push({ row: i + 2, error: "Student name is required" });
    if (!row.gr) errors.push({ row: i + 2, error: "GR number is required" });
  }
  return errors;
}

function isStreamRequested(request: NextRequest): boolean {
  const mode = request.nextUrl.searchParams.get("mode");
  return mode === "stream";
}

async function processUpload(
  request: NextRequest,
  emit?: (log: RowProgressLog, processed: number, total: number) => void,
  emitStage?: (stage: string, message: string, progress?: number) => void,
) {
  let access;
  try {
    access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["MANAGEMENT", "OWNER"],
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return {
        response: NextResponse.json({ error: error.message, code: error.code }, { status: error.status }),
      };
    }
    throw error;
  }

  const organizationId = access.activeOrganizationId!;

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return { response: NextResponse.json({ error: "No file uploaded" }, { status: 400 }) };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  emitStage?.("parsing", "Reading workbook", 10);
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { response: NextResponse.json({ error: "Empty workbook" }, { status: 400 }) };
  }

  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName]);

  if (rawRows.length === 0) {
    return { response: NextResponse.json({ error: "No data rows found" }, { status: 400 }) };
  }

  if (rawRows.length > MAX_ROWS) {
    return {
      response: NextResponse.json(
        { error: `Maximum ${MAX_ROWS} rows allowed per upload` },
        { status: 400 },
      ),
    };
  }

  emitStage?.("parsing", "Workbook parsed", 100);
  emitStage?.("validating", "Validating rows and required fields", 10);
  const rows = normalizeRows(rawRows);
  rawRows.length = 0;
  const validationErrors = validateRows(rows);
  if (validationErrors.length > 0) {
    return {
      response: NextResponse.json(
        { error: "Validation errors", errors: validationErrors },
        { status: 400 },
      ),
    };
  }
  emitStage?.("validating", "Validation completed", 100);

  emitStage?.("preloading", "Loading existing students and parents", 10);
  const total = rows.length;
  let processed = 0;

  const grNumbers = [...new Set(rows.map((r) => r.gr))];
  const existingGrRows = grNumbers.length
    ? await db
        .select({ grNumber: child.grNumber })
        .from(child)
        .where(and(eq(child.organizationId, organizationId), inArray(child.grNumber, grNumbers)))
    : [];
  const existingGrSet = new Set(existingGrRows.map((r) => r.grNumber).filter(Boolean) as string[]);

  const uniqueEmails = [...new Set(rows.map((r) => r.email?.toLowerCase()).filter(Boolean) as string[])];
  const parentNameByEmail = new Map<string, string>();
  for (const row of rows) {
    const email = row.email?.toLowerCase();
    if (!email || parentNameByEmail.has(email)) continue;
    parentNameByEmail.set(email, row.parent || (row.student ? `${row.student} Parent` : "Parent"));
  }

  const existingParents = new Map<string, string>();
  if (uniqueEmails.length > 0) {
    const existingUsers = await db
      .select({ id: user.id, email: user.email })
      .from(user)
      .innerJoin(
        organizationMembership,
        and(
          eq(organizationMembership.userId, user.id),
          eq(organizationMembership.organizationId, organizationId),
          eq(organizationMembership.role, "PARENT"),
          eq(organizationMembership.status, "ACTIVE"),
        ),
      )
      .where(inArray(user.email, uniqueEmails));
    for (const u of existingUsers) existingParents.set(u.email.toLowerCase(), u.id);
  }
  emitStage?.("preloading", "Preload complete", 100);

  const { hashPassword } = await import("better-auth/crypto");
  const createdParents = new Map<string, { id: string; password: string }>();
  const newParentEmails = uniqueEmails.filter((e) => !existingParents.has(e));

  if (newParentEmails.length > 0) {
    let parentProcessed = 0;
    let parentProgressSent = -1;
    emitStage?.("creating-parents", `Creating parent accounts (0/${newParentEmails.length})`, 0);
    await runParallelForEach(newParentEmails, PARENT_CREATE_CONCURRENCY, async (email) => {
      const password = generatePassword();
      const hashedPassword = await hashPassword(password);
      const name = parentNameByEmail.get(email) ?? "Parent";

      const newParentId = crypto.randomUUID();
      const now = new Date();
      await db.insert(user).values({
        id: newParentId,
        name,
        email,
        emailVerified: false,
        role: "PARENT",
        createdAt: now,
        updatedAt: now,
      });

      await db.insert(organizationMembership).values({
        id: crypto.randomUUID(),
        organizationId,
        userId: newParentId,
        role: "PARENT",
        status: "ACTIVE",
        invitedByUserId: access.actorUserId,
        joinedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      await db.insert(account).values({
        id: crypto.randomUUID(),
        accountId: newParentId,
        providerId: "credential",
        userId: newParentId,
        password: hashedPassword,
        createdAt: now,
        updatedAt: now,
      });
      createdParents.set(email, { id: newParentId, password });
      existingParents.set(email, newParentId);

      parentProcessed += 1;
      const parentPct = Math.round((parentProcessed / newParentEmails.length) * 100);
      if (parentPct !== parentProgressSent) {
        parentProgressSent = parentPct;
        emitStage?.(
          "creating-parents",
          `Creating parent accounts (${parentProcessed}/${newParentEmails.length})`,
          parentPct,
        );
      }
    });
  } else {
    emitStage?.("creating-parents", "No parent accounts to create", 100);
  }

  const results: ResultRow[] = new Array(rows.length);

  let studentProgressSent = -1;
  emitStage?.("creating-students", "Creating students and wallets (0%)", 0);
  await runParallelForEach(rows, STUDENT_CONCURRENCY, async (row, idx) => {
    if (existingGrSet.has(row.gr)) {
      const res: ResultRow = {
        row: idx + 2,
        studentName: row.student,
        grNumber: row.gr,
        parentName: row.parent,
        parentEmail: row.email,
        password: null,
        status: "skipped",
        message: `GR number ${row.gr} already exists`,
        parentId: null,
        isNewParent: false,
      };
      results[idx] = res;
      processed += 1;
      const pct = Math.round((processed / total) * 100);
      if (pct !== studentProgressSent) {
        studentProgressSent = pct;
        emitStage?.("creating-students", `Creating students and wallets (${pct}%)`, pct);
      }
      emit?.({ row: res.row, status: res.status, message: res.message }, processed, total);
      return;
    }

    const email = row.email?.toLowerCase() || null;
    let parentId: string | null = null;
    let password: string | null = null;
    let isNewParent = false;

    if (email) {
      if (createdParents.has(email)) {
        const cp = createdParents.get(email)!;
        parentId = cp.id;
        password = cp.password;
        isNewParent = true;
      } else if (existingParents.has(email)) {
        parentId = existingParents.get(email)!;

        const [existingMembership] = await db
          .select({ id: organizationMembership.id })
          .from(organizationMembership)
          .where(
            and(
              eq(organizationMembership.organizationId, organizationId),
              eq(organizationMembership.userId, parentId),
              eq(organizationMembership.role, "PARENT"),
              eq(organizationMembership.status, "ACTIVE"),
            ),
          )
          .limit(1);

        if (!existingMembership) {
          const now = new Date();
          await db.insert(organizationMembership).values({
            id: crypto.randomUUID(),
            organizationId,
            userId: parentId,
            role: "PARENT",
            status: "ACTIVE",
            invitedByUserId: access.actorUserId,
            joinedAt: now,
            createdAt: now,
            updatedAt: now,
          });
        }
      }
    }

    if (!parentId) {
      const res: ResultRow = {
        row: idx + 2,
        studentName: row.student,
        grNumber: row.gr,
        parentName: row.parent,
        parentEmail: null,
        password: null,
        status: "skipped",
        message: "No email provided - cannot create parent account",
        parentId: null,
        isNewParent: false,
      };
      results[idx] = res;
      processed += 1;
      const pct = Math.round((processed / total) * 100);
      if (pct !== studentProgressSent) {
        studentProgressSent = pct;
        emitStage?.("creating-students", `Creating students and wallets (${pct}%)`, pct);
      }
      emit?.({ row: res.row, status: res.status, message: res.message }, processed, total);
      return;
    }

    try {
      await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(child)
          .values({
            organizationId,
            parentId,
            name: row.student.trim(),
            grNumber: row.gr.trim(),
            className: row.class?.trim() || null,
            section: row.section?.trim() || null,
          })
          .returning();

        await Promise.all([
          tx.insert(wallet).values({ childId: created.id, balance: 0 }),
          tx.insert(parentControl).values({
            childId: created.id,
            blockedCategories: "[]",
            blockedItemIds: "[]",
            blockedBookCategories: "[]",
            blockedBookAuthors: "[]",
            blockedBookIds: "[]",
          }),
        ]);
      });

      const res: ResultRow = {
        row: idx + 2,
        studentName: row.student,
        grNumber: row.gr,
        parentName: row.parent,
        parentEmail: email,
        password: isNewParent ? password : null,
        status: "created",
        message: isNewParent ? "Student and parent created" : "Student created (parent already existed)",
        parentId,
        isNewParent,
      };
      results[idx] = res;
      processed += 1;
      const pct = Math.round((processed / total) * 100);
      if (pct !== studentProgressSent) {
        studentProgressSent = pct;
        emitStage?.("creating-students", `Creating students and wallets (${pct}%)`, pct);
      }
      emit?.({ row: res.row, status: res.status, message: res.message }, processed, total);
    } catch (error) {
      const res: ResultRow = {
        row: idx + 2,
        studentName: row.student,
        grNumber: row.gr,
        parentName: row.parent,
        parentEmail: row.email,
        password: null,
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
        parentId: null,
        isNewParent: false,
      };
      results[idx] = res;
      processed += 1;
      const pct = Math.round((processed / total) * 100);
      if (pct !== studentProgressSent) {
        studentProgressSent = pct;
        emitStage?.("creating-students", `Creating students and wallets (${pct}%)`, pct);
      }
      emit?.({ row: res.row, status: res.status, message: res.message }, processed, total);
    }
  });

  const created = results.filter((r) => r?.status === "created").length;
  const skipped = results.filter((r) => r?.status === "skipped").length;
  const errored = results.filter((r) => r?.status === "error").length;

  emitStage?.("finalizing", "Writing audit and preparing response", 40);
  await logAudit({
    userId: access.actorUserId,
    userRole: access.membershipRole || access.session.user.role,
    action: AUDIT_ACTIONS.BULK_UPLOAD,
    details: {
      organizationId,
      totalRows: rows.length,
      created,
      skipped,
      errors: errored,
      parentConcurrency: PARENT_CREATE_CONCURRENCY,
      studentConcurrency: STUDENT_CONCURRENCY,
    },
    request,
  });
  emitStage?.("finalizing", "Finalizing complete", 100);

  return {
    payload: {
      summary: { total: rows.length, created, skipped, errors: errored },
      results,
    },
  };
}

export async function POST(request: NextRequest) {
  if (!isStreamRequested(request)) {
    try {
      const out = await processUpload(request);
      if (out.response) return out.response;
      return NextResponse.json(out.payload);
    } catch (error) {
      console.error("Bulk upload error:", error);
      return NextResponse.json({ error: "Failed to process upload" }, { status: 500 });
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        send("start", { message: "Upload started" });
        const out = await processUpload(
          request,
          (log, processed, total) => {
          send("row", { ...log, processed, total });
          },
          (stage, message, progress) => {
            send("stage", { stage, message, progress });
          },
        );

        if (out.response) {
          const text = await out.response.text();
          send("error", { message: text });
          controller.close();
          return;
        }

        send("done", out.payload);
      } catch (error) {
        send("error", { message: error instanceof Error ? error.message : "Upload failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
