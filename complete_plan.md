# Venus Café — RFID Wallet System: Complete Implementation Plan

> **Goal:** Add RFID-based student ordering, wallet system, operator cash top-ups, parent controls, multi-child support, and management card assignment — all on top of the existing pre-order system.

---

## Architecture Overview

### Roles (4 total, separate logins)

| Role           | Who                         | What they do                                                                                                                                  |
| -------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **PARENT**     | Parents/guardians           | Browse menu, add money to wallet (Razorpay), view child spending, set controls (block food, spend limits), pre-order meals, see order history |
| **ADMIN**      | School café admin           | Manage menu items, manage all orders, update statuses, view statistics, manage payments                                                       |
| **OPERATOR**   | Peon/Maushi (canteen staff) | Single-purpose tablet UI: enter cash amount → child taps RFID → money added to wallet. Nothing else.                                          |
| **MANAGEMENT** | School office staff         | Assign/reassign/remove RFID cards to students, view card registry. Simple UI.                                                                 |

### RFID Input Method

The RFID reader acts as a **USB HID keyboard** — it sends the card UID as keystrokes followed by Enter. The kiosk and operator pages will use a **hidden auto-focused `<input>`** that captures the scan. On Enter, the value is read and processed. No special driver or API needed.

### Multi-Child Support

A parent account can have **multiple children**, each with their own RFID card and wallet. The existing `childName` + `childGrNumber` flat fields on the `user` table will be replaced by a separate `child` table.

---

## Phase 5 — Database: New Tables & Schema Changes

**Files to modify:** `lib/db/schema.ts`, `lib/constants.ts`

### 5.1 — Expand role enum on `user` table

```
Current:  text("role", { enum: ["PARENT", "ADMIN"] })
New:      text("role", { enum: ["PARENT", "ADMIN", "OPERATOR", "MANAGEMENT"] })
```

### 5.2 — New `child` table

| Column         | Type               | Notes                                                     |
| -------------- | ------------------ | --------------------------------------------------------- |
| `id`           | text PK            | UUID auto-generated                                       |
| `parent_id`    | text FK → user.id  | CASCADE delete                                            |
| `name`         | text NOT NULL      | Child's full name                                         |
| `gr_number`    | text UNIQUE        | School GR/admission number                                |
| `class_name`   | text               | e.g. "5th", "8th"                                         |
| `section`      | text               | e.g. "A", "B"                                             |
| `rfid_card_id` | text UNIQUE        | RFID UID from the card, nullable (assigned by MANAGEMENT) |
| `image`        | text               | Optional child photo                                      |
| `created_at`   | timestamp NOT NULL |                                                           |
| `updated_at`   | timestamp NOT NULL |                                                           |

- Replaces flat `childName`, `childGrNumber` on `user` table (those fields stay for backward compat but become unused)
- A parent can have **multiple children**
- `rfid_card_id` is nullable until MANAGEMENT assigns a card

### 5.3 — New `wallet` table

| Column       | Type                      | Notes                           |
| ------------ | ------------------------- | ------------------------------- |
| `id`         | text PK                   | UUID                            |
| `child_id`   | text FK → child.id UNIQUE | One wallet per child            |
| `balance`    | doublePrecision NOT NULL  | Current balance in ₹, default 0 |
| `created_at` | timestamp NOT NULL        |                                 |
| `updated_at` | timestamp NOT NULL        |                                 |

### 5.4 — New `wallet_transaction` table (audit log)

| Column                | Type                     | Notes                                         |
| --------------------- | ------------------------ | --------------------------------------------- |
| `id`                  | text PK                  | UUID                                          |
| `wallet_id`           | text FK → wallet.id      |                                               |
| `type`                | text enum                | `TOP_UP`, `DEBIT`, `REFUND`                   |
| `amount`              | doublePrecision NOT NULL | Always positive                               |
| `balance_after`       | doublePrecision NOT NULL | Snapshot of wallet balance after this txn     |
| `description`         | text                     | e.g. "Cash top-up by operator", "Order #A7X2" |
| `order_id`            | text FK → order.id       | Nullable — set for DEBIT/REFUND               |
| `operator_id`         | text FK → user.id        | Nullable — set for operator cash top-ups      |
| `razorpay_payment_id` | text                     | Nullable — set for Razorpay wallet top-ups    |
| `created_at`          | timestamp NOT NULL       |                                               |

