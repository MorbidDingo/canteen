# Account Roles & Permissions

All passwords for seed accounts: `password123`

---

## OWNER — Platform Owner

**Scope:** Platform-wide (not tied to a single organisation)

| Area | Access |
|------|--------|
| Organisation approval | Create, approve, manage all organisations |
| Dashboard | `/owner` — platform-level overview |

**Seed accounts:**
- `owner@certe.app`

---

## ADMIN — Organisation Admin

**Scope:** Organisation (canteen management only)

| Area | Access |
|------|--------|
| Orders | View and manage all canteen orders |
| Menu | Create, edit, toggle menu items |
| Metrics | Real-time canteen KPIs |
| History | Transaction and order history |
| Analytics | Revenue, trends, item popularity |
| Statistics | Organisation-wide canteen stats |
| Settings | Organisation settings |

> Admin does **not** have library access. Library is managed by MANAGEMENT and LIB_OPERATOR roles.

**Seed accounts:**
- `arjun@westfield.edu` (Westfield Academy)
- `neha@greenfield.edu` (Greenfield College)

---

## MANAGEMENT — Organisation Manager

**Scope:** Organisation (full oversight of canteen + library + operations)

| Area | Access |
|------|--------|
| Dashboard | Organisation overview |
| Accounts | Staff & user account management |
| Device Accounts | Device login credentials |
| Parents | Parent profile management |
| Students | Student data CRUD, class/section |
| Cards | RFID card assignment and management |
| Bulk Upload | Batch import students, cards, books |
| Statistics | Organisation-wide analytics |
| Attendance | Attendance records and reports |
| Audit Log | Full action audit trail |
| Library | Book catalogue and copy management |
| Messaging Logs | Communication history |

**Seed accounts:**
- `priya@westfield.edu` (Westfield Academy)
- `rahul@greenfield.edu` (Greenfield College)

---

## LIB_OPERATOR — Library Operator

**Scope:** Organisation (library management only)

| Area | Access |
|------|--------|
| Dashboard | Library overview and stats |
| Books | Full book catalogue & copy CRUD |
| Bulk Upload | Batch import books and copies |
| Settings | Library configuration |

Each operator can switch between assigned libraries via the Library Selector.

**Seed accounts:**
- `ritu.lib@westfield.edu` (Westfield — Main Library)
- `vikram.lib@westfield.edu` (Westfield — Science Library)
- `anjali.lib@greenfield.edu` (Greenfield)

---

## OPERATOR — Wallet Operator

**Scope:** Organisation (wallet top-ups only)

| Area | Access |
|------|--------|
| Top-up | Scan RFID → add balance to child wallets |

**Seed accounts:**
- `suresh.op@westfield.edu` (Westfield Academy)
- `ganesh.op@greenfield.edu` (Greenfield College)

---

## ATTENDANCE — Attendance Officer

**Scope:** Organisation (attendance marking only)

| Area | Access |
|------|--------|
| Attendance | Mark student attendance via RFID or manual entry |

**Seed accounts:**
- `meena.att@westfield.edu` (Westfield Academy)

---

## PARENT — Parent / Guardian

**Scope:** Organisation (consumer — canteen + library)

### Canteen mode
| Area | Access |
|------|--------|
| Menu | Browse canteen menu, add to cart |
| Orders | View order history, track live orders |
| Pre-Orders | Schedule advance meal orders |
| Cart | Checkout and payment |
| Wallet | View child wallet balances and transactions |

### Library mode
| Area | Access |
|------|--------|
| Showcase | Browse library catalogue, AI recommendations |
| History | View borrowing history, overdue books |

### Shared
| Area | Access |
|------|--------|
| Settings | Profile, children, notifications, messaging |
| Controls | Parental controls (certe+ feature) |
| AI Chat | Canteen assistant (canteen mode), Library assistant (library mode) |

**Seed accounts:**
- `ramesh@example.com`, `sunita@example.com`, `deepak@example.com`, `kavitha@example.com` (Westfield)
- `sanjay@example.com`, `lalitha@example.com` (Greenfield)

---

## GENERAL — General User

**Scope:** Organisation (basic access, no parent features)

General-purpose account with minimal permissions. Typically used for staff or visitors who need basic auth but no specific operational role.

**Seed accounts:**
- `aarav@westfield.edu`, `pooja@westfield.edu` (Westfield)
- `karan@greenfield.edu` (Greenfield)

---

## DEVICE — Device Terminal Accounts

**Scope:** Organisation (locked to a specific device type)

Device accounts are headless login identities assigned to physical terminals. They auto-redirect to the appropriate interface on login.

| Device Type | Interface | Purpose |
|-------------|-----------|---------|
| **KIOSK** | `/kiosk` | Student self-service canteen ordering via RFID |
| **GATE** | `/gate` | Entry/exit verification (RFID tap in/out) |
| **LIBRARY** | `/library` | Student self-service book issue/return via RFID |

**Seed device accounts (Westfield):**
- `kiosk-north@westfield.edu` → North Block Kiosk (canteen)
- `kiosk-sports@westfield.edu` → Sports Canteen Kiosk (canteen)
- `gate@westfield.edu` → Main Gate
- `lib-terminal@westfield.edu` → Main Library Terminal
- `lib-science@westfield.edu` → Science Library Terminal

**Seed device accounts (Greenfield):**
- `kiosk-main@greenfield.edu` → Main Cafeteria Kiosk (canteen)
- `kiosk-hostel@greenfield.edu` → Hostel Canteen Kiosk (canteen)
- `gate@greenfield.edu` → Main Gate
- `lib-terminal@greenfield.edu` → Central Library Terminal
- `lib-dept@greenfield.edu` → Department Library Terminal
