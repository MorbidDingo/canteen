# Plan: Library Management System (Extension of Cafe Venus)

## TL;DR

Add a full Library Management module to the existing school canteen app. Students use a public terminal (RFID tap → view/issue/return/reissue books). A dedicated Library Operator manages issuance/returns via barcode scanning. Management users configure rules, bulk-upload book catalogs, and view analytics. Parents see their children's borrowing history. Overdue fines auto-deduct from the child's existing wallet. The approach reuses the existing auth, RFID, child/parent model, wallet, SSE, bulk-upload, and analytics infrastructure.

---

## Decisions (from alignment)

- **Roles**: New `LIB_OPERATOR` role (separate from canteen `OPERATOR`)
- **Return policy**: Configurable — management toggles between self-return and operator-confirmed return
- **Fines**: Overdue fine system integrated with existing wallet (auto-deduction)
- **Book scanning**: Support BOTH ISBN and unique accession number per physical copy

---

## Phase 1 — Database: New Tables & Schema Changes

**Files**: `lib/db/schema.ts`, `lib/constants.ts`, new migration

### 1.1 — Expand `user.role` enum

```
Current:  ["PARENT", "ADMIN", "OPERATOR", "MANAGEMENT"]
New:      ["PARENT", "ADMIN", "OPERATOR", "MANAGEMENT", "LIB_OPERATOR"]
```

### 1.2 — New `book` table (master book record)

| Column           | Type                  | Notes                                         |
|------------------|-----------------------|-----------------------------------------------|
| `id`             | text PK (UUID)        |                                               |
| `isbn`           | text                  | Nullable; ISBN-10 or ISBN-13; indexed          |
| `title`          | text NOT NULL         | Indexed for search                            |
| `author`         | text NOT NULL         | Indexed for search                            |
| `publisher`      | text                  | Nullable                                      |
| `edition`        | text                  | Nullable, e.g. "3rd Edition"                  |
| `category`       | text enum             | FICTION, NON_FICTION, TEXTBOOK, REFERENCE, PERIODICAL, GENERAL |
| `description`    | text                  | Nullable                                      |
| `cover_image_url`| text                  | Nullable                                      |
| `total_copies`   | integer DEFAULT 0     | Cached count, updated on copy add/remove      |
| `available_copies`| integer DEFAULT 0    | Cached count, updated on issue/return         |
| `created_at`     | timestamp NOT NULL    |                                               |
| `updated_at`     | timestamp NOT NULL    |                                               |

### 1.3 — New `book_copy` table (individual physical copies)

| Column             | Type                  | Notes                                          |
|--------------------|-----------------------|------------------------------------------------|
| `id`               | text PK (UUID)        |                                                |
| `book_id`          | text FK → book.id     | CASCADE delete                                 |
| `accession_number` | text UNIQUE NOT NULL  | School-assigned barcode ID for this copy       |
| `condition`        | text enum             | NEW, GOOD, FAIR, POOR, DAMAGED                 |
| `status`           | text enum             | AVAILABLE, ISSUED, LOST, DAMAGED, RETIRED      |
| `location`         | text                  | Nullable; shelf location e.g. "A-3-12"         |
| `created_at`       | timestamp NOT NULL    |                                                |
| `updated_at`       | timestamp NOT NULL    |                                                |

- `accession_number` is the barcode physically on the book
- When scanning, system tries accession number first, then falls back to ISBN lookup (shows copy picker if multiple copies exist)

### 1.4 — New `book_issuance` table (issue/return ledger)