### 5.5 — New `parent_control` table

| Column               | Type                      | Notes                                      |
| -------------------- | ------------------------- | ------------------------------------------ |
| `id`                 | text PK                   | UUID                                       |
| `child_id`           | text FK → child.id UNIQUE | One control set per child                  |
| `daily_spend_limit`  | doublePrecision           | Nullable — ₹ max per day, null = unlimited |
| `per_order_limit`    | doublePrecision           | Nullable — ₹ max per single order          |
| `blocked_categories` | text                      | JSON array e.g. `["PACKED_FOOD","DRINKS"]` |
| `blocked_item_ids`   | text                      | JSON array of menu item IDs                |
| `created_at`         | timestamp NOT NULL        |                                            |
| `updated_at`         | timestamp NOT NULL        |                                            |

### 5.6 — New `pre_order` and `pre_order_item` tables

**`pre_order`:**

| Column           | Type               | Notes                                                   |
| ---------------- | ------------------ | ------------------------------------------------------- |
| `id`             | text PK            | UUID                                                    |
| `child_id`       | text FK → child.id |                                                         |
| `parent_id`      | text FK → user.id  | The parent who placed it                                |
| `scheduled_date` | text NOT NULL      | ISO date `YYYY-MM-DD` for when the child should collect |
| `status`         | text enum          | `PENDING`, `FULFILLED`, `EXPIRED`, `CANCELLED`          |
| `created_at`     | timestamp NOT NULL |                                                         |

**`pre_order_item`:**

| Column         | Type                           | Notes     |
| -------------- | ------------------------------ | --------- |
| `id`           | text PK                        | UUID      |
| `pre_order_id` | text FK → pre_order.id CASCADE |           |
| `menu_item_id` | text FK → menu_item.id         |           |
| `quantity`     | integer NOT NULL               | default 1 |
| `created_at`   | timestamp NOT NULL             |           |

### 5.7 — Modify existing `order` table

Add these columns:

| New Column   | Type               | Notes                                                                     |
| ------------ | ------------------ | ------------------------------------------------------------------------- |
| `child_id`   | text FK → child.id | Nullable — set for RFID kiosk orders                                      |
| `token_code` | text               | Short 4-char alphanumeric code, e.g. `A7X2`. Generated on order creation. |

Expand `paymentMethod` enum: `["CASH", "UPI", "ONLINE", "WALLET"]`

### 5.8 — Add `PACKED_FOOD` category

Expand `menuItem.category` enum: `["SNACKS", "MEALS", "DRINKS", "PACKED_FOOD"]`

### 5.9 — Update `lib/constants.ts`

- Add `PACKED_FOOD` to `MENU_CATEGORIES`, labels, colors
- Add `WALLET` to `PAYMENT_METHOD`
- Add `OPERATOR` and `MANAGEMENT` to `USER_ROLES`
- Add `WALLET_TRANSACTION_TYPE` constant: `TOP_UP`, `DEBIT`, `REFUND`
- Add `PRE_ORDER_STATUS` constant: `PENDING`, `FULFILLED`, `EXPIRED`, `CANCELLED`

### 5.10 — Update relations in schema

- `user` → many `child`
- `child` → one `user` (parent), one `wallet`, one `parentControl`, many `order`, many `preOrder`
- `wallet` → one `child`, many `walletTransaction`
- `walletTransaction` → one `wallet`, one? `order`, one? `user` (operator)
- `order` → one? `child`
- `preOrder` → one `child`, one `user` (parent), many `preOrderItem`
- `preOrderItem` → one `preOrder`, one `menuItem`

---

## Phase 6 — Auth & Middleware Updates

**Files to modify:** `lib/auth.ts`, `middleware.ts`, `app/(admin)/layout.tsx`

