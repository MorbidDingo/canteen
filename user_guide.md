# Certe User Guide

## 1) What this project is

**Certe** is a multi-tenant school operations platform centered around student canteen, wallet, RFID/device workflows, library operations, attendance, content/assignments, and payment settlements.

It is built as a Next.js app with role-based portals and dedicated terminal interfaces (Gate, Kiosk, Library Kiosk), backed by a large API surface for operations, automation, and integrations.

---

## 2) Who uses Certe (roles)

Certe provides role-specific experiences with route-level access control:

- **Parent / Guardian**
  - Meal browsing, cart, orders, pre-orders, wallet, controls, notifications.
  - Library reader + library history + library showcase.
  - Assignments/content/calendar/timetable/events.
- **Admin (canteen admin)**
  - Orders, metrics, history, analytics, menu, settings, settlements.
- **Operator**
  - RFID/card operations and top-ups/payment-event handling.
- **Management (school office/admin operations)**
  - Accounts, students, parents, card assignment, attendance view, audit logs.
  - Timetable/exams/holidays.
  - Payment routing, settlement accounts, settlement operations.
  - Library management and content governance.
- **Library Operator (librarian console)**
  - Dashboard, physical books, digital books, bulk upload, library settings.
- **Attendance Officer**
  - Attendance-focused dashboard and workflows.
- **Owner**
  - Owner portal for organization-level control.
- **Platform roles (PLATFORM_OWNER / PLATFORM_SUPPORT)**
  - Platform-wide organization oversight and approvals.
- **Device login profiles**
  - Dedicated terminal routing for Gate/Kiosk/Library device accounts.

---

## 3) Core app capabilities by module

## 3.1 Identity, access, and onboarding

- Login, register, forgot password, reset password flows.
- Role-aware post-login redirects.
- Organization-scoped access control.
- Platform-scoped access control for platform operators.
- Device-session support and org-context-based routing to terminals.
- Organization onboarding endpoints:
  - Register organization
  - Register organization admin

## 3.2 Multi-organization support

- Organization context APIs:
  - Active organization
  - Memberships
  - Available canteens/libraries in org
  - Terminal/device context
- Org switchers used in management and librarian experiences.
- Tenant-aware data separation across modules.

## 3.3 Parent experience (mobile-first app shell)

### Food & ordering
- Browse menu
- Add to cart
- Place orders
- View order history/status
- Pre-order meals
- Certe Pass section

### Wallet & payments
- Wallet balance and transactions
- Top-up and verification flows
- Receipts for parent payment events

### Child management & safety controls
- Children/member views
- Spending controls and restrictions
- Notification and messaging preferences

### Communication, school content, and academics
- Notifications and notices
- Events
- Timetable
- Calendar
- Assignments
- Content board (posts/folders/submissions/audience)

### Library for parents/students
- Library showcase/discovery
- Reader home + per-book reader pages
- Library history

### Smart UX capabilities
- Canteen/library selection persistence
- Bottom-tab based mode switching (food/library/content/settings)
- Live notification bell integrations
- Integrated AI chat assistant entry in parent shell

## 3.4 Canteen admin console

- Orders management
- Orders history
- Menu management
- Metrics dashboard
- Analytics dashboard
- Insights/summary/statistics endpoints
- Discount management
- Pre-order operations
- Settlement account management
- Settlement history
- Settings (including canteen/payment-related settings)
- Manual payment capture/status update endpoints for admin order operations
- Media upload support for menu/content assets

## 3.5 Operator console

- Top-up workflow
- Child lookup and account lookup
- Temporary card management
- Guest card flows
- Payment event actions
- Payment account access for operator context

## 3.6 Management console (school operations)

- Home dashboard and summary/statistics
- Accounts management
- Device account management + assignment
- Parent and student directory management
- Student photo upload endpoint integration
- Card assignment and RFID administration
- Bulk upload tools
- Attendance dashboard integration
- Audit logs
- Messaging logs
- Notices/notification management
- Exams and holidays management
- Timetable management suite:
  - Teachers
  - Subjects
  - Classrooms
  - Student groups
  - Slots
  - Constraints
  - Config
  - AI chat helper
  - Generate + export
  - Assignments scheduling
- Content governance:
  - Content groups
  - Permissions
  - Tags
  - Group membership mappings
- Library administration:
  - Books and copies
  - Readable/digital books uploads
  - Library settings/statistics
  - Library bulk upload
