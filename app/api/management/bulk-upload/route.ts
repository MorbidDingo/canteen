import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { user, account, child, wallet, parentControl } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { getSession } from "@/lib/auth-server";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";
import * as XLSX from "xlsx";

function generatePassword(length = 10): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => chars[b % chars.length]).join("");
}

interface RowData {
  student: string;
  parent: string;
  email: string | null;
  gr: string;
  class: string | null;
  section: string | null;
}

const PARALLEL_BATCH_SIZE = 20;

// POST — process Excel bulk upload
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "MANAGEMENT") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return NextResponse.json({ error: "Empty workbook" }, { status: 400 });
    }

    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName]);

    if (rawRows.length === 0) {
      return NextResponse.json({ error: "No data rows found" }, { status: 400 });
    }

    if (rawRows.length > 500) {
      return NextResponse.json({ error: "Maximum 500 rows allowed per upload" }, { status: 400 });
    }

    // Normalize column names (case-insensitive, trim)
    const rows: RowData[] = rawRows.map((raw) => {
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

    // Validate mandatory fields
    const errors: { row: number; error: string }[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row.student) errors.push({ row: i + 2, error: "Student name is required" });
      if (!row.gr) errors.push({ row: i + 2, error: "GR number is required" });
    }
    if (errors.length > 0) {
      return NextResponse.json({ error: "Validation errors", errors }, { status: 400 });
    }

    // ── Batch lookup: existing GR numbers (single query) ──
    const grNumbers = [...new Set(rows.map((r) => r.gr))];
    const existingGrRows = grNumbers.length > 0
      ? await db.select({ grNumber: child.grNumber }).from(child).where(inArray(child.grNumber, grNumbers))
      : [];
    const existingGrSet = new Set(existingGrRows.map((r) => r.grNumber).filter(Boolean) as string[]);

    // ── Batch lookup: existing parent emails (single query) ──
    const uniqueEmails = [...new Set(rows.map((r) => r.email?.toLowerCase()).filter(Boolean) as string[])];
    const existingParents = new Map<string, string>();
    if (uniqueEmails.length > 0) {
      const existingUsers = await db.select({ id: user.id, email: user.email }).from(user).where(inArray(user.email, uniqueEmails));
      for (const u of existingUsers) existingParents.set(u.email.toLowerCase(), u.id);
    }

    const { hashPassword } = await import("better-auth/crypto");

    // ── Phase 1: Create new parent accounts (sequentially to avoid duplicate emails) ──
    const createdParents = new Map<string, { id: string; password: string }>();
    const newParentEmails = uniqueEmails.filter((e) => !existingParents.has(e));

    // Pre-generate passwords & hashes in parallel
    const parentPrep = await Promise.all(
      newParentEmails.map(async (email) => {
        const password = generatePassword();
        const hashedPassword = await hashPassword(password);
        // Find the first row with this email for the parent name
        const row = rows.find((r) => r.email?.toLowerCase() === email);
        const name = row?.parent || row?.student + " Parent" || "Parent";
        return { email, password, hashedPassword, name };
      })
    );

    // Batch insert parents in chunks
    for (let i = 0; i < parentPrep.length; i += PARALLEL_BATCH_SIZE) {
      const batch = parentPrep.slice(i, i + PARALLEL_BATCH_SIZE);
      await Promise.all(
        batch.map(async ({ email, password, hashedPassword, name }) => {
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
        })
      );
    }

    // ── Phase 2: Build result array & identify students to create ──
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

    const results: ResultRow[] = new Array(rows.length);
    const toCreate: { idx: number; row: RowData; parentId: string; email: string | null; isNewParent: boolean; password: string | null }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      if (existingGrSet.has(row.gr)) {
        results[i] = {
          row: i + 2, studentName: row.student, grNumber: row.gr,
          parentName: row.parent, parentEmail: row.email, password: null,
          status: "skipped", message: `GR number ${row.gr} already exists`,
          parentId: null, isNewParent: false,
        };
        continue;
      }

      const email = row.email?.toLowerCase() || null;
      let parentId: string | null = null;
      let password: string | null = null;
      let isNewParent = false;

      if (email) {
        if (createdParents.has(email)) {
          parentId = createdParents.get(email)!.id;
          password = createdParents.get(email)!.password;
          isNewParent = true;
        } else if (existingParents.has(email)) {
          parentId = existingParents.get(email)!;
        }
      }

      if (!parentId) {
        results[i] = {
          row: i + 2, studentName: row.student, grNumber: row.gr,
          parentName: row.parent, parentEmail: null, password: null,
          status: "skipped", message: "No email provided — cannot create parent account",
          parentId: null, isNewParent: false,
        };
        continue;
      }

      toCreate.push({ idx: i, row, parentId, email, isNewParent, password });
    }

    // ── Phase 3: Create students in parallel batches ──
    for (let i = 0; i < toCreate.length; i += PARALLEL_BATCH_SIZE) {
      const batch = toCreate.slice(i, i + PARALLEL_BATCH_SIZE);
      const batchResults = await Promise.allSettled(
        batch.map(async ({ idx, row, parentId, email, isNewParent, password }) => {
          await db.transaction(async (tx) => {
            const [created] = await tx
              .insert(child)
              .values({
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
              }),
            ]);
          });
          return { idx, row, email, isNewParent, password };
        })
      );

      for (const result of batchResults) {
        if (result.status === "fulfilled") {
          const { idx, row, email, isNewParent, password } = result.value;
          results[idx] = {
            row: idx + 2, studentName: row.student, grNumber: row.gr,
            parentName: row.parent, parentEmail: email, password: isNewParent ? password : null,
            status: "created",
            message: isNewParent ? "Student & parent created" : "Student created (parent already existed)",
            parentId: existingParents.get(email || "") || null, isNewParent,
          };
        } else {
          const entry = batch[batchResults.indexOf(result)];
          const err = result.reason;
          console.error(`Bulk upload row ${entry.idx + 2} error:`, err);
          results[entry.idx] = {
            row: entry.idx + 2, studentName: entry.row.student, grNumber: entry.row.gr,
            parentName: entry.row.parent, parentEmail: entry.row.email, password: null,
            status: "error", message: err instanceof Error ? err.message : "Unknown error",
            parentId: null, isNewParent: false,
          };
        }
      }
    }

    const created = results.filter((r) => r.status === "created").length;
    const skipped = results.filter((r) => r.status === "skipped").length;
    const errored = results.filter((r) => r.status === "error").length;

    await logAudit({
      userId: session.user.id,
      userRole: session.user.role,
      action: AUDIT_ACTIONS.BULK_UPLOAD,
      details: { totalRows: rows.length, created, skipped, errors: errored },
      request,
    });

    return NextResponse.json({
      summary: { total: rows.length, created, skipped, errors: errored },
      results,
    });
  } catch (error) {
    console.error("Bulk upload error:", error);
    return NextResponse.json({ error: "Failed to process upload" }, { status: 500 });
  }
}
