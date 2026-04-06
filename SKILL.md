# Certe Canteen & Library — Codebase Reference (Agent SKILL)

> This file is a living reference for the AI coding agent. Load it with `read_file` at the start
> of any coding session to avoid re-exploring the codebase from scratch.
> **Last updated:** July 2025

---

## 1. Project Overview

**Certe** is a multi-tenant SaaS platform for school canteen and library management.

- A single deployment serves multiple `organization` tenants.
- Each organization has:
  - One or more `canteen` records (each backed by a KIOSK device account).
  - Zero or more `library` records (each backed by a LIBRARY device account).
- Parents top-up a per-child `wallet` and place orders/pre-orders.
- Kiosk tablets run a device session and process orders in real-time.
- Gate tablets track student entry/exit via RFID.
- Library kiosk tablets issue and return books.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router, TypeScript strict) |
| ORM | Drizzle ORM + PostgreSQL |
| Auth | `better-auth` + custom server helpers (`lib/auth-server.ts`) |
| State | Zustand (`lib/store/`) |
| UI | shadcn/ui + Tailwind CSS + Framer Motion |
| Payments | Razorpay (create-order → verify webhook flow) |
| Realtime | SSE (`lib/sse.ts` server broadcast, `lib/events.ts` client hooks) |
| AI Chat | Anthropic (Claude) — `lib/ai/tools.ts` + `lib/ai/system-prompt.ts` |
| Images | Cloudinary (`lib/cloudinary.ts`) |
| Offline | Sync queue at `app/api/sync/batch/route.ts` |
| Messaging | WhatsApp/SMS service at `lib/messaging-service.ts` |

---

## 3. App Router Route Groups

| Route Group | Who uses it | Example pages |
|---|---|---|
| `(parent)` | PARENT / GENERAL roles | `/menu`, `/cart`, `/orders`, `/pre-orders`, `/wallet`, `/children`, `/controls`, `/settings`, `/notifications` |
| `(management)` | MANAGEMENT role | `/management/...` (accounts, device-accounts, students, parents, library, etc.) |
| `(admin)` | ADMIN role | `/admin/...` (orders, menu, discounts, statistics, analytics) |
| `(kiosk)` | DEVICE role (KIOSK type) | `/kiosk` — real-time order processing terminal |
| `(library-kiosk)` | DEVICE role (LIBRARY type) | `/library` — book issue/return terminal |
| `(gate)` | DEVICE role (GATE type) | `/gate` — RFID tap entry/exit |
| `(attendance)` | ATTENDANCE role | `/attendance` — bulk attendance uploads, reports |
| `(lib-operator)` | LIB_OPERATOR role | `/lib-operator` — operator-facing book management |
| `(operator)` | OPERATOR role | `/operator` — wallet top-ups, RFID card assignment |
| `(owner)` | OWNER role | `/owner` — organization subscriptions |
| `(platform)` | PLATFORM_OWNER / PLATFORM_SUPPORT | `/platform` — org approvals, suspensions, contracts |
| `(auth)` | Unauthenticated | `/sign-in`, `/sign-up`, `/onboarding` |

---

## 4. Auth System (`lib/auth-server.ts`)

### `getSession()`
Returns the current user session (or `null`). Reads `better-auth` session from request headers.

### `requireAccess(options: RequireAccessOptions): Promise<ResolvedAccessContext>`
Central access-control guard for every API route:
```ts
const ctx = await requireAccess({
  scope: "organization",           // "platform" | "organization"
  allowedOrgRoles: ["ADMIN", "MANAGEMENT"],
  requiredFeature: "canteen",      // optional feature flag key
  allowWhenOrgSuspended: false,    // default false
});
// ctx.actorUserId, ctx.activeOrganizationId, ctx.membershipRole, ctx.deviceLoginProfile
```

**Active org ID resolution order:** `x-organization-id` header → `x-org-id` header → `activeOrganizationId` cookie.

**Throws `AccessDeniedError`** with codes:
`UNAUTHENTICATED` | `ORG_CONTEXT_MISSING` | `INSUFFICIENT_ROLE` | `ORG_NOT_FOUND` | `ORG_SUSPENDED` | `MEMBERSHIP_NOT_FOUND` | `MEMBERSHIP_SUSPENDED` | `FEATURE_DISABLED`