### 6.1 — Update Better Auth config

- Add `OPERATOR` and `MANAGEMENT` to the role type
- No new additional fields needed on `user` (RFID is on `child` table, not `user`)

### 6.2 — Update middleware route matching

```
Current matcher: ["/admin/:path*", "/api/admin/:path*"]
New matcher:     ["/admin/:path*", "/api/admin/:path*",
                  "/operator/:path*", "/api/operator/:path*",
                  "/management/:path*", "/api/management/:path*"]
```

Middleware still only checks cookie existence (lightweight). Role validation is done in each route group's `layout.tsx`.

### 6.3 — New layouts with role guards

- `app/(operator)/layout.tsx` — requires `OPERATOR` role, minimal layout (no navbar, just logo + sign-out button)
- `app/(management)/layout.tsx` — requires `MANAGEMENT` role, simple layout with logo + nav + sign-out
- Existing `app/(admin)/layout.tsx` — already checks `ADMIN`

### 6.4 — Update login redirect logic

In `app/(auth)/login/page.tsx`, after successful sign-in:

```
ADMIN     → /admin/orders
OPERATOR  → /operator/topup
MANAGEMENT → /management/cards
PARENT    → /menu
```

### 6.5 — Update navbar

The `components/navbar.tsx` should:

- Show **no navbar** for OPERATOR (their layout has its own minimal header)
- Show **minimal navbar** for MANAGEMENT (logo + "Cards" link + sign-out)
- Show **existing admin navbar** for ADMIN
- Show **parent navbar** for PARENT with new links: "Wallet", "Controls"
- Add wallet balance badge next to the parent's avatar/name

---

## Phase 7 — Operator Interface (Tablet UI)

**New files:** `app/(operator)/`, `app/api/operator/`

### 7.1 — Operator layout

`app/(operator)/layout.tsx`

- Full-screen, no main navbar
- Shows: Venus logo + "Operator" label + sign-out button
- Server-side role guard: must be `OPERATOR`, else redirect
- Large touch-friendly design for tablet

### 7.2 — Operator top-up page

`app/(operator)/topup/page.tsx` — **Single-screen flow:**

```
┌─────────────────────────────────┐
│  🏫 Venus Café — Cash Top-Up   │
│                                 │
│  Enter Amount (₹)               │
│  ┌─────────────────────┐       │
│  │        ₹ 100        │       │
│  └─────────────────────┘       │
│                                 │
│  Quick amounts:                 │
│  [₹50] [₹100] [₹200] [₹500]  │
│                                 │
│  ────────────────────────       │
│                                 │
│  📱 TAP RFID CARD NOW          │
│  (hidden input auto-focused)    │
│                                 │
│  ════════════════════════       │
│  ✅ SUCCESS                     │
│  Student: Aarav Sharma          │
│  GR: 2024-0042                  │
│  Added: ₹100                   │
│  New Balance: ₹350             │
│                                 │
│  [Add Another]                  │
└─────────────────────────────────┘
```

- State machine: `ENTER_AMOUNT` → `WAITING_FOR_CARD` → `PROCESSING` → `SUCCESS` / `ERROR`
- Hidden `<input>` with `autoFocus`, `onKeyDown` listens for Enter
- On Enter: POST to `/api/operator/topup` with `{ rfidCardId, amount }`
- Auto-resets to `ENTER_AMOUNT` after 5 seconds on success

### 7.3 — Operator API

`app/api/operator/topup/route.ts` — POST:

1. Validate session, require `OPERATOR` role
2. Validate `rfidCardId` exists and is assigned to a child
3. Validate `amount` > 0
4. In a transaction:
   a. Increment `wallet.balance` by `amount`
   b. Create `walletTransaction` (type: `TOP_UP`, operator_id: session.user.id)
5. Return `{ child: { name, grNumber }, wallet: { balance } }`

---

## Phase 8 — Student Kiosk Interface (Tablet UI)

**New files:** `app/(kiosk)/`, `app/api/kiosk/`

### 8.1 — Kiosk layout