- Payment and settlement administration:
  - Payment accounts/config/events
  - Payment routing
  - Settlement accounts
  - Settlement overview and batch details

## 3.7 Library operator / librarian console

- Dashboard
- Books management
- Digital books management
- Bulk uploads
- Settings
- Book/student lookup APIs
- Issue/return/reject-return flows
- Pending returns queue

## 3.8 Library platform capabilities (cross-role)

- Search and discovery endpoints
- Recommendations and insights
- Favorites and feedback
- Issue/reissue/return lifecycle
- Library history tracking
- Showcase endpoints
- Reader subsystem:
  - Reader library list
  - Public books
  - Per-book content retrieval
  - Bookmarks
  - Highlights
  - Reading progress
  - Reading sessions
  - Reader stats
- Gutenberg catalog/search/content endpoints for public-domain content
- Library AI chat and stream chat endpoints

## 3.9 Gate, attendance, and kiosk terminals

### Gate terminal
- Dedicated gate UI
- Status endpoint and RFID tap endpoint
- Entry/exit style workflows and validation hooks

### Attendance
- Attendance app pages and reports
- Recent activity, summaries, filters
- Bulk attendance upload and report APIs
- Management attendance dashboard endpoint

### Kiosk (canteen ordering)
- Student-facing kiosk page + offline page
- Kiosk order endpoint
- Offline fallback route

### Library kiosk terminal
- Dedicated library terminal page for on-site use

## 3.10 Content, collaboration, and messaging

- Content feed/calendar/classes APIs
- Folder and post lifecycle APIs
- Post attachments and file-serving API
- Audience controls per post
- Post chat and summarize API
- Submission workflows (student/child submission + review endpoints)
- Groups and membership APIs
- Tags APIs
- Messaging preferences endpoint
- Messaging logs in management console

## 3.11 Recommendations and AI/ML

### Recommendation APIs
- Budget recommendations
- Daily recommendations
- Frequent-item recommendations
- Nutrition recommendations
- Trending recommendations
- Insight summaries
- Pre-order candidate recommendations

### AI endpoints
- General AI chat
- Admin AI chat
- Library AI chat (+ streaming variant)
- AI editor endpoint
- Suggested prompts endpoint
- Timetable AI assistant endpoint

### ML/system processing
- ML batch endpoint
- Sync batch endpoint
- Event emit endpoint

## 3.12 Payments, settlement, and finance controls

- Wallet APIs (top-up, verify, transactions)
- Payment creation and verification APIs
- Wallet fallback payment path
- Parent payment events + receipts
- Operator and management payment event handling
- Settlement process endpoint
- Razorpay payout webhook integration
- Settlement account lifecycle (admin/management/platform levels)

## 3.13 Platform and owner governance

### Owner portal
- Owner dashboard page
- Owner organization listing and control
- Subscription checkout/verify/status APIs
- Organization disable/reactivate controls

### Platform portal
- Platform dashboard page
- Tenant overview
- Approval requests lifecycle
- Reactivation requests lifecycle
- Org admin management
- Organization suspend/reactivate actions
- Platform settlement visibility and settlement-account management
- Platform “me” endpoint for identity/context

---

## 4) API capability map (high-level)

The backend exposes a broad REST API grouped by domain:

- `/api/auth/*` — authentication + device sessions
- `/api/onboarding/*` — org/admin onboarding
- `/api/org/*` — org context/membership/canteen/library selection context
- `/api/menu/*`, `/api/orders/*`, `/api/pre-orders/*` — canteen ordering core
- `/api/wallet/*`, `/api/payments/*`, `/api/settlements/*`, `/api/webhooks/*` — payments + settlement backbone
- `/api/children/*`, `/api/controls/*`, `/api/parent/*` — parent/child + controls + notices/notifications
- `/api/recommendations/*`, `/api/ai/*`, `/api/ml/*` — smart recommendations and AI/ML features
- `/api/library/*`, `/api/lib-operator/*` — library domain and librarian actions
- `/api/gate/*`, `/api/kiosk/*`, `/api/attendance/*` — terminal + attendance operations
- `/api/photos/*` — single and bulk photo uploads
- `/api/content/*`, `/api/messaging/*` — content, assignments, communication
- `/api/admin/*`, `/api/management/*`, `/api/operator/*`, `/api/owner/*`, `/api/platform/*` — role-segmented operational APIs

