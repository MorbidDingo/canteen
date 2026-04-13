# Certe Project Overview, Roles, Capabilities, and Parent App Guide

## What this project is about

**Certe** is a multi-tenant school operations platform focused on:
- **Canteen operations** (menu, orders, pre-orders, kiosk fulfillment, payments, wallets)
- **Library operations** (catalog, issue/return workflows, parent discovery, reading history)
- **Student movement and attendance** (gate tap events, attendance flows, reporting)
- **Parent engagement** (notifications, controls, messaging, academic content board)
- **Organization and platform administration** (tenant onboarding, approvals, settings, analytics)

One deployment supports multiple organizations (schools/institutions), each with independent data and role-based access.

---

## Roles in the project

### Platform-level roles
- **PLATFORM_OWNER**: Super-admin for the SaaS platform (tenant approvals, platform controls, critical actions).
- **PLATFORM_SUPPORT**: Platform operations/support role with controlled platform access.

### Organization-level roles
- **OWNER**: Organization owner-level authority; broadest organization access.
- **ADMIN**: Canteen administration (orders, menu, metrics, analytics, settings).
- **MANAGEMENT**: Full operational oversight (accounts, students, cards, attendance, library, audits, etc.).
- **LIB_OPERATOR**: Library operator (catalog, copies, settings, bulk library workflows).
- **OPERATOR**: Wallet top-up operator (RFID-assisted balance operations).
- **ATTENDANCE**: Attendance-focused workflows and attendance reporting.
- **PARENT**: Parent/guardian experience for canteen, library, content, controls, and notifications.
- **GENERAL**: Basic organization user with limited feature access.
- **DEVICE**: Headless terminal account mapped to physical device interfaces.

### Device terminal types (under DEVICE role)
- **KIOSK**: Student canteen ordering terminal (`/kiosk`)
- **GATE**: Entry/exit terminal (`/gate`)
- **LIBRARY**: Library terminal (`/library`)

---

## Core capabilities of the project

### 1) Canteen capabilities
- Menu management by organization/canteen
- Cart and checkout flows
- Live order lifecycle handling
- Pre-order and subscription-style meal workflows
- Wallet-integrated payment support and transaction history
- Canteen-side fulfillment via kiosk terminal

### 2) Library capabilities
- Book and copy catalog management
- Parent-facing discovery/showcase and reading surfaces
- Issue/return and history tracking
- Library settings and operator workflows
- Multi-library support at organization level

### 3) Student/parent account capabilities
- Parent-child linkage and member management
- Child wallet balances and ledger-style transactions
- Parent controls (spend limits, category/item restrictions, AI-related controls where enabled)
- Notifications and messaging preferences

### 4) School operations capabilities
- Attendance flows and attendance dashboards
- Gate entry/exit logging and related status workflows
- Calendar/events/timetable content access
- Assignment/note/content publishing and submissions

### 5) Administration and platform capabilities
- Organization-level management for users, devices, students, cards, and settings
- Audit logging and operational observability
- Platform onboarding/approval and tenant supervision flows
- Feature entitlement and contract/subscription-linked controls

---

## Parent-facing app user guide

The parent experience is primarily in the `(parent)` route group and is optimized around four main tabs plus profile/menu actions.

## 1. Getting started
1. Sign in with a parent account.
2. You are redirected to the parent area (typically `/menu`).
3. Use the bottom navigation for primary sections:
   - **Food** (`/menu`)
   - **Library** (`/library-showcase`)
   - **Pass** (`/pre-orders` or `/certe-pass`)
   - **Board** (`/assignments`)
4. Open the profile/menu drawer for additional sections (orders, library history, calendar, controls, notifications, messaging, etc.).

## 2. Food (Canteen) flow
1. Go to **Food**.
2. Browse menu items and add to cart.
3. Open **Cart** to review quantities and place order.
4. Track order status in **Orders** / **Order History**.
5. Use **Pre-Orders/Pass** for advanced or subscription-style ordering where available.

## 3. Library flow
1. Go to **Library** to browse catalog/showcase.
2. Open book details and use reader/history areas where applicable.
3. Track issued/returned items in **Library History**.

## 4. Board and academic content flow
1. Open **Board** to view assignments/notes/content feed.
2. Open a post for details, due dates, and submission actions when applicable.
3. Use calendar-linked content views for timeline awareness.

## 5. Wallet and family management
1. Open wallet from the parent header/profile areas.
2. Review combined and child-level balances/transactions.
3. Manage members/children in **Children**.
4. Apply restrictions and spending controls in **Controls**.

## 6. Notifications, messaging, and events
1. Use the notification bell to review real-time updates.
2. Open **Notifications** for full history.
3. Configure communication options in **Messaging** settings.
4. Use **Calendar/Events/Timetable** for schedules and school updates.

## 7. Venue switching
- If multiple cafeterias or libraries exist, use the venue selector in the parent header to switch context.

## 8. Parent best practices
- Keep child profiles and card mappings up to date.
- Review wallet activity frequently.
- Use controls proactively (limits/category restrictions) for safe spending.
- Check board/calendar/notifications daily for operational and academic updates.

---

## Notes
- Exact feature visibility depends on organization configuration, role entitlements, and enabled modules.
- For seed-account specifics and detailed role examples, refer to `ROLES.md`.