### Role Hierarchy (built into `hasOrgRoleAccessWithHierarchy`)
- `OWNER` is a super-user — can access all org-scoped endpoints.
- `MANAGEMENT` can access everything *except* OWNER-only endpoints.
- All other roles must be listed explicitly in `allowedOrgRoles`.

### `ResolvedAccessContext` shape
```ts
{
  actorUserId: string;
  actorPlatformRole: "PLATFORM_OWNER" | "PLATFORM_SUPPORT" | null;
  activeOrganizationId: string | null;
  membershipRole: OrgRole | null;
  membershipStatus: string | null;
  organizationStatus: string | null;
  featureEnabled: boolean | null;
  deviceLoginProfile: {
    deviceId: string;
    deviceType: "GATE" | "KIOSK" | "LIBRARY";
    terminalPath: "/kiosk" | "/gate" | "/library";
  } | null;
  session: Session;
}
```

### OrgRole enum
`OWNER | ADMIN | MANAGEMENT | OPERATOR | LIB_OPERATOR | ATTENDANCE | PARENT | GENERAL | DEVICE`

---

## 5. Database Schema (`lib/db/schema.ts`)

### Core Platform Tables

| Table | Key columns | Notes |
|---|---|---|
| `user` | `id`, `name`, `email`, `role`, `phone` | `role` is the legacy global role; org role is in `organizationMembership` |
| `session` | `id`, `userId`, `expiresAt`, `token` | better-auth sessions |
| `organization` | `id`, `slug`, `name`, `type`, `status` | Status: `PENDING\|ACTIVE\|SUSPENDED\|CLOSED` |
| `organizationMembership` | `organizationId`, `userId`, `role`, `status` | Unique on (orgId, userId, role). Status: `INVITED\|ACTIVE\|SUSPENDED\|REMOVED` |
| `platformUserRole` | `userId`, `role`, `status` | Role: `PLATFORM_OWNER\|PLATFORM_SUPPORT` |
| `organizationApprovalRequest` | `applicantUserId`, `status` | New org signup flow |
| `organizationReactivationRequest` | `organizationId`, `requestedByUserId`, `status` | Reactivation after suspension |
| `organizationContract` | `organizationId`, `planName`, `startsAt`, `endsAt`, `status` | Status: `ACTIVE\|EXPIRED\|GRACE\|TERMINATED` |
| `organizationFeatureEntitlement` | `organizationId`, `featureKey`, `enabled` | Per-org feature flag |
| `organizationPaymentConfig` | `organizationId`, `provider`, `keyId`, `mode` | Razorpay config per org |

### Multi-tenancy Entities

| Table | Key columns | Notes |
|---|---|---|
| `canteen` | `id`, `organizationId`, `name`, `location`, `description`, `status` | Created atomically with KIOSK device account |
| `library` | `id`, `organizationId`, `name`, `location`, `description`, `status` | Created atomically with LIBRARY device account |
| `organizationDevice` | `id`, `organizationId`, `deviceType`, `deviceCode`, `authTokenHash`, `loginUserId`, `canteenId`, `libraryId`, `status` | Types: `GATE\|KIOSK\|LIBRARY`. `canteenId` XOR `libraryId` enforced by DB CHECK |
| `organizationDeviceAssignment` | `deviceId`, `userId` | Maps users to devices |

### Canteen Domain

| Table | Key columns | Notes |
|---|---|---|
| `menuItem` | `id`, `organizationId`, `canteenId`, `name`, `price`, `category`, `available`, `availableUnits`, `subscribable` | Categories: `SNACKS\|MEALS\|DRINKS\|PACKED_FOOD`. `availableUnits=null` means unlimited |
| `discount` | `menuItemId`, `type`, `value`, `mode`, `active`, `startDate`, `endDate` | Types: `PERCENTAGE\|FLAT`. Modes: `AUTO\|MANUAL` |
| `order` | `id`, `userId`, `childId`, `canteenId`, `deviceId`, `tokenCode`, `status`, `totalAmount`, `paymentMethod`, `paymentStatus`, `razorpayOrderId` | Status: `PLACED\|PREPARING\|SERVED\|CANCELLED`. Payment: `CASH\|UPI\|ONLINE\|WALLET` |
| `orderItem` | `orderId`, `menuItemId`, `quantity`, `unitPrice`, `instructions` | |
| `preOrder` | `id`, `childId`, `parentId`, `canteenId`, `mode`, `scheduledDate`, `subscriptionUntil`, `status` | Modes: `ONE_DAY\|SUBSCRIPTION`. Status: `PENDING\|FULFILLED\|EXPIRED\|CANCELLED` |
| `preOrderItem` | `preOrderId`, `menuItemId`, `quantity`, `breakName` | |