| Column               | Type                       | Notes                                              |
|----------------------|----------------------------|----------------------------------------------------|
| `id`                 | text PK (UUID)             |                                                    |
| `book_copy_id`       | text FK → book_copy.id     |                                                    |
| `child_id`           | text FK → child.id         | CASCADE delete                                     |
| `issued_at`          | timestamp NOT NULL         |                                                    |
| `due_date`           | timestamp NOT NULL         | Computed: issued_at + issue_duration_days           |
| `returned_at`        | timestamp                  | Null while issued                                  |
| `status`             | text enum                  | ISSUED, RETURNED, OVERDUE, LOST, RETURN_PENDING    |
| `reissue_count`      | integer DEFAULT 0          | Max configurable (default 3)                       |
| `issued_by`          | text                       | "SELF_SERVICE" or operator user ID                 |
| `return_confirmed_by`| text FK → user.id          | Nullable; operator who confirmed return            |
| `fine_amount`        | doublePrecision DEFAULT 0  | Calculated at return: overdue_days × fine_per_day  |
| `fine_deducted`      | boolean DEFAULT false      | Whether fine was deducted from wallet              |
| `notes`              | text                       | Nullable                                          |
| `created_at`         | timestamp NOT NULL         |                                                    |
| `updated_at`         | timestamp NOT NULL         |                                                    |

- `RETURN_PENDING` is used when operator confirmation is required
- `OVERDUE` is a computed status: `status = ISSUED AND due_date < now()` (handled in queries, or updated via cron/on-access)

### 1.5 — New `library_setting` table (key-value config)

| Column       | Type               | Notes                     |
|--------------|--------------------|---------------------------|
| `id`         | text PK (UUID)     |                           |
| `key`        | text UNIQUE NOT NULL |                          |
| `value`      | text NOT NULL      |                           |
| `updated_at` | timestamp NOT NULL |                           |
| `updated_by` | text FK → user.id  | Nullable                  |

**Default settings to seed:**

| Key                                   | Default | Description                                          |
|---------------------------------------|---------|------------------------------------------------------|
| `issue_duration_days`                 | `7`     | Days per issue                                       |
| `max_reissues`                        | `3`     | Maximum reissues per issuance                        |
| `reissue_duration_days`               | `7`     | Days added per reissue                               |
| `max_books_per_student`               | `3`     | Max concurrent issued books                          |
| `require_operator_return_confirmation`| `false` | If true, returns go to RETURN_PENDING first          |
| `block_issue_if_overdue`              | `true`  | Prevent new issues if student has overdue books      |
| `fine_per_day`                        | `0`     | ₹ fine per day overdue (0 = no fine)                 |
| `max_fine_per_book`                   | `100`   | Cap fine per single issuance                         |
| `allow_self_service_issue`            | `true`  | Whether student terminal can issue (vs operator-only)|

### 1.6 — Constants (`lib/constants.ts`)

Add:
- `BOOK_CATEGORIES`: FICTION, NON_FICTION, TEXTBOOK, REFERENCE, PERIODICAL, GENERAL
- `BOOK_COPY_STATUS`: AVAILABLE, ISSUED, LOST, DAMAGED, RETIRED
- `BOOK_COPY_CONDITION`: NEW, GOOD, FAIR, POOR, DAMAGED
- `ISSUANCE_STATUS`: ISSUED, RETURNED, OVERDUE, LOST, RETURN_PENDING
- `LIB_OPERATOR` added to USER_ROLES
- `LIBRARY_SETTINGS_DEFAULTS` object

### 1.7 — Relations

- `book` → many `book_copy`
- `book_copy` → one `book`, many `book_issuance`
- `book_issuance` → one `book_copy`, one `child`
- `child` → many `book_issuance` (new relation)
- `user (LIB_OPERATOR)` → referenced by `book_issuance.issued_by`, `book_issuance.return_confirmed_by`

---

## Phase 2 — Auth, Middleware & Layout Updates

**Files**: `lib/auth.ts`, `middleware.ts`, new layout files

### 2.1 — Update Better Auth config
- Add `LIB_OPERATOR` to role type

### 2.2 — Update middleware route matching
Add to protected routes:
```
/lib-operator/:path*
/api/lib-operator/:path*
/api/library/:path* (protected routes only — student terminal APIs are public)
```

### 2.3 — New route group layouts
- `app/(lib-operator)/layout.tsx` — requires `LIB_OPERATOR` role, minimal layout (like canteen operator)
- `app/(library-kiosk)/layout.tsx` — NO auth required (like canteen kiosk), minimal chrome