`app/(kiosk)/layout.tsx`

- **No auth required** — kiosk is a shared public tablet
- Full-screen, no navbar at all
- Venus branding header only
- Touch-optimized, large fonts & buttons

### 8.2 — Kiosk ordering page

`app/(kiosk)/kiosk/page.tsx` — **Three-phase flow:**

**Phase A — Browse & Add to Cart:**

```
┌─────────────────────────────────┐
│  🏫 Venus Café                  │
│                                 │
│  [SNACKS] [MEALS] [DRINKS]     │
│  [PACKED FOOD]                  │
│                                 │
│  ┌──────┐ ┌──────┐ ┌──────┐   │
│  │Samosa│ │VadaPav│ │Sandwi│   │
│  │ ₹15  │ │  ₹20 │ │  ₹30 │   │
│  │ [+]  │ │ [+]  │ │ [+]  │   │
│  └──────┘ └──────┘ └──────┘   │
│  ... more items grid ...        │
│                                 │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  Cart: 3 items — ₹65           │
│  [View Cart & Checkout →]       │
└─────────────────────────────────┘
```

- Local state (useState), NOT Zustand/localStorage — kiosk resets between students
- Large grid of tap-friendly cards
- Category filter tabs
- Floating bottom bar shows cart summary

**Phase B — Cart Review & RFID Tap:**

```
┌─────────────────────────────────┐
│  Your Order                     │
│                                 │
│  Samosa × 2          ₹30       │
│  Cold Coffee × 1     ₹30       │
│  Lays Classic × 1    ₹20       │
│  ──────────────────────         │
│  Total: ₹80                    │
│                                 │
│  ┌─────────────────────────┐   │
│  │   📱 TAP YOUR RFID CARD  │   │
│  │    to pay from wallet    │   │
│  └─────────────────────────┘   │
│                                 │
│  [← Back to Menu]              │
└─────────────────────────────────┘
```

- Hidden auto-focused input for RFID scan
- On Enter: POST to `/api/kiosk/order`

**Phase C — Result:**

```
SUCCESS:                           FAILURE:
┌──────────────────────┐          ┌──────────────────────┐
│  ✅ ORDER PLACED!     │          │  ❌ ORDER FAILED      │
│                       │          │                       │
│  Token: A7X2          │          │  Insufficient balance │
│                       │          │  Balance: ₹30         │
│  Samosa × 2    ₹30   │          │  Required: ₹80        │
│  Cold Coffee   ₹30   │          │                       │
│  Lays Classic  ₹20   │          │  OR                   │
│  ─────────────────    │          │  "Packed Food" blocked│
│  Total: ₹80          │          │  by parent            │
│  Balance: ₹270       │          │                       │
│                       │          │  [← Try Again]        │
│  Give token code      │          └──────────────────────┘
│  to the server.       │
│                       │
│  Auto-reset in 10s... │
└──────────────────────┘
```

- Auto-resets to Phase A after 10 seconds

### 8.3 — Kiosk API

`app/api/kiosk/order/route.ts` — POST (no auth session required, RFID is the auth):

1. Receive `{ rfidCardId, items: [{ menuItemId, quantity }] }`
2. Look up `child` by `rfidCardId` → get `wallet`, `parentControl`
3. **Validation chain:**
   a. RFID card exists & is assigned → else "Unknown card"
   b. All menu items exist & are available → else "Item unavailable"
   c. No items in `parentControl.blocked_categories` → else "Category blocked by parent"
   d. No items in `parentControl.blocked_item_ids` → else "Item blocked by parent"
   e. Order total ≤ `parentControl.per_order_limit` (if set) → else "Exceeds per-order limit (₹X)"
   f. Today's total spending + order total ≤ `parentControl.daily_spend_limit` (if set) → else "Daily limit reached (₹X/₹Y)"
   g. `wallet.balance` ≥ order total → else "Insufficient balance (₹X available)"
4. **Check for pending pre-orders** for this child on today's date:
   - If a pre-order exists for today with status `PENDING`, auto-use those items (ignore cart items from kiosk, OR merge — TBD, simplest: pre-order overrides)
