import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  book,
  bookCopy,
  bookFeedback,
  bookIssuance,
  child,
} from "@/lib/db/schema";
import { AccessDeniedError, requireLinkedAccount } from "@/lib/auth-server";
import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";

const ALLOWED_TAGS = [
  "page-turner",
  "educational",
  "boring",
  "too-long",
  "too-short",
  "inspiring",
  "funny",
  "confusing",
  "age-appropriate",
  "not-age-appropriate",
  "beautifully-written",
  "must-read",
] as const;

const feedbackSchema = z.object({
  issuanceId: z.string().min(1),
  enjoymentRating: z.number().int().min(1).max(5),
  difficultyRating: z.number().int().min(1).max(5),
  wouldRecommend: z.boolean(),
  tags: z.array(z.enum(ALLOWED_TAGS)).max(5).optional(),
  review: z.string().max(500).optional(),
});

export async function POST(request: NextRequest) {
  let access;
  try {
    access = await requireLinkedAccount();
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }

  const session = access.session;
  const organizationId = access.activeOrganizationId!;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = feedbackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.issues }, { status: 400 });
  }

  const { issuanceId, enjoymentRating, difficultyRating, wouldRecommend, tags, review } = parsed.data;

  // Verify issuance exists and belongs to parent's child
  const issuanceRow = await db
    .select({
      id: bookIssuance.id,
      childId: bookIssuance.childId,
      status: bookIssuance.status,
      bookId: bookCopy.bookId,
      orgId: book.organizationId,
    })
    .from(bookIssuance)
    .innerJoin(bookCopy, eq(bookIssuance.bookCopyId, bookCopy.id))
    .innerJoin(book, eq(bookCopy.bookId, book.id))
    .where(eq(bookIssuance.id, issuanceId))
    .limit(1);

  if (issuanceRow.length === 0) {
    return NextResponse.json({ error: "Issuance not found" }, { status: 404 });
  }

  const issuance = issuanceRow[0];

  if (issuance.orgId !== organizationId) {
    return NextResponse.json({ error: "Issuance not in current organization" }, { status: 403 });
  }

  // Verify child belongs to this parent
  const childRow = await db
    .select({ id: child.id })
    .from(child)
    .where(and(eq(child.id, issuance.childId), eq(child.parentId, session.user.id)))
    .limit(1);

  if (childRow.length === 0) {
    return NextResponse.json({ error: "Child not linked to your account" }, { status: 403 });
  }

  // Check no duplicate feedback
  const existing = await db
    .select({ id: bookFeedback.id })
    .from(bookFeedback)
    .where(eq(bookFeedback.issuanceId, issuanceId))
    .limit(1);

  if (existing.length > 0) {
    return NextResponse.json({ error: "Feedback already submitted for this issuance" }, { status: 409 });
  }

  const [created] = await db.insert(bookFeedback).values({
    bookId: issuance.bookId,
    issuanceId,
    childId: issuance.childId,
    parentId: session.user.id,
    organizationId,
    enjoymentRating,
    difficultyRating,
    wouldRecommend,
    tags: tags ? JSON.stringify(tags) : null,
    review: review?.trim() || null,
  }).returning({ id: bookFeedback.id });

  return NextResponse.json({ id: created.id, ok: true });
}

export async function GET() {
  let access;
  try {
    access = await requireLinkedAccount();
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }

  const rows = await db
    .select({
      id: bookFeedback.id,
      bookId: bookFeedback.bookId,
      issuanceId: bookFeedback.issuanceId,
      childId: bookFeedback.childId,
      enjoymentRating: bookFeedback.enjoymentRating,
      difficultyRating: bookFeedback.difficultyRating,
      wouldRecommend: bookFeedback.wouldRecommend,
      tags: bookFeedback.tags,
      review: bookFeedback.review,
      createdAt: bookFeedback.createdAt,
    })
    .from(bookFeedback)
    .where(eq(bookFeedback.parentId, access.session.user.id))
    .orderBy(bookFeedback.createdAt);

  return NextResponse.json(rows);
}