### 2.4 — Update login redirect
```
LIB_OPERATOR → /lib-operator/dashboard
```

### 2.5 — Update management nav
- Add "Library" section to `management-nav.tsx` with sub-links: Books, Bulk Upload, Settings, Statistics

### 2.6 — Update parent nav
- Add "Library" link to parent navbar → `/library-history`

---

## Phase 3 — Library Student Terminal (Public, No Auth)

**Route group**: `app/(library-kiosk)/library/page.tsx`
**Pattern**: Mirrors canteen kiosk — stateless, auto-focused RFID input, auto-reset timer

### 3.1 — Terminal UI Flow

**State machine**:
```
IDLE → [RFID tap] → IDENTIFIED → [has books?]
  ├── YES → ISSUED_BOOKS_VIEW (list issued books with return/reissue actions)
  └── NO  → SEARCH_VIEW (search books to issue)

ISSUED_BOOKS_VIEW:
  ├── [Return] → SCAN_RETURN (scan barcode / enter accession# or ISBN) → CONFIRM_RETURN → success/pending
  ├── [Reissue] → CONFIRM_REISSUE → success (new due date shown)
  └── [Issue More] → SEARCH_VIEW

SEARCH_VIEW:
  ├── [Search by title/author/ISBN] → results grid
  └── [Select book] → SCAN_ISSUE (scan barcode of specific copy) → CONFIRM_ISSUE → success (due date shown)

Any state → 30sec inactivity → IDLE (auto-reset)
```

### 3.2 — Terminal Features
- **Auto-focused RFID input** (reuse kiosk pattern with setInterval re-focus)
- **Barcode scanner input**: Second auto-focused field for book barcode scanning (same USB HID approach)
- **Smart scan resolution**: Input is matched against `book_copy.accession_number` first. If no match, try `book.isbn`. If ISBN matches multiple available copies, auto-select first available. If no available copies, show "all copies issued" message.
- **Issue confirmation screen**: Shows book title, author, copy accession#, due date, reissues remaining
- **Return confirmation screen**: Shows book title, return status (RETURNED or RETURN_PENDING depending on config)
- **Reissue screen**: Shows new due date, remaining reissues
- **Animations**: Success/error states with auto-reset countdown (reuse kiosk pattern)
- **Real-time sync**: Listen to SSE `library-updated` event to refresh data

