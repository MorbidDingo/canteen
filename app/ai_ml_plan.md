Plan: AI Assistant & ML Intelligence Layer (Certe+)
Add a Claude-powered AI assistant for parent/general accounts and an ML intelligence layer (recommendations, anomaly detection, predictive analytics) — all gated behind Certe+ subscription. Claude gets tool-use access to backend functions so it can answer questions, place orders, set schedules, and surface ML-driven insights conversationally.

Phase 1: Foundation — ML Data Pipeline & Models
Step 1.1: Install Dependencies

@anthropic-ai/sdk, simple-statistics (lightweight JS stats lib — avoids Python microservice complexity)
Add ANTHROPIC_API_KEY to env
Step 1.2: ML Data Collection Layer — new lib/ml/data-collector.ts

getUserFoodHistory(childId, orgId, days) — past orders with timestamps, categories, prices
getUserSpendingProfile(childId, orgId, days) — daily spending stats + variance
getMenuPopularity(orgId, days) — item popularity by time-of-day, day-of-week
getParentControls(childId) — blocked categories/items, spend limits
getPeerBehavior(orgId, className, days) — what similar students order
getWalletHistory(childId, days) — top-up frequency, balance trajectory
All data sourced from existing tables: order, orderItem, menuItem, wallet, walletTransaction, parentControl, child, preOrder

Step 1.3: Recommendation Engine — new lib/ml/recommendation-engine.ts

Item-Item similarity matrix (co-purchase frequency within org)
Time-aware scoring (breakfast vs lunch preference patterns)
User preference vector from order history (category weights, price range)
Constraint filter (parent-blocked items, out-of-stock, over-budget)
Peer signal boost (popular with same class/grade)
Returns scored items with human-readable reasons[] ("Popular at this time", "Matches preference for light meals")
Step 1.4: Anomaly Detection — new lib/ml/anomaly-detection.ts

Z-Score + Moving Average Deviation algorithm
Detects: spending spikes (>2σ above 14-day rolling avg), skipped meals (no purchase during expected windows), restricted item attempts, timing anomalies
Triggers: per-order check + nightly batch
Stores results in new anomaly_alert table, surfaces via existing notification system
Step 1.5: Predictive Wallet Model — new lib/ml/predictive-wallet.ts

Weighted Moving Average with day-of-week seasonality
Projects: balance depletion date, recharge recommendation, daily limit exceedance risk
predictConsumption(childId, orgId, date) → likely items with probability + estimated spend (enables smart pre-order)
Phase 2: Claude AI Assistant Integration
Step 2.1: Claude Tool Definitions — new lib/ai/tools.ts

Information tools:

get_menu, get_wallet_balance, get_order_history, get_recommendations (ML-powered), get_wallet_forecast, get_anomaly_alerts, get_parent_controls, get_pre_orders, get_child_info
Action tools:

place_order — validates balance + controls, returns token code
schedule_order — creates ONE_DAY pre-order for future time (e.g., "Buy milkshake at 12:30 PM")
set_weekly_schedule — creates SUBSCRIPTION pre-order for recurring orders
cancel_order, add_to_cart
Each tool handler calls the same functions the existing API routes use (not HTTP calls) — same auth context, same validation.

Step 2.2: System Prompt Builder — new lib/ai/system-prompt.ts

Dynamic per-request context: user role, children list, wallet summary, today's menu categories, time of day, Certe+ status, parent controls, top ML insights
Tone: friendly, concise, prices in ₹, always confirm before placing orders
Step 2.3: Streaming Chat API — new app/api/ai/chat/route.ts

POST with SSE streaming response
Auth: requireLinkedAccount() → check Certe+ subscription active → 403 if not
Model: claude-sonnet-4-20250514 (good tool-use performance, reasonable cost)
Tool-use loop: Claude calls tool → backend executes → result fed back → Claude responds
Conversation history: client-managed (last ~20 messages), no server persistence initially
Step 2.4: Scheduled Order Logic — new lib/ai/scheduled-orders.ts

"Buy milkshake at 12:30 PM" → validate item + balance → create ONE_DAY pre-order → confirm with token
Weekly schedule → create SUBSCRIPTION pre-orders → confirm summary
Balance check before confirming (if insufficient, Claude says so)
Step 2.5: Permission-Based Auto-Ordering

New field on parentControl: aiAutoOrderEnabled (default false)
When enabled: Claude places orders using ML recommendations + learned schedule without per-order confirmation
Claude still shows what it's ordering, just doesn't wait for "yes"
Weekly schedule review prompt to parent
Phase 3: Database Migration — drizzle/0018_ai_ml_infrastructure.sql
New tables:

anomaly_alert — childId, orgId, type (SPENDING_SPIKE | SKIPPED_MEAL | RESTRICTED_ATTEMPT | TIMING_ANOMALY), severity, message, data JSON, acknowledged, createdAt
ml_recommendation_cache — childId, orgId, recommendations JSON, computedAt, expiresAt
ai_scheduled_action — userId, childId, orgId, actionType (ORDER | REMINDER), payload JSON, scheduledFor, executedAt, status (PENDING | EXECUTED | FAILED | CANCELLED)
Extend parentControl:

Add aiAutoOrderEnabled boolean default false
Phase 4: Frontend — Chat UI
Step 4.1: components/ai/chat-assistant.tsx — floating action button (bottom-right) → slide-up chat panel

Streaming message display, child selector (multi-child parents), suggested prompts ("What's healthy today?", "Show my spending this week", "Order my usual lunch")
Step 4.2: components/ai/chat-menu-card.tsx — when Claude returns menu items, render as cards with "Add to Cart" / "Order Now" buttons (uses existing cart store from cart-store.ts)

Step 4.3: Integration — add chat FAB to app/(parent)/layout.tsx/layout.tsx) + general account layouts, gated behind useCertePlusStore().status.active with upgrade prompt for non-subscribers

Phase 5: Wire Empty Recommendation Endpoints
Fill the existing empty app/api/recommendations/*/route.ts folders with ML engine calls:

daily/ → time-slot recommendations, frequent/ → user's top items, trending/ → org-wide popular, budget/ → within remaining daily budget, nutrition/ → healthier alternatives, insights/ → wallet forecast + anomalies, preorder-candidates/ → predicted consumption for pre-order
These serve both Claude tools AND direct UI consumers.

Phase 6: Anomaly → Notification Pipeline
Anomaly detection results → insert anomaly_alert → create parentNotification (existing) → optionally trigger WhatsApp/SMS for HIGH severity (existing messaging service)
Batch job via Vercel cron → /api/ml/batch every 6 hours
Claude surfaces anomalies conversationally when parent asks "How is my child doing?"
Relevant Files
Modify: package.json, schema.ts, app/(parent)/layout.tsx/layout.tsx), constants.ts, app/api/recommendations/*/route.ts

Create: lib/ml/data-collector.ts, lib/ml/recommendation-engine.ts, lib/ml/anomaly-detection.ts, lib/ml/predictive-wallet.ts, lib/ai/tools.ts, lib/ai/system-prompt.ts, lib/ai/scheduled-orders.ts, app/api/ai/chat/route.ts, components/ai/chat-assistant.tsx, components/ai/chat-menu-card.tsx, components/ai/chat-message.tsx, drizzle/0018_ai_ml_infrastructure.sql

Reference: analytics.ts (existing recommendation patterns), auth-server.ts (requireAccess + feature gating), route.ts (subscription check pattern), certe-plus-store.ts (client-side gating)

Verification
Unit tests for ML functions — feed known order history, assert recommendation scores
Anomaly detection test — inject synthetic spending spike, verify alert created
Wallet forecast test — compare predicted vs actual on historical data
Claude tool tests — call each handler directly with mock context
Integration test — POST to /api/ai/chat, verify tool calls execute + stream completes
Certe+ gate test — 403 when inactive, 200 when active
Scheduled order test — verify pre-order created with correct time via Claude
Manual E2E — parent dashboard → chat FAB → "What should I order?" → menu cards → place order → wallet deducted
Decisions
JS-only ML — simple-statistics + custom code, no Python microservice. Sufficient for collaborative filtering and z-score anomaly detection at this scale
Claude Sonnet for tool use — fast, capable, ~$0.01–0.03/call. With ~100 active users × ~10 msgs/day ≈ $30–90/month, covered by Certe+ revenue
Client-side conversation history — no server persistence initially. Server-side is a future enhancement
No vector DB — structured SQL + in-memory computation, scale doesn't warrant embeddings yet
Scope excluded: image recognition for food, voice input, multi-language responses, admin-facing AI analytics
Further Considerations
Rate limiting: Recommend 30 messages/hour/user via in-memory counter (Redis upgrade path later)
Batch ML refresh: Vercel cron calling /api/ml/batch every 6 hours for anomaly detection + recommendation cache refresh
Cost monitoring: Log Claude token usage per user — add a simple ai_usage_log table or append to existing audit patterns

IMP:
Things worth thinking about

The tool-use loop latency could surprise users. If Claude calls 3–4 tools in sequence (balance check → menu fetch → recommendation → place order), that's multiple round trips before a response streams. Consider prefetching the most common context (balance, today's menu, top recommendations) into the system prompt so Claude has it without tool calls for the happy path.
aiAutoOrderEnabled is a footgun waiting to happen. A parent enabling this and then getting surprised charges is a support nightmare. You'd want a hard cap (e.g. max ₹X/day in auto mode) and a daily morning summary push before anything executes, not just "Claude shows what it ordered."
The anomaly_alert table — make sure acknowledged is indexed and you have a soft-delete or TTL pattern. These will accumulate fast and parents won't clear them.
Rate limiting at 30 msg/hour in-memory won't survive a Vercel cold start or multi-instance deploy. Even a simple Redis incr with a TTL would be worth it from day one if you're on Vercel Pro, otherwise you'll have zero enforcement in production.
ml_recommendation_cache expiry strategy — what's the TTL? If a parent chats at 11:55 PM and gets yesterday's lunch recommendations, that's a bad experience. The cache should be time-slot aware, not just time-since-computed.

Minor

claude-sonnet-4-20250514 in the plan — double check the exact model string when you wire the API call, Anthropic has been iterating on versioning.
The chat FAB being layout-level is correct, but make sure the Certe+ gate renders an upgrade nudge inline in the chat panel rather than just hiding the FAB — discovered features convert better than invisible ones.