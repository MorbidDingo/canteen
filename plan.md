# Important: The app should be totally mobile friendly

## Plan: School Café Pre-Order & Order Management System

A phased build of a school canteen ordering system on the existing fresh Next.js 16 scaffold. Parents register, browse menus, place orders with custom instructions, and cancel before preparation. Canteen staff manage orders via a tabbed admin dashboard. We'll use **Better Auth** for authentication, **Drizzle ORM + SQLite** (lightweight, zero-config), **shadcn/ui** for a modern minimal UI, and **Zustand** for cart state. No payment gateway initially — cash-on-serving only for MVP.

---

### Phase 1 — Foundation & Setup

1. **Install core dependencies** — Add `drizzle-orm`, `drizzle-kit`, `better-auth`, `shadcn/ui` (via CLI), `zustand`, `bcrypt`, `zod` (validation), and `lucide-react` (icons) to `package.json`.
2. **Initialize Drizzle with SQLite** — Create `lib/db/schema.ts` with Drizzle table definitions for `user`, `session`, `account`, `verification` (Better Auth core), plus `menuItem`, `order`, `orderItem` (app tables), adding a `role` field (`PARENT | ADMIN`) to `user` for admin access. Create `lib/db/index.ts` to export the Drizzle client instance using `@libsql/client`. Add `drizzle.config.ts` at the project root.
3. **Configure Better Auth** — Create `lib/auth.ts` (server config) and `lib/auth-client.ts` (client helper) using the Drizzle adapter; set up credential-based email+password sessions with role support; create route handler at `app/api/auth/[...all]/route.ts`.
4. **Set up shadcn/ui** — Run `npx shadcn@latest init`; add essential components: `Button`, `Card`, `Input`, `Label`, `Badge`, `Tabs`, `Dialog`, `Select`, `Textarea`, `Toast`.
5. **Create shared layout** — Update `app/layout.tsx` with a responsive nav bar (logo, menu links, auth state), auth session provider, and Toaster. Create `lib/utils.ts` for shared helpers and `lib/constants.ts` for order statuses/categories.

### Phase 2 — Parent Flow (Auth, Menu, Cart, Orders)

1. **Auth pages** — Create `app/(auth)/login/page.tsx` and `app/(auth)/register/page.tsx` with forms for parent registration (name, email, phone, child name, child GR number, password) and login; validate with Zod; hash passwords via Better Auth; redirect to `/menu` on success.
2. **Menu page** — Create `app/(parent)/menu/page.tsx` as a React Server Component that fetches all available `MenuItem` records; display as a responsive grid of cards grouped by category (`Snacks | Meals | Drinks`), each with name, description, price, image placeholder, and an "Add to Cart" button.
3. **Cart with Zustand** — Create `lib/store/cart-store.ts` using Zustand with `persist` middleware (localStorage); store items with quantity and per-item instructions (free text + predefined toggles: "Less oily", "No pav", "Less spicy", "No onion"). Build `app/(parent)/cart/page.tsx` showing cart items, instruction editing, quantity controls, total, payment method selector (Cash only for MVP), and a "Place Order" button.
4. **Order placement API** — Create `app/api/orders/route.ts` (POST) with server-side Zod validation; verify session, compute `totalAmount` from current menu prices (prevent tampering), create `Order` + `OrderItem` records with status `PLACED` and payment `UNPAID`/`CASH`. Add GET for parent's own orders.
5. **Orders history & cancel** — Create `app/(parent)/orders/page.tsx` showing the parent's orders sorted by date; each card shows items, status badge, total, and a "Cancel" button visible only when status is `PLACED`. Create `app/api/orders/[id]/cancel/route.ts` (PATCH) that enforces the `PLACED`-only cancellation rule.

### Phase 3 — Admin Dashboard

1. **Admin route protection** — Create `middleware.ts` at project root to protect `/admin/**` routes; verify session and `role === 'ADMIN'`, redirect unauthorized users to `/login`.
2. **Admin orders dashboard** — Create `app/admin/orders/page.tsx` with four tabs (Placed 🟢, Preparing 🟡, Served 🔵, Cancelled 🔴) using shadcn `Tabs`; each tab fetches orders filtered by status. Each order card displays child name, GR number, items + quantities, instructions, payment status badge, timestamp, total, and action buttons.
3. **Status transition API** — Create `app/api/orders/[id]/status/route.ts` (PATCH) enforcing the state machine: `PLACED → PREPARING | CANCELLED`, `PREPARING → SERVED`; reject invalid transitions. Add a separate `app/api/orders/[id]/payment/route.ts` (PATCH) for toggling `paymentStatus` between `PAID`/`UNPAID`.
4. **Menu management (basic)** — Create `app/admin/menu/page.tsx` for CRUD on menu items (add, edit, toggle availability) with corresponding `app/api/menu/route.ts` (GET/POST) and `app/api/menu/[id]/route.ts` (PATCH/DELETE). Seed the database with sample menu items via `lib/db/seed.ts` (run with `npx tsx lib/db/seed.ts`).

### Phase 4 — Polish & Optional Enhancements

1. **Daily summary view** — Add a summary section to the admin dashboard showing today's order count, total revenue, payment breakdown (paid vs unpaid), and orders-by-status counts.
2. **UPI payment placeholder** — Add a "UPI" option in the cart payment selector that shows a static QR code / UPI ID and marks the order as `UNPAID` until admin confirms via "Mark Paid".
3. **Add animations and final CSS styling** - Add proper styling for ultimate mobile friendly and native mobile application experience. Also, add subtle animations.

---

### Further Considerations

1. **Firebase migration** — The plan uses Drizzle ORM + SQLite for fast MVP development. When ready to move to Firebase, swap Drizzle for the Firebase Admin SDK and Firestore collections mirroring the same schema. Should this be planned in detail now, or deferred?
2. **Better Auth vs NextAuth** — Better Auth is newer with fewer community examples. If you hit friction, NextAuth v5 (Auth.js) is a drop-in alternative with the same Drizzle adapter pattern. Preference?
3. **Image uploads for menu items** — The spec has an optional `imageUrl`. For MVP, use static placeholder images. For a future phase, consider Cloudinary or Firebase Storage. Agree to defer?