### 3.3 — API Routes (Public — no auth required)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/library/student` | POST | Look up child by RFID → return issued books + child info |
| `/api/library/search` | GET | Search books by title/author/ISBN (query param `q`) |
| `/api/library/issue` | POST | Issue a book copy to a child (RFID + accession#/ISBN) |
| `/api/library/return` | POST | Return a book (accession# + RFID for verification) |
| `/api/library/reissue` | POST | Reissue/extend a book (issuanceId + RFID) |

### 3.4 — Issue Validation Pipeline (mirrors kiosk order validation)
1. Look up child by RFID card (error if not registered)
2. Check `allow_self_service_issue` setting
3. Check current issued book count vs `max_books_per_student`
4. Check if `block_issue_if_overdue` and student has overdue books
5. Verify book copy exists and status is AVAILABLE
6. Check student doesn't already have this exact book issued
7. Create `book_issuance` record (status: ISSUED)
8. Update `book_copy.status` → ISSUED
9. Decrement `book.available_copies`
10. Broadcast SSE `library-updated`

### 3.5 — Return Validation Pipeline
1. Look up book copy by accession number (or ISBN → resolve to copy)
2. Find active issuance for this copy
3. Verify the RFID matches the child who has it issued (prevent returning someone else's book)
4. Calculate fine if overdue: `overdue_days × fine_per_day`, capped at `max_fine_per_book`
5. If `require_operator_return_confirmation`:
   - Set issuance status → RETURN_PENDING
   - Show "Return requested — please drop the book at the return desk"
6. Else:
   - Set issuance status → RETURNED, `returned_at` = now
   - Update `book_copy.status` → AVAILABLE
   - Increment `book.available_copies`
   - If fine > 0: deduct from child's wallet, create `walletTransaction` (new type: `LIBRARY_FINE`)
7. Broadcast SSE `library-updated`

### 3.6 — Reissue Validation Pipeline
1. Look up active issuance by ID
2. Verify RFID matches the child
3. Check `reissue_count < max_reissues`
4. Check no overdue status (can't reissue if already overdue — configurable)
5. Extend `due_date` by `reissue_duration_days`
6. Increment `reissue_count`
7. Show new due date

---

## Phase 4 — Library Operator Dashboard

**Route group**: `app/(lib-operator)/lib-operator/dashboard/page.tsx`
**Pattern**: Mirrors canteen operator — minimal, focused UI

### 4.1 — Operator UI: Two Tabs

**Tab 1: Issue / Return** (primary workflow)
- **Mode toggle**: Issue ↔ Return (big toggle buttons at top)
- **RFID scan field** (auto-focused): Identifies student
- **Barcode scan field**: Identifies book copy
- **Issue mode**: RFID scan → shows student info + current issued count. Then barcode scan → shows book info + confirms issue. Can scan multiple barcodes in sequence for batch issuing.
- **Return mode**: Barcode scan → shows book info + who has it + overdue status. Confirm return (operator acts as `return_confirmed_by`). Can scan multiple returns in sequence. Shows fine amount if applicable.
- **Stamp info display**: After issue/return, display a formatted "stamp card" showing: book title, accession#, student name, class, issued date, due date — operator can reference this while stamping physical book.

**Tab 2: Pending Returns** (only visible if `require_operator_return_confirmation` is ON)
- List of RETURN_PENDING issuances
- Each entry: student name, book title, accession#, when return was requested
- Operator scans barcode or clicks "Confirm" → finalizes return
- "Reject" option → sets back to ISSUED (student still has the book)

### 4.2 — Operator API Routes (auth required: LIB_OPERATOR)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/lib-operator/issue` | POST | Issue book to student (operator-initiated) |
| `/api/lib-operator/return` | POST | Confirm return (operator as confirmer) |
| `/api/lib-operator/pending-returns` | GET | List RETURN_PENDING issuances |
| `/api/lib-operator/reject-return` | POST | Reject a pending return |
| `/api/lib-operator/lookup-student` | POST | Look up student by RFID |
| `/api/lib-operator/lookup-book` | POST | Look up book by accession# or ISBN |

### 4.3 — Batch Operations
- **Batch issue**: After identifying student, operator can scan multiple book barcodes in sequence. Each scan issues immediately, building a list on screen. "Done" button shows summary + all stamp info.
- **Batch return**: Operator can scan multiple book barcodes in sequence without needing RFID each time (book copy → issuance → child is auto-resolved).

---

## Phase 5 — Management: Library Module

**Route group**: Under existing `app/(management)/management/library/`

### 5.1 — Book Catalog Management
**Page**: `management/library/books/page.tsx`

- **Book list**: Paginated table with search/filter (by title, author, ISBN, category)
- **Add book**: Form with title, author, ISBN, publisher, edition, category, description, cover image
- **Edit book**: Inline edit or modal
- **Delete book**: Soft-archive (set all copies to RETIRED) with confirmation
- **Copy management**: Expand a book row → see all copies (accession#, condition, status, location)
  - Add copy: Enter accession number, condition, location
  - Edit copy: Update condition, location, status
  - Remove copy: Set status to RETIRED (not hard delete)

**API Routes:**

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/management/library/books` | GET, POST | List/create books |
| `/api/management/library/books/[id]` | GET, PATCH, DELETE | Read/update/archive book |
| `/api/management/library/books/[id]/copies` | GET, POST | List/add copies for a book |
| `/api/management/library/books/[id]/copies/[copyId]` | PATCH, DELETE | Update/retire a copy |

### 5.2 — Bulk Book Upload
**Page**: `management/library/bulk-upload/page.tsx`
**Pattern**: Mirrors existing canteen bulk upload (XLSX/CSV, flexible column detection, row-level status)

**Expected columns:**
- Title (required)
- Author (required)
- ISBN (optional)
- Publisher (optional)
- Edition (optional)
- Category (optional; default: GENERAL)
- Accession Number (required — one row per physical copy)
- Condition (optional; default: NEW)
- Location (optional)

**Processing logic:**
1. Parse file (XLSX library, same as canteen bulk upload)
2. Flexible column name detection (case-insensitive, aliases: "Book Name"→title, "Writer"→author, etc.)
3. For each row:
   - Check if book with same ISBN already exists → reuse or create
   - If no ISBN: check by exact title+author match → reuse or create
   - Check accession number uniqueness → skip if exists
   - Create `book_copy` linked to book
   - Update `book.total_copies` and `book.available_copies`
4. Return per-row status (created/skipped/error)
5. Summary: X books created, Y copies added, Z skipped, W errors

**API Route**: `/api/management/library/bulk-upload` (POST, multipart form)

### 5.3 — Library Settings
**Page**: `management/library/settings/page.tsx`

- Form with all configurable settings from `library_setting` table
- Grouped into sections:
  - **Issue Rules**: duration, max reissues, reissue duration, max books per student
  - **Return Rules**: require operator confirmation toggle, block issue if overdue toggle
  - **Fines**: fine per day, max fine per book
  - **Access**: allow self-service issue toggle
- Save all settings atomically
- Audit log entry on settings change

**API Route**: `/api/management/library/settings` (GET, PUT)

### 5.4 — Library Statistics & Analytics
**Page**: `management/library/statistics/page.tsx`
**Pattern**: Mirrors canteen analytics dashboard with Recharts

**Metrics & Charts:**

| Metric | Chart Type | Description |
|--------|-----------|-------------|
| Overview cards | KPI cards | Total books, total copies, currently issued, overdue count, total fines collected |
| Issuance trend | AreaChart | Daily issuances over time (date range filter) |
| Returns trend | AreaChart | Daily returns over time |
| Category distribution | PieChart (donut) | Books by category |
| Most popular books | BarChart | Top 10 most-issued books |
| Class-wise issuance | BarChart | Which classes issue the most books |
| Frequent visitors | Table | Top students by visit/issue count |
| Overdue report | Table | Currently overdue books with student + parent contact info |
| Fine collection | AreaChart | Fines collected over time |
| Reissue rate | KPI + chart | % of issues that get reissued, by book category |
| Average hold duration | KPI | Mean days books are held before return |

**API Route**: `/api/management/library/statistics` (GET, `?days=N`)

**Helper file**: `lib/library-statistics.ts` (mirrors `lib/statistics.ts` pattern)

---

## Phase 6 — Parent Portal: Library Section

**Route**: `app/(parent)/library-history/page.tsx`
**API**: `/api/library/history` (GET, auth required: PARENT)

### 6.1 — Features
- **Child selector** (if multiple children — reuse existing pattern)
- **Currently issued books**: Card per book showing title, author, cover, due date, days remaining, reissue count
  - Visual urgency: green (5+ days), yellow (2-4 days), red (overdue)
  - Fine amount shown if overdue
- **Book history**: Past issuances with dates, return status, fines paid
- **Summary stats**: Total books read, current month count, favorite category

### 6.2 — Notifications (lightweight)
- Red badge on "Library" nav link if any child has overdue books
- Banner on parent dashboard if fine pending

---

## Phase 7 — Wallet Integration for Fines

**Files**: `lib/db/schema.ts` (update walletTransaction type enum), wallet API routes

### 7.1 — Expand `walletTransaction.type` enum
```
Current:  ["TOP_UP", "DEBIT", "REFUND"]
New:      ["TOP_UP", "DEBIT", "REFUND", "LIBRARY_FINE"]
```

### 7.2 — Fine deduction flow
1. On book return (confirmed), if `overdue_days > 0` and `fine_per_day > 0`:
   - Calculate fine: `min(overdue_days × fine_per_day, max_fine_per_book)`
   - Check child's wallet balance
   - If sufficient: deduct fine, create `walletTransaction` (type: LIBRARY_FINE, description: "Overdue fine: {book title}")
   - If insufficient: deduct whatever is available, mark remaining as "fine pending" (new field on issuance or separate fine ledger)
   - Update `book_issuance.fine_amount` and `fine_deducted`
2. **Insufficient balance handling**: Student can still return the book. Fine is recorded. Parent sees outstanding fine on their dashboard. New issues are blocked until fine is cleared (configurable).

---

## Phase 8 — Real-time Updates & Events

**Files**: `lib/sse.ts`, `lib/events.ts`

### 8.1 — New SSE events
- `library-updated` — Broadcast on: issue, return, reissue, copy status change
- Student terminal listens: refresh issued books list, update book search availability
- Operator dashboard listens: refresh pending returns queue
- Parent portal listens: refresh library history

### 8.2 — Audit Logging
Reuse existing `auditLog` table. New actions:
- `BOOK_ISSUED`, `BOOK_RETURNED`, `BOOK_REISSUED`, `BOOK_LOST_MARKED`
- `BOOK_CREATED`, `BOOK_UPDATED`, `BOOK_COPY_ADDED`, `BOOK_COPY_RETIRED`
- `LIBRARY_SETTINGS_UPDATED`, `LIBRARY_BULK_UPLOAD`
- `LIBRARY_FINE_DEDUCTED`, `RETURN_CONFIRMED`, `RETURN_REJECTED`

---

## Anti-Theft Mitigation Strategies (Addressing Concern #2)

1. **Configurable operator confirmation** (`require_operator_return_confirmation`): Returns from student terminal go to RETURN_PENDING. Only operator can finalize. This is the primary mechanism.

2. **Operator return-only mode**: Management can set `allow_self_service_issue = true` but still require operator-confirmed returns. Students can browse and issue freely, but MUST return through the operator. This matches the physical workflow: student drops book at desk, operator scans and confirms.

3. **Daily reconciliation report**: Management statistics page includes a "Today's Returns" list that operator can cross-reference against physically received books.

4. **Mismatch alerts**: If a book is in RETURN_PENDING for more than X hours without operator confirmation → flag in operator dashboard and management statistics.

5. **Student accountability**: All issuance/return history is tied to the child's profile (and by extension, parent). If a book goes "missing," management can trace exactly which student had it.

6. **Periodic inventory audit mode** (Phase 2 enhancement): Management triggers an audit → operator scans all books on shelves → system compares with expected AVAILABLE copies → generates discrepancy report.

---

## Additional Constraints & Edge Cases

1. **Duplicate prevention**: A student cannot issue the same book (same `book.id`) they already have active
2. **Concurrent issue race condition**: Use optimistic locking on `book_copy.status` — check AVAILABLE at update time
3. **ISBN validation**: Validate ISBN-10 (10 digits with check digit) and ISBN-13 (13 digits with check digit) format
4. **RFID reuse**: Leverages the existing `child.rfidCardId` from canteen — same card works for both systems
5. **Overdue status computation**: Don't store OVERDUE as a static status. Query with `WHERE status = 'ISSUED' AND due_date < now()`. Show as OVERDUE in UI. This avoids needing a cron job.
6. **Book deletion safety**: Cannot delete a book or copy that has active issuances. Must return all copies first.
7. **Scanner input disambiguation**: When a scanned value could be either ISBN or accession number, try accession number first (exact match, unique), then ISBN. This avoids ambiguity since accession numbers are school-assigned and less likely to collide with ISBNs.
8. **Max books per student**: Enforce at issue time. Default 3, configurable by management.
9. **Reissue while overdue**: Configurable — by default, a student cannot reissue a book that is already overdue (must return and face fine first).

---

## Relevant Files

### Existing files to modify
- `lib/db/schema.ts` — Add book, book_copy, book_issuance, library_setting tables + relations; expand walletTransaction type enum; expand user role enum
- `lib/constants.ts` — Add library-related constants (categories, statuses, roles, defaults)
- `lib/auth.ts` — Add LIB_OPERATOR to role configuration
- `middleware.ts` — Add /lib-operator/* and /api/lib-operator/* to protected routes
- `lib/sse.ts` — No change needed (generic broadcast), but add `library-updated` event type
- `lib/events.ts` — No change needed (generic listener)
- `app/(management)/management-nav.tsx` — Add "Library" section with sub-links
- `components/navbar.tsx` — Add library link for parents, redirect for LIB_OPERATOR
- `app/(auth)/login/page.tsx` — Add LIB_OPERATOR redirect

### New files to create
- **Schema/DB**: New migration file
- **Helpers**: `lib/library-statistics.ts`, `lib/library-analytics.ts`
- **Student terminal**: `app/(library-kiosk)/layout.tsx`, `app/(library-kiosk)/library/page.tsx`
- **Lib Operator**: `app/(lib-operator)/layout.tsx`, `app/(lib-operator)/lib-operator/dashboard/page.tsx`
- **Management Library**: `app/(management)/management/library/books/page.tsx`, `bulk-upload/page.tsx`, `settings/page.tsx`, `statistics/page.tsx`
- **Parent**: `app/(parent)/library-history/page.tsx`
- **API routes** (see each phase for full listing):
  - `app/api/library/` — student, search, issue, return, reissue, history
  - `app/api/lib-operator/` — issue, return, pending-returns, reject-return, lookup-student, lookup-book
  - `app/api/management/library/` — books CRUD, copies CRUD, bulk-upload, settings, statistics
- **Components**: `components/library/` — book-card, issuance-card, stamp-card, book-search, overdue-badge, library-analytics charts

---

## Verification

1. **Unit/integration tests for validation pipelines**: Issue pipeline (max books, overdue block, duplicate check, concurrent issue), Return pipeline (RFID match, fine calc, operator confirm flow), Reissue pipeline (max reissues, overdue block)
2. **Student terminal E2E**: RFID tap → see issued books → scan barcode to return → verify book copy becomes AVAILABLE; RFID tap → search → issue → verify due date and copy status
3. **Operator E2E**: Batch issue (3 books in sequence) → verify all 3 issued; Batch return → verify all returned + fines calculated; Pending returns queue: student returns on terminal → appears in operator queue → confirm → verify finalized
4. **Bulk upload**: Upload test CSV with 50 books → verify: books created, copies created, duplicates skipped, available_copies correct; Upload same file again → all skipped (idempotent)
5. **Fine calculation**: Issue book → manually set due_date to past → return → verify correct fine amount and wallet deduction and walletTransaction record
6. **Settings propagation**: Change `max_books_per_student` → verify terminal enforces new limit immediately
7. **Anti-theft flow**: Enable `require_operator_return_confirmation` → student returns on terminal → verify status is RETURN_PENDING → operator confirms → verify RETURNED
8. **Analytics**: Issue/return several books across different classes → verify all statistics charts render with correct aggregations
9. **Cross-module**: Verify RFID card works for both canteen kiosk and library terminal with the same tap
10. **Edge cases**: Try issuing when wallet has insufficient balance for potential fine → should still allow (fine is at return time); Try issuing a RETIRED copy → should fail; Try returning a book with wrong RFID → should fail

---

## Suggested Future Enhancements (Out of MVP Scope)

1. **Book reservation / waitlist**: If all copies are issued, student can join a waitlist. Notify when available.
2. **QR code generation**: Generate printable QR codes for accession numbers (for books without barcodes).
3. **Reading recommendations**: Based on borrowing history and class.
4. **Email/SMS notifications**: Due date reminders (3 days before, 1 day before, overdue).
5. **Inventory audit mode**: Scan-and-compare for physical inventory verification.
6. **Digital book catalog** (public): A browsable catalog page on the school website.