---

## 5) End-user workflows supported

### 5.1 Parent meal workflow
1. Choose active canteen.
2. Browse menu and add items to cart.
3. Place immediate order or create pre-order.
4. Track order status in orders section.
5. Manage spend with wallet and controls.

### 5.2 Parent library workflow
1. Enter library mode.
2. Discover/showcase books.
3. Open reader and continue reading.
4. Save highlights/bookmarks/progress.
5. Track borrowing history and overdue state.

### 5.3 School office operations workflow
1. Manage students/parents/accounts.
2. Assign cards and maintain device accounts.
3. Configure timetable, exams, holidays.
4. Oversee notices, attendance, audit trails.
5. Configure payment routing and settlements.

### 5.4 Canteen admin operations workflow
1. Maintain menu and discounts.
2. Monitor live orders.
3. Resolve exceptions and payment statuses.
4. Track metrics/analytics/history.
5. Reconcile settlement accounts and batches.

### 5.5 Terminal workflows
- **Gate**: tap -> verify -> status/log updates.
- **Kiosk**: student selection/tap -> order placement.
- **Library terminal**: lookup -> issue/return flows.

---

## 6) Technical and platform capabilities

- Next.js App Router architecture with dedicated route groups for each role.
- Drizzle ORM + SQL migrations for evolving schema.
- Cloudinary integration for photo/media uploads.
- Razorpay integration for payment/order/settlement flows.
- S3-compatible storage support for file flows.
- Role and scope enforcement at layout and API levels.
- Offline route for kiosk scenarios.
- Extensive modular API design for enterprise-like operations.

---

## 7) Full visible app surface (pages)

### Public and global
- Splash (`/`)
- Landing (`/landing`)
- Costing (`/costing`)
- Offline (`/offline`)

### Auth
- `/login`, `/register`, `/forgot-password`, `/reset-password`

### Parent
- `/menu`, `/cart`, `/orders`, `/pre-orders`, `/certe-pass`
- `/wallet`, `/controls`, `/children`, `/settings`, `/notifications`, `/messaging-settings`
- `/library-showcase`, `/library-reader`, `/library-reader/[bookId]`, `/library-history`
- `/content`, `/content/new`, `/content/new-folder`, `/content/[id]/edit`, `/content/[id]/submissions`
- `/assignments`, `/assignments/[id]`, `/assignments/folder/[id]`
- `/calendar`, `/events`, `/timetable`

### Admin
- `/admin/orders`, `/admin/orders/history`, `/admin/menu`, `/admin/metrics`, `/admin/history`, `/admin/analytics`, `/admin/statistics`, `/admin/settings`, `/admin/settings/settlement`, `/admin/library/books`

### Operator
- `/operator/topup`, `/operator/payment-events`, `/operator/payment-accounts`

### Management
- `/management`, `/management/accounts`, `/management/device-accounts`, `/management/parents`, `/management/students`, `/management/cards`, `/management/bulk-upload`
- `/management/notifications`, `/management/exams`, `/management/holidays`, `/management/timetable`, `/management/statistics`, `/management/attendance`, `/management/audit`, `/management/messaging-logs`
- `/management/payment-routing`, `/management/payment-events`, `/management/settlement-accounts`, `/management/settlements`
- `/management/content/permissions`, `/management/content/groups`
- `/management/library/books`, `/management/library/bulk-upload`, `/management/library/settings`, `/management/library/statistics`

### Library operator
- `/lib-operator/dashboard`, `/lib-operator/books`, `/lib-operator/digital-books`, `/lib-operator/bulk-upload`, `/lib-operator/settings`

### Attendance
- `/attendance`

### Device terminals
- `/kiosk`, `/kiosk/offline`, `/gate`, `/library`

### Owner and platform
- `/owner`, `/platform`

---

## 8) Bottom line

Certe is not a single-purpose canteen app—it is a **comprehensive school operations suite** that combines:

- Canteen commerce
- RFID/device terminal operations
- Wallet and payment rails
- Attendance and gate visibility
- Library (physical + digital reading)
- Academic content, assignments, and communication
- Multi-organization governance with owner/platform controls

If you want, I can next produce:
1. A **role-by-role quick-start guide** (what each user clicks first).
2. An **API endpoint catalog table** with method + purpose + role access.
3. A **deployment/ops runbook** from this codebase structure.
