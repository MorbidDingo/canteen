import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { certeSubscription } from "@/lib/db/schema";
import { eq, and, gte } from "drizzle-orm";
import { getSession, AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { buildSystemPromptContext } from "@/lib/ai/system-prompt";

// ─── In-memory prompt cache (userId → { prompts, expiresAt }) ────────────────
// Avoids calling Claude on every panel open; prompts are stale after 5 minutes.

interface CachedPrompts {
  prompts: { label: string; icon: string }[];
  expiresAt: number;
}

const promptCache = new Map<string, CachedPrompts>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ─── Fallback prompts (used on error or when Certe+ is inactive) ─────────────

const FALLBACK_PROMPTS: { label: string; icon: string }[] = [
  { label: "What's healthy today?", icon: "🥗" },
  { label: "Show my spending this week", icon: "📊" },
  { label: "Order my usual lunch", icon: "🍱" },
  { label: "What's popular right now?", icon: "🔥" },
];

// ─── Context hint → system instruction mapping ───────────────────────────────

function buildContextHint(context: string | null): string {
  if (context === "library") {
    return "The user is currently browsing the school library. Bias prompts toward book discovery, reading progress, reservations, and library features.";
  }
  if (context === "content") {
    return "The user is currently on the assignments/notes board. Bias prompts toward assignment due dates, pending work, note-taking, and content queries.";
  }
  // "canteen" or unset
  return "The user is currently on the canteen menu. Bias prompts toward food ordering, wallet top-ups, spending insights, and menu exploration.";
}

// ─── POST /api/ai/suggested-prompts ─────────────────────────────────────────

export async function POST(request: NextRequest) {
  // 1. Auth
  let access;
  try {
    access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["PARENT", "GENERAL"],
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return Response.json({ prompts: FALLBACK_PROMPTS }, { status: 200 });
    }
    throw error;
  }

  const userId = access.session.user.id;
  const orgId = access.activeOrganizationId!;
  const userName = access.session.user.name ?? "User";
  const userRole = access.membershipRole ?? "PARENT";

  // 2. Certe+ gate — non-subscribers get fallback prompts immediately
  const now = new Date();
  const [activeSub] = await db
    .select({ id: certeSubscription.id })
    .from(certeSubscription)
    .where(
      and(
        eq(certeSubscription.parentId, userId),
        eq(certeSubscription.status, "ACTIVE"),
        gte(certeSubscription.endDate, now),
      ),
    )
    .limit(1);

  if (!activeSub) {
    return Response.json({ prompts: FALLBACK_PROMPTS }, { status: 200 });
  }

  // 3. Parse request body
  let context: string | null = null;
  try {
    const body = await request.json();
    context = typeof body?.context === "string" ? body.context : null;
  } catch {
    // No body — use default context
  }

  // 4. Cache lookup (keyed by userId + context)
  const cacheKey = `${userId}:${context ?? "canteen"}`;
  const cached = promptCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return Response.json({ prompts: cached.prompts }, { status: 200 });
  }

  // 5. Build context
  let ctx;
  try {
    ctx = await buildSystemPromptContext(userId, userName, userRole, orgId);
  } catch {
    return Response.json({ prompts: FALLBACK_PROMPTS }, { status: 200 });
  }

  // 6. Compose a lightweight prompt for Claude
  const contextHint = buildContextHint(context);

  const userMessage = `
${contextHint}

User context:
- Name: ${ctx.userName}
- Wallet balance: ₹${ctx.walletBalance.toFixed(2)}
- Pending assignments: ${ctx.pendingAssignmentsCount}
- Content posting permission: ${ctx.contentPermissionScope ?? "none"}
- Time: ${["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][new Date().getDay()]}, hour ${new Date().getHours()}
- Children: ${ctx.children.map((c) => `${c.name} (${c.className ?? "no class"})`).join(", ") || "none"}
- Wallet forecast: ${ctx.walletInsights.map((w) => `${w.childName}: ₹${w.forecast.currentBalance?.toFixed(0) ?? "?"} balance, depletes in ${w.forecast.daysUntilDepletion ?? "?"} days`).join(", ") || "no data"}

Generate exactly 4 short, actionable chat prompt suggestions that would be genuinely useful to this user right now. Each prompt should be no more than 8 words. Return ONLY a JSON array in this exact format and nothing else:
[
  {"label": "...", "icon": "emoji"},
  {"label": "...", "icon": "emoji"},
  {"label": "...", "icon": "emoji"},
  {"label": "...", "icon": "emoji"}
]
`.trim();

  // 7. Call Claude (non-streaming)
  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      messages: [{ role: "user", content: userMessage }],
    });

    const raw =
      response.content[0]?.type === "text" ? response.content[0].text.trim() : "";

    // Extract JSON array from the response
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) throw new Error("No JSON array in response");

    const parsed = JSON.parse(match[0]) as { label: string; icon: string }[];

    if (
      !Array.isArray(parsed) ||
      parsed.length === 0 ||
      !parsed.every((p) => typeof p.label === "string" && typeof p.icon === "string")
    ) {
      throw new Error("Invalid response shape");
    }

    const prompts = parsed.slice(0, 4);

    // Cache the result
    promptCache.set(cacheKey, { prompts, expiresAt: Date.now() + CACHE_TTL_MS });

    return Response.json({ prompts }, { status: 200 });
  } catch {
    // Fall back gracefully — never surface a 500 to the client
    return Response.json({ prompts: FALLBACK_PROMPTS }, { status: 200 });
  }
}