5. In a transaction:
   a. Generate `tokenCode` — 4-char alphanumeric (uppercase letters + digits, avoiding confusables like 0/O, 1/I/L)
   b. Create `order` with `childId`, `paymentMethod: "WALLET"`, `paymentStatus: "PAID"`, `tokenCode`
   c. Create `orderItem` entries
   d. Deduct `wallet.balance`
   e. Create `walletTransaction` (type: `DEBIT`, orderId)
   f. If from pre-order, update `preOrder.status` → `FULFILLED`
6. Emit SSE `orders-updated` event
7. Return `{ success: true, tokenCode, items, total, balanceAfter }` or `{ success: false, reason }`

---

## Phase 9 — Parent Wallet & Controls

**New files:** `app/(parent)/wallet/`, `app/(parent)/controls/`, `app/(parent)/preorder/`, `app/api/wallet/`, `app/api/parent/`

### 9.1 — Child management

Before wallet/controls work, parents need to add their children:

`app/(parent)/children/page.tsx`:

- List all children linked to this parent
- "Add Child" form: name, GR number, class, section
- Edit/remove child
- Shows RFID status: "Card assigned ✓" or "No card — contact school office"
- Shows wallet balance for each child

`app/api/children/route.ts`:

- GET: List parent's children with wallet balances
- POST: Add a new child (creates `child` + `wallet` + `parentControl` rows)

`app/api/children/[id]/route.ts`:

- PATCH: Update child details
- DELETE: Remove child (cascade deletes wallet, controls, etc.)

### 9.2 — Wallet page

`app/(parent)/wallet/page.tsx`:

- **Child selector** at top (if parent has multiple children, dropdown/tabs to switch)
- Big balance display: `₹ 350`
- "Add Money" button → Razorpay flow (same integration pattern as existing order payment)
- Transaction history list: date, type (TOP_UP ↑ / DEBIT ↓ / REFUND ↺), amount, description, balance after
- Filter by date range

`app/api/wallet/topup/route.ts` — POST:

1. Validate session (PARENT)
2. Validate `childId` belongs to this parent
3. Create Razorpay order for the top-up amount
4. On verification (reuse `/api/payments/verify` pattern):
   - Increment wallet balance
   - Create `walletTransaction` (type: `TOP_UP`, razorpayPaymentId)

`app/api/wallet/balance/route.ts` — GET:

- Return balance + recent transactions for a given `childId` (must belong to session user)

### 9.3 — Parent controls page

`app/(parent)/controls/page.tsx`:

- **Child selector** at top
- **Daily spending limit** — number input with stepper, e.g. ₹200/day. "Unlimited" toggle.
- **Per-order limit** — number input, e.g. ₹100/order. "Unlimited" toggle.
- **Blocked categories** — checkboxes: ☐ Snacks ☐ Meals ☐ Drinks ☑ Packed Food
- **Blocked items** — searchable list of all menu items with toggle switches
- Save button → PUT to API

`app/api/parent/controls/route.ts`:

- GET: Return current controls for a `childId`
- PUT: Update controls for a `childId` (must belong to session user)

### 9.4 — Pre-order page

`app/(parent)/preorder/page.tsx`:

- **Child selector** at top
- **Date picker** — select date (tomorrow or later)
- **Menu browser** — same grid as regular menu, but filtered by parent controls (blocked items greyed out)
- Add items → shows summary with total
- "Place Pre-Order" → POST to API
- List of upcoming pre-orders with status, option to cancel

`app/api/parent/preorder/route.ts`:

- GET: List pre-orders for a `childId`
- POST: Create pre-order (validate items, date must be future, check controls)

`app/api/parent/preorder/[id]/route.ts`:

- DELETE/PATCH: Cancel pre-order (only if status is `PENDING`)

### 9.5 — Parent orders enhancement

Update `app/(parent)/orders/page.tsx`:

- Show **child name** on each order (for RFID/kiosk orders)
- Show **token code** on each order
- Show **spending stats** section: today's spend, this week, this month
- Show **category breakdown** pie/bar chart
- Show **most-ordered items** list