### Student / Parent Domain

| Table | Key columns | Notes |
|---|---|---|
| `child` | `id`, `organizationId`, `parentId`, `name`, `grNumber`, `className`, `rfidCardId`, `presenceStatus` | Presence: `INSIDE\|OUTSIDE`. Up to 4 children per parent |
| `wallet` | `id`, `childId`, `balance` | One wallet per child |
| `walletTransaction` | `walletId`, `type`, `amount`, `balanceAfter`, `orderId`, `razorpayPaymentId` | Types: `TOP_UP\|DEBIT\|REFUND\|LIBRARY_FINE` |
| `parentControl` | `childId`, `dailySpendLimit`, `perOrderLimit`, `blockedCategories`, `blockedItemIds`, `aiAutoOrderEnabled` | Stored as JSON strings for blocked lists |
| `parentNotification` | `childId`, `userId`, `type`, `title`, `message`, `read`, `metadata` | SSE-pushed at gate tap / order events |
| `temporaryRfidAccess` | `childId`, `temporaryRfidCardId`, `accessType`, `validFrom`, `validUntil` | Types: `STUDENT_TEMP\|GUEST_TEMP` |
| `gateLog` | `childId`, `deviceId`, `direction`, `rfidCardId`, `snapshotName`, `snapshotImage` | Directions: `ENTRY\|EXIT` |

### Library Domain

| Table | Key columns | Notes |
|---|---|---|
| `book` | `id`, `organizationId`, `libraryId`, `title`, `author`, `isbn`, `category`, `coverUrl` | |
| `bookCopy` | `bookId`, `libraryId`, `copyCode`, `status`, `condition` | Status: `AVAILABLE\|ISSUED\|LOST\|DAMAGED\|RETIRED` |
| `bookIssuance` | `bookCopyId`, `childId`, `libraryId`, `status`, `issuedAt`, `dueAt`, `returnedAt` | Status: `ISSUED\|RETURNED\|OVERDUE\|LOST\|RETURN_PENDING` |
| `libraryAppIssueRequest` | `childId`, `bookId`, `libraryId`, `status`, `expiresAt` | App-initiated pre-issue requests |
| `librarySetting` | `organizationId`, `libraryId`, `key`, `value` | Key-value settings per library (see `LIBRARY_SETTINGS_DEFAULTS`) |

### Billing / Subscription

| Table | Key columns | Notes |
|---|---|---|
| `certeSubscription` | `userId`, `plan`, `status`, `startsAt`, `endsAt` | Per-user Certe+ subscription (enables pre-orders) |
| `certeSubscriptionPenaltyUsage` | `subscriptionId`, `childId`, `penaltyUsed` | Tracks library fine overdraft against Certe+ allowance |
| `organizationOwnerSubscription` | `userId`, `organizationId`, `plan`, `status` | Owner subscription for managing organizations |

### Infrastructure

| Table | Key columns | Notes |
|---|---|---|
| `auditLog` | `organizationId`, `userId`, `userRole`, `action`, `details`, `ipAddress` | JSON details string |
| `offlineSyncAction` | `actionId`, `actionType`, `payload`, `status`, `deviceId` | Action types: `KIOSK_ORDER\|LIBRARY_ISSUE\|LIBRARY_RETURN\|GATE_TAP` |
| `messagingLog` | `organizationId`, `userId`, `channel`, `event`, `status` | SMS/WhatsApp delivery tracking |
| `appSetting` | `organizationId`, `key`, `value` | Org-level app settings key-value |
| `bulkPhotoUpload` | `organizationId`, `status`, `processedCount`, `errorCount` | Student photo batch jobs |
| `aiInsight` | `organizationId`, `type`, `title`, `description`, `confidence`, `actionable` | ML-generated insights |

---

## 6. Realtime System

### Server side (`lib/sse.ts`)
```ts
import { broadcast } from "@/lib/sse";

// After any mutation, broadcast to all connected clients:
broadcast("orders-updated");
broadcast("menu-updated");
broadcast("library-updated");
broadcast("gate-tap", { childId, direction });
broadcast("parent-notification", { userId, notification });
```
SSE endpoint: `GET /api/events` — streams `text/event-stream`.
Broadcast trigger: `POST /api/events/emit` — called client-side via `emitEvent()`.

