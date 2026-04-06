import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contentPost, contentPostAudience } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";

// PATCH — replace audience rows for a post
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let access;
  try {
    access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT", "ADMIN", "OPERATOR", "LIB_OPERATOR", "ATTENDANCE", "PARENT", "GENERAL"],
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    throw error;
  }

  const organizationId = access.activeOrganizationId!;
  const { id: postId } = await params;

  const [post] = await db
    .select({ id: contentPost.id })
    .from(contentPost)
    .where(
      and(
        eq(contentPost.id, postId),
        eq(contentPost.organizationId, organizationId),
        eq(contentPost.authorUserId, access.actorUserId),
      ),
    )
    .limit(1);

  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  const body = await request.json();
  const { audience } = body as {
    audience?: Array<{
      audienceType: string;
      className?: string;
      section?: string;
      userId?: string;
      groupId?: string;
    }>;
  };

  if (!audience || audience.length === 0) {
    return NextResponse.json({ error: "At least one audience target is required" }, { status: 400 });
  }

  const validTypes = ["ALL_ORG", "CLASS", "SECTION", "USER", "GROUP"];
  for (const a of audience) {
    if (!validTypes.includes(a.audienceType)) {
      return NextResponse.json({ error: `Invalid audienceType: ${a.audienceType}` }, { status: 400 });
    }
    if (a.audienceType === "CLASS" && !a.className) {
      return NextResponse.json({ error: "CLASS audience requires className" }, { status: 400 });
    }
    if (a.audienceType === "SECTION" && (!a.className || !a.section)) {
      return NextResponse.json({ error: "SECTION audience requires className and section" }, { status: 400 });
    }
    if (a.audienceType === "USER" && !a.userId) {
      return NextResponse.json({ error: "USER audience requires userId" }, { status: 400 });
    }
    if (a.audienceType === "GROUP" && !a.groupId) {
      return NextResponse.json({ error: "GROUP audience requires groupId" }, { status: 400 });
    }
  }

  await db.transaction(async (tx) => {
    await tx.delete(contentPostAudience).where(eq(contentPostAudience.postId, postId));
    await tx.insert(contentPostAudience).values(
      audience.map((a) => ({
        postId,
        audienceType: a.audienceType as "ALL_ORG" | "CLASS" | "SECTION" | "USER" | "GROUP",
        className: a.className || null,
        section: a.section || null,
        userId: a.userId || null,
        groupId: a.groupId || null,
      })),
    );
  });

  const updated = await db
    .select()
    .from(contentPostAudience)
    .where(eq(contentPostAudience.postId, postId));

  return NextResponse.json({ audiences: updated });
}