### 9.6 — Navbar updates

Update `components/navbar.tsx`:

- Add to parent links: `{ href: "/children", label: "Children", icon: Users }`
- Add to parent links: `{ href: "/wallet", label: "Wallet", icon: Wallet }`
- Add to parent links: `{ href: "/controls", label: "Controls", icon: Shield }`
- Add to parent links: `{ href: "/preorder", label: "Pre-Order", icon: CalendarPlus }`
- Show wallet balance badge on the Wallet link

---

## Phase 10 — Management Interface (RFID Card Assignment)

**New files:** `app/(management)/`, `app/api/management/`

### 10.1 — Management layout

`app/(management)/layout.tsx`:

- Server-side role guard: must be `MANAGEMENT`
- Simple layout: Venus logo, "Card Management" title, sign-out button
- Clean, minimal — designed for office use

### 10.2 — Card management page

`app/(management)/cards/page.tsx`:

```
┌─────────────────────────────────────────────┐
│  🏫 Venus Café — RFID Card Management       │
│                                              │
│  🔍 Search student by name or GR number      │
│  ┌──────────────────────────────────┐       │
│  │ Search...                        │       │
│  └──────────────────────────────────┘       │
│                                              │
│  ┌───────────────────────────────────────┐  │
│  │ Name          │ GR#      │ RFID Card  │  │
│  │───────────────│──────────│────────────│  │
│  │ Aarav Sharma  │ 2024-042 │ ✅ AB12CD   │  │
│  │               │          │ [Remove]   │  │
│  │───────────────│──────────│────────────│  │
│  │ Priya Patel   │ 2024-103 │ ❌ No card  │  │
│  │               │          │ [Assign]   │  │
│  │───────────────│──────────│────────────│  │
│  │ Rohan Gupta   │ 2024-205 │ ✅ EF56GH   │  │
│  │               │          │ [Reassign] │  │
│  └───────────────────────────────────────┘  │
│                                              │
│  ── Assign Card ──                           │
│  Selected: Priya Patel (2024-103)            │
│  📱 TAP NEW RFID CARD...                     │
│  (hidden input, auto-focused)                │
│                                              │
│  ✅ Card XY78ZW assigned to Priya Patel      │
└─────────────────────────────────────────────┘
```

- Searchable list of all children (across all parents)
- Each row shows: child name, GR number, parent name, class/section, RFID status
- Actions: **Assign** (if no card), **Reassign** (if has card), **Remove** (clear card)
- Assign/Reassign flow: click button → hidden input focuses → tap card → captures RFID UID → POST to API
- Confirmation toast on success

### 10.3 — Management API

`app/api/management/cards/route.ts`:

- GET: List all children with RFID assignment status, searchable by name/GR

`app/api/management/cards/assign/route.ts`:

- POST `{ childId, rfidCardId }`:
  1. Validate session (MANAGEMENT role)
  2. Check `rfidCardId` not already assigned to another child
  3. Update `child.rfid_card_id`
  4. Return updated child

`app/api/management/cards/remove/route.ts`:

- POST `{ childId }`:
  1. Validate session (MANAGEMENT role)
  2. Set `child.rfid_card_id = null`
  3. Return success

---

## Phase 11 — Seed Data & Menu Updates

**Files to modify:** `lib/db/seed.ts`

### 11.1 — Add PACKED_FOOD menu items

```
Lays Classic Salted     — ₹20  — PACKED_FOOD
Kurkure Masala Munch    — ₹20  — PACKED_FOOD
Uncle Chips             — ₹20  — PACKED_FOOD
Coca-Cola (200ml)       — ₹25  — PACKED_FOOD
Frooti Mango (200ml)    — ₹15  — PACKED_FOOD
Chocolate Muffin        — ₹30  — PACKED_FOOD
Brownie                 — ₹35  — PACKED_FOOD
Cream Roll              — ₹25  — PACKED_FOOD
```

### 11.2 — Seed test accounts