### Client side (`lib/events.ts`)
```ts
import { useRealtimeData } from "@/lib/events";

// Refetches `fetchFn` whenever `orders-updated` fires:
const { data, loading } = useRealtimeData(fetchOrders, "orders-updated");
```
Falls back to 10-second polling if SSE fails after 3 reconnect attempts.

### AppEvent types
`"orders-updated" | "menu-updated" | "library-updated" | "gate-tap" | "parent-notification"`

---

## 7. Device Context (`lib/device-context.ts`)

```ts
// Resolve device from request headers (x-device-id or x-device-code):
const device = await resolveOrganizationDeviceFromRequest({
  request,
  organizationId,
  allowedDeviceTypes: ["KIOSK"],   // optional filter
  fallbackDeviceCode: "MAIN01",    // optional
});
// Returns: { id, deviceType, deviceCode, status } | null
```

Reads headers: `x-device-id` (preferred) or `x-device-code`.
Also exports: `getRequestIp(request)`, `getRequestUserAgent(request)`.

---

## 8. Key API Routes

### Parent / User APIs

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/orders` | GET | PARENT | List user orders (with canteen, items, menuItem) |
| `/api/orders` | POST | PARENT | Place order (wallet/online/cash) |
| `/api/orders/[id]/cancel` | POST | PARENT | Cancel PLACED order |
| `/api/orders/[id]/feedback` | POST | PARENT | Submit order feedback |
| `/api/pre-orders` | GET/POST/DELETE | PARENT | Manage pre-orders (subscription meals) |
| `/api/wallet` | GET | PARENT | Get wallet balance |
| `/api/wallet/topup` | POST | PARENT | Create Razorpay topup order |
| `/api/wallet/verify` | POST | PARENT | Verify and apply topup |
| `/api/wallet/transactions` | GET | PARENT | Transaction history |
| `/api/menu` | GET | Any | Public menu for an org/canteen |
| `/api/children` | GET/POST | PARENT | List/add children |
| `/api/children/[id]` | GET/PATCH/DELETE | PARENT | Manage single child |
| `/api/controls` | GET/PATCH | PARENT | Parent controls (limits, blocked items) |
| `/api/org/canteens` | GET | PARENT | List org canteens |
| `/api/org/libraries` | GET | PARENT | List org libraries |
| `/api/org/context` | GET | Any | Resolve org context from cookie |
| `/api/recommendations/*` | GET | PARENT | AI-powered meal recommendations |
| `/api/parent/notifications` | GET | PARENT | Notification inbox |
| `/api/certe-plus` | GET | PARENT | Certe+ subscription status |
| `/api/payments/create-order` | POST | PARENT | Razorpay order for top-up or order |
| `/api/payments/verify` | POST | Any | Verify Razorpay payment signature |
| `/api/payments/wallet-fallback` | POST | PARENT | Pay unpaid order from wallet |

### Admin APIs

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/admin/orders` | GET | ADMIN | All orders (org-scoped) |
| `/api/admin/orders/[id]/status` | PATCH | ADMIN | Update order status (`SERVING`, `SERVED`) |
| `/api/admin/orders/[id]/payment` | PATCH | ADMIN | Mark order paid |
| `/api/admin/menu` | GET/POST | ADMIN | Menu management |
| `/api/admin/menu/[id]` | PATCH/DELETE | ADMIN | Edit/delete menu item |
| `/api/admin/discounts` | GET/POST | ADMIN | Discount management |
| `/api/admin/settings` | GET/PATCH | ADMIN | Org app settings |
| `/api/admin/statistics` | GET | ADMIN | Sales stats |
| `/api/admin/analytics` | GET | ADMIN | Advanced analytics |
| `/api/admin/summary` | GET | ADMIN | Dashboard summary |
| `/api/admin/insights` | GET | ADMIN | ML insights |
| `/api/admin/pre-orders` | GET | ADMIN | Active pre-orders |
| `/api/admin/upload` | POST | ADMIN | Upload menu item image |
| `/api/admin/ai/chat` | POST | ADMIN | Admin AI assistant |

### Management APIs

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/management/accounts` | GET/POST | MANAGEMENT | Staff account management |
| `/api/management/accounts/[id]` | PATCH/DELETE | MANAGEMENT | Edit/remove staff |
| `/api/management/device-accounts` | GET/POST | MANAGEMENT | Terminal device creation (auto-creates canteen/library) |
| `/api/management/device-accounts/[id]` | PATCH/DELETE | MANAGEMENT | Edit/disable device |
| `/api/management/device-accounts/assignments` | GET/POST/DELETE | MANAGEMENT | Device-user assignments |
| `/api/management/students` | GET/POST | MANAGEMENT | Student (child) management |
| `/api/management/students/[id]` | PATCH/DELETE | MANAGEMENT | Edit/remove student |
| `/api/management/students/[id]/photo` | POST | MANAGEMENT | Upload student photo |
| `/api/management/parents` | GET/POST | MANAGEMENT | Parent account management |
| `/api/management/parents/[id]` | PATCH/DELETE | MANAGEMENT | Edit/remove parent |
| `/api/management/children` | GET | MANAGEMENT | All children in org |
| `/api/management/bulk-upload` | POST | MANAGEMENT | Bulk CSV student import |
| `/api/management/assign-card` | POST | MANAGEMENT | Assign RFID card to student |
| `/api/management/payment-config` | GET/POST | MANAGEMENT | Razorpay key configuration |
| `/api/management/library/books` | GET/POST | MANAGEMENT | Book catalog |
| `/api/management/library/books/[id]` | PATCH/DELETE | MANAGEMENT | Edit book |
| `/api/management/library/books/[id]/copies` | GET/POST | MANAGEMENT | Book copies |
| `/api/management/library/books/[id]/copies/[copyId]` | PATCH | MANAGEMENT | Edit copy status |
| `/api/management/library/bulk-upload` | POST | MANAGEMENT | Bulk book CSV import |
| `/api/management/library/settings` | GET/PATCH | MANAGEMENT | Library configuration |
| `/api/management/library/statistics` | GET | MANAGEMENT | Library stats |
| `/api/management/statistics` | GET | MANAGEMENT | Org-wide stats |
| `/api/management/summary` | GET | MANAGEMENT | Management dashboard |
| `/api/management/audit` | GET | MANAGEMENT | Audit log |
| `/api/management/send-credentials` | POST | MANAGEMENT | Send login credentials to parent/staff |
| `/api/management/messaging-logs` | GET | MANAGEMENT | Message delivery logs |
| `/api/management/attendance-dashboard` | GET | MANAGEMENT | Attendance overview |

### Terminal / Device APIs

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/kiosk/order` | POST | DEVICE (KIOSK) | Place kiosk order (offline-capable) |
| `/api/gate/tap` | POST | DEVICE (GATE) | Process RFID tap (entry/exit) |
| `/api/gate/status` | GET | DEVICE (GATE) | Current gate status |
| `/api/lib-operator/issue` | POST | LIB_OPERATOR | Issue book to student |
| `/api/lib-operator/return` | POST | LIB_OPERATOR | Return book from student |
| `/api/lib-operator/reissue` (via library) | POST | LIB_OPERATOR | Extend issuance |
| `/api/lib-operator/lookup-student` | GET | LIB_OPERATOR | Lookup student by RFID/GR number |
| `/api/lib-operator/lookup-book` | GET | LIB_OPERATOR | Lookup book copy by code |
| `/api/lib-operator/pending-returns` | GET | LIB_OPERATOR | Books pending return confirmation |
| `/api/lib-operator/reject-return` | POST | LIB_OPERATOR | Reject return (mark condition issues) |
| `/api/operator/topup` | POST | OPERATOR | Wallet top-up for student |
| `/api/operator/lookup` | GET | OPERATOR | Student lookup (RFID or GR) |
| `/api/operator/temporary-cards` | POST | OPERATOR | Issue temporary RFID card |
| `/api/operator/guest-cards` | POST | OPERATOR | Issue guest access card |

### Library Self-Service (Parent/Student)

| Route | Method | Purpose |
|---|---|---|
| `/api/library/search` | GET | Book search |
| `/api/library/discover` | GET | Discovery feed |
| `/api/library/showcase` | GET | Featured books |
| `/api/library/history` | GET | Issuance history for child |
| `/api/library/issue` | POST | Self-service book issue (LIBRARY_KIOSK) |
| `/api/library/return` | POST | Self-service return |
| `/api/library/reissue` | POST | Renew issuance |
| `/api/library/app-issue` | POST | Request issue from app (creates `libraryAppIssueRequest`) |
| `/api/library/pre-issue-response` | POST | Parent approves/declines app issue request |
| `/api/library/feedback` | POST | Submit book feedback |
| `/api/library/favourite` | POST | Toggle book favourite |
| `/api/library/student` | GET | Student library profile |
| `/api/library/ai/chat` | POST | Library AI assistant |
| `/api/library/ai/chat/stream` | POST | Streaming version |

### Platform APIs (PLATFORM_OWNER/SUPPORT)

| Route | Method | Purpose |
|---|---|---|
| `/api/platform/organizations` | GET/POST | Manage all organizations |
| `/api/platform/organizations/[id]` | PATCH | Edit org details |
| `/api/platform/organizations/[id]/suspend` | POST | Suspend org |
| `/api/platform/organizations/[id]/reactivate` | POST | Reactivate org |
| `/api/platform/approval-requests` | GET | Pending org registrations |
| `/api/platform/approval-requests/[id]/approve` | POST | Approve org |
| `/api/platform/approval-requests/[id]/reject` | POST | Reject application |
| `/api/platform/reactivation-requests` | GET | Pending reactivation requests |
| `/api/platform/org-admins` | GET | Org owner lookup |
| `/api/platform/me` | GET | Platform user profile |

### Other APIs

| Route | Method | Purpose |
|---|---|---|
| `/api/events` | GET | SSE stream (realtime events) |
| `/api/events/emit` | POST | Trigger broadcast from client |
| `/api/sync/batch` | POST | Offline sync batch (kiosk/gate) |
| `/api/ml/batch` | POST | Run ML batch jobs |
| `/api/messaging/preferences` | GET/PATCH | User messaging preferences |
| `/api/photos/upload` | POST | Single student photo upload |
| `/api/photos/bulk-upload/start` | POST | Start bulk photo job |
| `/api/photos/bulk-upload/[id]/process` | POST | Process bulk photo batch |
| `/api/photos/bulk-upload/[id]/status` | GET | Check bulk job status |
| `/api/attendance/*` | GET/POST | Attendance records, reports, summary |
| `/api/onboarding/register-organization` | POST | New org signup |
| `/api/onboarding/register-admin` | POST | Register admin for new org |
| `/api/owner/subscription` | GET | Owner subscription status |
| `/api/owner/subscription/checkout` | POST | Create Razorpay owner sub order |
| `/api/owner/subscription/verify` | POST | Verify owner sub payment |
| `/api/owner/organizations/*` | GET/PATCH | Owner's org management |
| `/api/org/active` | GET | Get all user's active orgs |
| `/api/org/memberships` | GET | User's org memberships |
| `/api/auth/[...all]` | * | better-auth catch-all |

---

## 9. In-App AI Chat (`lib/ai/tools.ts`)

The parent-facing AI chat assistant uses Claude with tool calling. Tools defined in `TOOL_DEFINITIONS`:

### Information Tools
| Tool | Purpose |
|---|---|
| `get_menu` | Menu items with prices and active discounts. Accepts optional `category` filter |
| `get_wallet_balance` | Current wallet balance |
| `get_order_history` | Recent orders for a child (default 7 days) |
| `get_recommendations` | ML-powered meal recommendations |
| `get_wallet_forecast` | Projected wallet depletion and recharge advice |
| `get_anomaly_alerts` | Unusual ordering pattern detection |
| `get_parent_controls` | Current daily/per-order limits and blocked items |
| `get_pre_orders` | Active pre-orders / scheduled meals |
| `get_child_info` | Children names, classes, wallet balance |

### Action Tools
| Tool | Purpose |
|---|---|
| `place_order` | Place a wallet-paid canteen order (requires user confirmation first) |
| `schedule_order` | Create a daily SUBSCRIPTION pre-order (min ₹60/day, min 5 school days) |
| `cancel_order` | Cancel a PLACED order (requires user confirmation) |

**Tool context** (`ToolContext`): `{ userId, orgId, childIds[] }` — injected server-side.

**Entry point:** `executeTool(toolName, toolInput, ctx)` dispatches to handlers.

---

## 10. ML / Recommendations (`lib/ml/`)

| Module | Purpose |
|---|---|
| `recommendation-engine.ts` | `getRecommendations(childId, orgId, canteenId?)` — personalized item scoring |
| `predictive-wallet.ts` | `getWalletForecast(childId, wallet)` — balance projection |
| `anomaly-detection.ts` | `runBatchAnomalyDetection(childIds, orgId)` — pattern alerts |
| `data-collector.ts` | `getParentControls(childId)`, `getWalletHistory(childId)` — data for ML |
| `admin-insights.ts` | ML insights for admin dashboard |

ML batch jobs triggered via `POST /api/ml/batch`.

---

## 11. State Management (`lib/store/`)

### Cart Store (`cart-store.ts`)
```ts
import { useCartStore } from "@/lib/store/cart-store";

const { items, addItem, removeItem, clearCart, getCanteenId, getTotalAmount } = useCartStore();
// CartItem shape: { menuItemId, name, price, quantity, canteenId, canteenName, instructions? }
```
Persisted to localStorage.

### Certe+ Store (`certe-plus-store.ts`)
```ts
import { useCertePlusStore } from "@/lib/store/certe-plus-store";
// Tracks subscription status and plan details
```

---

## 12. Zustand Persist / Hydration Pattern

Use lazy `useState` initialization for localStorage-based values to satisfy `react-hooks/set-state-in-effect`:
```ts
const [value, setValue] = useState(() => localStorage.getItem("key") ?? "default");
```

---

## 13. Razorpay Payment Flow

1. **Create:** `POST /api/payments/create-order` → returns `{ razorpayOrderId, amount, currency, keyId }`.
2. **Process:** Client opens Razorpay checkout modal.
3. **Verify:** `POST /api/payments/verify` → validates `razorpay_signature` using HMAC-SHA256.
4. **Apply:** Server updates order/wallet and marks `paymentStatus: "PAID"`.

For wallet top-ups: same flow via `/api/wallet/topup` + `/api/wallet/verify`.

---

## 14. Canteen-per-Order Enforcement

- Every `menuItem` has a `canteenId`. Cart is constrained to ONE canteen at a time.
- `getCanteenId()` in cart store returns `items[0].canteenId ?? null`.
- Adding an item from a different canteen should prompt the user to clear cart.
- On order creation, `canteenId` is resolved from menu items if not explicitly provided.

---

## 15. Device Account → Canteen/Library Auto-Creation

Creating a KIOSK device account at `POST /api/management/device-accounts` **automatically creates a new canteen** in the same DB transaction. Similarly, LIBRARY type creates a new library. The payload:

```jsonc
// KIOSK
{ "deviceType": "KIOSK", "deviceName": "Main Canteen Terminal",
  "canteenName": "Main Canteen", "canteenLocation": "Block A", "canteenDescription": "..." }

// LIBRARY  
{ "deviceType": "LIBRARY", "deviceName": "Library Terminal",
  "libraryName": "Central Library", "libraryLocation": "Ground Floor", "libraryDescription": "..." }

// GATE — no canteen/library fields
{ "deviceType": "GATE", "deviceName": "Main Gate Terminal" }
```

---

## 16. Key Constants (`lib/constants.ts`)

```ts
// Order statuses: PLACED | PREPARING | SERVED | CANCELLED
ORDER_STATUS, ORDER_STATUS_LABELS, ORDER_STATUS_COLORS

// Payment: CASH | UPI | ONLINE | WALLET
PAYMENT_METHOD, PAYMENT_STATUS

// Menu: SNACKS | MEALS | DRINKS | PACKED_FOOD
MENU_CATEGORIES, MENU_CATEGORY_LABELS, MENU_CATEGORY_COLORS

// Roles: PARENT | GENERAL | ADMIN | OPERATOR | MANAGEMENT | LIB_OPERATOR | ATTENDANCE | DEVICE
USER_ROLES, USER_ROLE_LABELS

// Pre-order statuses: PENDING | FULFILLED | EXPIRED | CANCELLED
PRE_ORDER_STATUS

// Book/library
BOOK_CATEGORIES, BOOK_COPY_STATUS, BOOK_COPY_CONDITION, ISSUANCE_STATUS

// Certe+ plans: WEEKLY(₹79) | MONTHLY(₹129) | THREE_MONTHS(₹349) | SIX_MONTHS(₹729)
CERTE_PLUS_PLANS, CERTE_PLUS.WALLET_OVERDRAFT_LIMIT (₹299), CERTE_PLUS.LIBRARY_PENALTY_ALLOWANCE (₹10)

// Owner org plans: BASIC(₹499,1 org) | PREMIUM(₹1499,3 orgs) | MEGA(₹3999,10 orgs)
OWNER_ORG_PLANS

// Library settings defaults
LIBRARY_SETTINGS_DEFAULTS  // issue_duration_days, max_reissues, max_books_per_student, fine_per_day, etc.

// App settings defaults
APP_SETTINGS_DEFAULTS  // subscription_min_order_value (60), subscription_min_days (3), etc.

// Limits
MAX_CHILDREN_PER_PARENT = 4
MAX_ACTIVE_PREORDERS_PER_CHILD = 1
GATE_TAP_COOLDOWN_MS = 3000

generateTokenCode()  // 4-char alphanumeric order token (no confusable chars)
```

---

## 17. Parent Layout (`app/(parent)/layout.tsx`)

Controls what appears in the sticky header for parent/general users.

```ts
// Pages with their own inline canteen/library selector — no header selector
const pageHasInlineContextSelector =
  pathname === "/menu" || pathname === "/library-history" || pathname === "/library-showcase";

// Show header context selector only on order-related pages
const showHeaderContextSelector =
  !pageHasInlineContextSelector &&
  (pathname.startsWith("/orders") || pathname.startsWith("/pre-orders") || pathname === "/cart");
```

`/cart` shows a **static read-only canteen badge** (not a selector) driven by `cartItems[0]?.canteenName`.

`parentMode` is `"canteen"` or `"library"` derived from the user's current org context (library mode when viewing library pages).

---

## 18. Key Utility Functions

| Location | Function | Purpose |
|---|---|---|
| `lib/audit.ts` | `logAudit(orgId, userId, role, action, details)` | Write audit log entry |
| `lib/cloudinary.ts` | `uploadToCloudinary(file, folder)` | Upload image, returns URL |
| `lib/image-url.ts` | `getImageUrl(path)` | Resolve Cloudinary URL |
| `lib/privacy.ts` | `maskEmail(email)`, `maskPhone(phone)` | Obfuscate sensitive data for logs |
| `lib/razorpay.ts` | `createRazorpayOrder(amount, receipt)`, `verifySignature(orderId, paymentId, signature)` | Razorpay helpers |
| `lib/units.ts` | `validateUnits(item)`, `decrementUnits(itemId)` | Menu item stock management |
| `lib/break-slots.ts` | `DEFAULT_BREAK_SLOTS`, `getBreakSlots(appSettings)` | School break time slots |
| `lib/statistics.ts` | `getOrgStatistics(orgId, dateRange)` | Revenue/order statistics |
| `lib/library-statistics.ts` | `getLibraryStatistics(orgId, libraryId)` | Issuance/fine statistics |
| `lib/messaging-service.ts` | `sendCredentials(userId, credentials)`, `sendNotification(...)` | WhatsApp/SMS dispatch |
| `lib/parent-notifications.ts` | `notifyParentForChild(childId, type, title, msg)` | Push parent notification (SSE + DB) |
| `lib/use-persisted-selection.ts` | `usePersistedSelection(key, options)` | Persist dropdown selection to localStorage |
| `lib/db-errors.ts` | `isDuplicateKeyError(err)`, `isForeignKeyError(err)` | Drizzle error classification |

---

## 19. Offline Sync

The kiosk, gate, and library terminals queue actions when offline:
- Queue entry: `offlineSyncAction` table.
- Flush: `POST /api/sync/batch` processes queued actions and marks `status: "APPLIED"`.
- Client-side: `components/sync-manager.tsx` handles queue and retry.

---

## 20. Key Patterns to Follow

1. **Every API route calls `requireAccess()` first** — never read session manually.
2. **`broadcast()` after mutations** — call after any order/menu/library/gate mutation to push SSE.
3. **Drizzle transactions for multi-table mutations** — `await db.transaction(async (tx) => { ... })`.
4. **Response shape** — return plain objects; avoid exposing `passwordHash` or `authTokenHash`.
5. **Org isolation** — always include `eq(table.organizationId, ctx.activeOrganizationId)` in DB queries.
6. **Feature flags** — pass `requiredFeature` to `requireAccess()` for gated features.
7. **Audit logging** — use `logAudit()` for privileged mutations (account creation, suspension, etc.).
8. **Device headers** — terminal API routes read `x-device-id` / `x-device-code` for device context.
