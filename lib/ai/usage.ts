import { db } from "@/lib/db";
import { aiUsageLog } from "@/lib/db/schema";

// ─── Rate Limiters (in-memory, per-instance) ────────────

const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

// Vector search: 20/hr/user
const searchRateLimitMap = new Map<string, { count: number; resetAt: number }>();
const SEARCH_RATE_LIMIT = 20;

// Document embedding: 50 docs/hr/org
const embeddingRateLimitMap = new Map<string, { count: number; resetAt: number }>();
const EMBEDDING_RATE_LIMIT = 50;

function checkLimit(
  map: Map<string, { count: number; resetAt: number }>,
  key: string,
  limit: number,
): boolean {
  const now = Date.now();
  const entry = map.get(key);

  if (!entry || now > entry.resetAt) {
    map.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }

  if (entry.count >= limit) {
    return false;
  }

  entry.count++;
  return true;
}

export function checkSearchRateLimit(userId: string): boolean {
  return checkLimit(searchRateLimitMap, userId, SEARCH_RATE_LIMIT);
}

export function checkEmbeddingRateLimit(orgId: string): boolean {
  return checkLimit(embeddingRateLimitMap, orgId, EMBEDDING_RATE_LIMIT);
}

// ─── Usage Logging ───────────────────────────────────────

type UsageType = "CHAT" | "EMBEDDING" | "SEARCH";

/**
 * Log AI usage for billing visibility.
 * Fire-and-forget — does not block the caller.
 */
export function logAiUsage(params: {
  userId: string;
  organizationId: string;
  type: UsageType;
  tokens: number;
  metadata?: Record<string, unknown>;
}): void {
  db.insert(aiUsageLog)
    .values({
      userId: params.userId,
      organizationId: params.organizationId,
      type: params.type,
      tokens: params.tokens,
      metadata: params.metadata ?? {},
    })
    .catch((err) =>
      console.error("[ai-usage] Failed to log usage:", err),
    );
}
