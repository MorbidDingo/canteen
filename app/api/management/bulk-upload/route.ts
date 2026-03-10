import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { user, account, child, wallet, parentControl } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
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

    // Deduplicate: check which GR numbers already exist
    const grNumbers = rows.map((r) => r.gr);
    const existingChildren = await db
      .select({ grNumber: child.grNumber })
      .from(child)
      .where(
        // Using raw SQL for IN clause with parameterized GRs
        eq(child.grNumber, grNumbers[0]), // placeholder, will be overridden
      );

    // Actually fetch all existing GRs more efficiently
    const existingGrSet = new Set<string>();
    for (const gr of grNumbers) {
      const [found] = await db
        .select({ grNumber: child.grNumber })
        .from(child)
        .where(eq(child.grNumber, gr))
        .limit(1);
      if (found?.grNumber) existingGrSet.add(found.grNumber);
    }

    // Deduplicate emails from the spreadsheet — group rows by parent email
    const emailToRows = new Map<string, number[]>();
    for (let i = 0; i < rows.length; i++) {
      const email = rows[i].email?.toLowerCase();
      if (email) {
        if (!emailToRows.has(email)) emailToRows.set(email, []);
        emailToRows.get(email)!.push(i);
      }
    }

    // Check which parent emails already exist
    const existingParents = new Map<string, string>(); // email -> userId
    for (const email of emailToRows.keys()) {
      const [found] = await db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, email))
        .limit(1);
      if (found) existingParents.set(email, found.id);
    }

    const { hashPassword } = await import("better-auth/crypto");

    const results: {
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
    }[] = [];

    // Track newly created parents within this upload
    const createdParents = new Map<string, { id: string; password: string }>(); // email -> { id, password }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      // Skip if GR already exists
      if (existingGrSet.has(row.gr)) {
        results.push({
          row: i + 2,
          studentName: row.student,
          grNumber: row.gr,
          parentName: row.parent,
          parentEmail: row.email,
          password: null,
          status: "skipped",
          message: `GR number ${row.gr} already exists`,
          parentId: null,
          isNewParent: false,
        });
        continue;
      }

      try {
        let parentId: string | null = null;
        let password: string | null = null;
        let isNewParent = false;
        const email = row.email?.toLowerCase() || null;

        if (email) {
          // Check if we already created this parent in this batch
          if (createdParents.has(email)) {
            parentId = createdParents.get(email)!.id;
            password = createdParents.get(email)!.password;
          } else if (existingParents.has(email)) {
            // Parent already exists in DB
            parentId = existingParents.get(email)!;
          } else {
            // Create new parent
            password = generatePassword();
            const hashedPassword = await hashPassword(password);
            const newParentId = crypto.randomUUID();
            const now = new Date();

            await db.insert(user).values({
              id: newParentId,
              name: row.parent || row.student + " Parent",
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

            parentId = newParentId;
            isNewParent = true;
            createdParents.set(email, { id: newParentId, password });
            existingParents.set(email, newParentId);
          }
        }

        if (!parentId) {
          // No email provided — create student without parent? We need a parent.
          // Create a placeholder parent with no email
          results.push({
            row: i + 2,
            studentName: row.student,
            grNumber: row.gr,
            parentName: row.parent,
            parentEmail: null,
            password: null,
            status: "skipped",
            message: "No email provided — cannot create parent account",
            parentId: null,
            isNewParent: false,
          });
          continue;
        }

        // Create the student in a transaction
        await db.transaction(async (tx) => {
          const [created] = await tx
            .insert(child)
            .values({
              parentId: parentId!,
              name: row.student.trim(),
              grNumber: row.gr.trim(),
              className: row.class?.trim() || null,
              section: row.section?.trim() || null,
            })
            .returning();

          await tx.insert(wallet).values({
            childId: created.id,
            balance: 0,
          });

          await tx.insert(parentControl).values({
            childId: created.id,
            blockedCategories: "[]",
            blockedItemIds: "[]",
          });
        });

        existingGrSet.add(row.gr);

        results.push({
          row: i + 2,
          studentName: row.student,
          grNumber: row.gr,
          parentName: row.parent,
          parentEmail: email,
          password: isNewParent ? password : null,
          status: "created",
          message: isNewParent
            ? "Student & parent created"
            : "Student created (parent already existed)",
          parentId,
          isNewParent,
        });
      } catch (err) {
        console.error(`Bulk upload row ${i + 2} error:`, err);
        results.push({
          row: i + 2,
          studentName: row.student,
          grNumber: row.gr,
          parentName: row.parent,
          parentEmail: row.email,
          password: null,
          status: "error",
          message: err instanceof Error ? err.message : "Unknown error",
          parentId: null,
          isNewParent: false,
        });
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