```
Operator:    operator@schoolcafe.com / Operator@123  → role: OPERATOR
Management:  management@schoolcafe.com / Manage@123  → role: MANAGEMENT
```

### 11.3 — Seed test children & wallets

Create 2 test children under the existing test parent (if any), each with a wallet (₹500 starting balance) and default parent controls.

---

## Phase 12 — Polish & Integration

### 12.1 — Admin enhancements

- Admin orders page: show `tokenCode` and `childName` columns for kiosk orders
- Admin statistics: add wallet transaction stats (total top-ups, total debits, average wallet balance)
- Admin should be able to see all children, wallets, and controls (read-only view)

### 12.2 — SSE events

Add new event types:

- `wallet-updated` — emitted on top-up or debit, parents' wallet page auto-refreshes
- `preorder-fulfilled` — emitted when kiosk fulfills a pre-order

### 12.3 — Token code generation

Utility function `generateTokenCode()`:

- 4 characters from charset: `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (excludes 0/O, 1/I/L for readability)
- Check uniqueness against today's orders (extremely unlikely collision with 30^4 = 810,000 combinations)

### 12.4 — Daily cleanup

- Pre-orders with `scheduled_date` < today and status `PENDING` → auto-expire to `EXPIRED`
- Can be triggered by a cron job or checked lazily on kiosk order creation

---

## Implementation Order (Recommended)

| Step | Phase   | Effort | Description                                         |
| ---- | ------- | ------ | --------------------------------------------------- |
| 1    | 5       | Medium | Database schema changes + push + constants update   |
| 2    | 6       | Small  | Auth config + middleware + login redirect + layouts |
| 3    | 11      | Small  | Seed packed food items + test accounts              |
| 4    | 7       | Medium | Operator top-up UI + API                            |
| 5    | 10      | Medium | Management card assignment UI + API                 |
| 6    | 9.1     | Medium | Parent child management (add/edit children)         |
| 7    | 9.2     | Medium | Parent wallet (balance, Razorpay top-up, history)   |
| 8    | 9.3     | Medium | Parent controls (spend limits, food blocking)       |
| 9    | 8       | Large  | Student kiosk ordering UI + API (the big one)       |
| 10   | 9.4     | Medium | Parent pre-ordering                                 |
| 11   | 9.5-9.6 | Small  | Parent orders enhancement + navbar updates          |
| 12   | 12      | Medium | Admin enhancements, SSE events, token codes, polish |

---

## File Summary — What's New vs Modified

### New Files (~30 files)

```
app/(operator)/layout.tsx
app/(operator)/topup/page.tsx
app/(management)/layout.tsx
app/(management)/cards/page.tsx
app/(kiosk)/layout.tsx
app/(kiosk)/kiosk/page.tsx
app/(parent)/children/page.tsx
app/(parent)/wallet/page.tsx
app/(parent)/controls/page.tsx
app/(parent)/preorder/page.tsx
app/api/operator/topup/route.ts
app/api/management/cards/route.ts
app/api/management/cards/assign/route.ts
app/api/management/cards/remove/route.ts
app/api/kiosk/order/route.ts
app/api/wallet/topup/route.ts
app/api/wallet/balance/route.ts
app/api/children/route.ts
app/api/children/[id]/route.ts
app/api/parent/controls/route.ts
app/api/parent/preorder/route.ts
app/api/parent/preorder/[id]/route.ts
app/api/rfid/lookup/route.ts
```

### Modified Files (~10 files)

```
lib/db/schema.ts          — New tables, expanded enums
lib/constants.ts          — New categories, roles, payment methods
lib/auth.ts               — New roles in additionalFields
lib/db/seed.ts            — Packed food, operator, management users
middleware.ts             — Expanded route matching
app/(auth)/login/page.tsx — Role-based redirect
components/navbar.tsx     — New parent links, wallet badge
app/(parent)/orders/page.tsx — Token code, child name, spending stats
app/api/orders/route.ts   — Support WALLET payment, child_id, token_code
app/layout.tsx            — Possibly conditionally render navbar
```
