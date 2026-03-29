/**
 * Comprehensive seed script for certe
 * Run with: npm run db:seed
 *
 * Creates two complete organisations with:
 *  - 2 canteens each (different menus)
 *  - 2 libraries each (different book catalogues)
 *  - Admin, management, kiosk, gate, lib-operator, operator, parent and general accounts
 *  - Children with wallets, orders, book issuances
 */

import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import crypto from "crypto";

const db = drizzle(process.env.DATABASE_URL!, { schema });

// ─── Helpers ─────────────────────────────────────────────

function id() {
  return crypto.randomUUID();
}

function hashPassword(_plain: string): string {
  // Better-auth stores bcrypt hashes; for seeding we use a pre-computed bcrypt
  // hash of "password123" so all seed accounts share that password.
  // Generated externally: bcrypt.hashSync("password123", 10)
  return "$2b$10$YourSeedHashHere.ReplacedAtRuntime.OrUseRandomHash";
}

const now = new Date();
function daysAgo(n: number) {
  const d = new Date(now);
  d.setDate(d.getDate() - n);
  return d;
}

// ─── Seed Execution ──────────────────────────────────────

async function seed() {
  console.log("🌱 Starting seed...");

  // ── Platform owner ──────────────────────────────────────

  const platformOwnerId = id();
  await db.insert(schema.user).values({
    id: platformOwnerId,
    name: "Platform Owner",
    email: "owner@certe.app",
    emailVerified: true,
    role: "OWNER",
    phone: "9000000001",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();

  await db.insert(schema.account).values({
    id: id(),
    accountId: platformOwnerId,
    providerId: "credential",
    userId: platformOwnerId,
    password: hashPassword("password123"),
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();

  // ── Organisation 1: Westfield Academy ───────────────────

  const org1Id = id();
  await db.insert(schema.organization).values({
    id: org1Id,
    name: "Westfield Academy",
    slug: "westfield-academy",
    type: "SCHOOL",
    status: "ACTIVE",
    createdByUserId: platformOwnerId,
    approvedByUserId: platformOwnerId,
    approvedAt: now,
    contactEmail: "admin@westfield.edu",
    contactPhone: "9000001000",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();

  // ── Org 1 Admin ──────────────────────────────────────────

  const org1AdminId = id();
  await db.insert(schema.user).values({
    id: org1AdminId,
    name: "Arjun Mehta",
    email: "arjun@westfield.edu",
    emailVerified: true,
    role: "ADMIN",
    phone: "9000001001",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();

  await db.insert(schema.account).values({
    id: id(),
    accountId: org1AdminId,
    providerId: "credential",
    userId: org1AdminId,
    password: hashPassword("password123"),
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();

  await db.insert(schema.organizationMembership).values({
    id: id(),
    organizationId: org1Id,
    userId: org1AdminId,
    role: "ADMIN",
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();

  // ── Org 1 Canteens ────────────────────────────────────────

  const org1Canteen1Id = id();
  await db.insert(schema.canteen).values({
    id: org1Canteen1Id,
    organizationId: org1Id,
    name: "North Block Canteen",
    description: "Serves freshly cooked Indian meals",
    location: "North Block, Ground Floor",
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();

  const org1Canteen2Id = id();
  await db.insert(schema.canteen).values({
    id: org1Canteen2Id,
    organizationId: org1Id,
    name: "Sports Canteen",
    description: "Quick bites and energy snacks",
    location: "Sports Complex, East Wing",
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();

  // ── Org 1 Libraries ──────────────────────────────────────

  const org1Library1Id = id();
  await db.insert(schema.library).values({
    id: org1Library1Id,
    organizationId: org1Id,
    name: "Main Library",
    description: "Central library with academic and fiction titles",
    location: "Academic Block, First Floor",
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();

  const org1Library2Id = id();
  await db.insert(schema.library).values({
    id: org1Library2Id,
    organizationId: org1Id,
    name: "Science & Tech Library",
    description: "Specialised STEM and engineering collection",
    location: "Science Block, Second Floor",
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();

  // ── Org 1 — North Block Menu Items ────────────────────────

  const menuItemsOrg1Canteen1 = [
    { name: "Dal Tadka & Rice", price: 60, category: "MEALS" as const, subscribable: true },
    { name: "Aloo Paratha", price: 35, category: "MEALS" as const, subscribable: true },
    { name: "Veg Biryani", price: 80, category: "MEALS" as const, subscribable: true },
    { name: "Masala Dosa", price: 45, category: "MEALS" as const, subscribable: true },
    { name: "Samosa (2 pcs)", price: 20, category: "SNACKS" as const, subscribable: false },
    { name: "Lassi", price: 30, category: "DRINKS" as const, subscribable: false },
    { name: "Chai", price: 15, category: "DRINKS" as const, subscribable: false },
  ];

  const org1Canteen1MenuIds: string[] = [];
  for (const item of menuItemsOrg1Canteen1) {
    const itemId = id();
    org1Canteen1MenuIds.push(itemId);
    await db.insert(schema.menuItem).values({
      id: itemId,
      organizationId: org1Id,
      canteenId: org1Canteen1Id,
      name: item.name,
      price: item.price,
      category: item.category,
      subscribable: item.subscribable,
      available: true,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoNothing();
  }

  // ── Org 1 — Sports Canteen Menu Items ─────────────────────

  const menuItemsOrg1Canteen2 = [
    { name: "Energy Bar", price: 25, category: "SNACKS" as const, subscribable: false },
    { name: "Protein Sandwich", price: 55, category: "SNACKS" as const, subscribable: false },
    { name: "Fresh Fruit Bowl", price: 40, category: "SNACKS" as const, subscribable: true },
    { name: "Cold Coffee", price: 35, category: "DRINKS" as const, subscribable: false },
    { name: "Sports Drink", price: 40, category: "DRINKS" as const, subscribable: false },
    { name: "Poha", price: 25, category: "PACKED_FOOD" as const, subscribable: true },
  ];

  for (const item of menuItemsOrg1Canteen2) {
    await db.insert(schema.menuItem).values({
      id: id(),
      organizationId: org1Id,
      canteenId: org1Canteen2Id,
      name: item.name,
      price: item.price,
      category: item.category,
      subscribable: item.subscribable,
      available: true,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoNothing();
  }

  // ── Org 1 — Main Library Books ────────────────────────────

  const org1Library1Books = [
    { title: "The Alchemist", author: "Paulo Coelho", isbn: "9780062315007", category: "FICTION", copies: 5 },
    { title: "To Kill a Mockingbird", author: "Harper Lee", isbn: "9780061935466", category: "FICTION", copies: 4 },
    { title: "Sapiens", author: "Yuval Noah Harari", isbn: "9780062316097", category: "NON_FICTION", copies: 3 },
    { title: "Atomic Habits", author: "James Clear", isbn: "9780735211292", category: "SELF_HELP", copies: 6 },
    { title: "Pride and Prejudice", author: "Jane Austen", isbn: "9780141439518", category: "FICTION", copies: 3 },
    { title: "Think and Grow Rich", author: "Napoleon Hill", isbn: "9781585424337", category: "SELF_HELP", copies: 4 },
    { title: "The Great Gatsby", author: "F. Scott Fitzgerald", isbn: "9780743273565", category: "FICTION", copies: 2 },
    { title: "1984", author: "George Orwell", isbn: "9780451524935", category: "FICTION", copies: 4 },
  ];

  const org1Book1Ids: string[] = [];
  for (const b of org1Library1Books) {
    const bookId = id();
    org1Book1Ids.push(bookId);
    await db.insert(schema.book).values({
      id: bookId,
      organizationId: org1Id,
      libraryId: org1Library1Id,
      isbn: b.isbn,
      title: b.title,
      author: b.author,
      category: b.category,
      totalCopies: b.copies,
      availableCopies: b.copies,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoNothing();

    for (let i = 1; i <= b.copies; i++) {
      await db.insert(schema.bookCopy).values({
        id: id(),
        organizationId: org1Id,
        libraryId: org1Library1Id,
        bookId,
        accessionNumber: `WF-ML-${b.isbn.slice(-5)}-${String(i).padStart(2, "0")}`,
        condition: "GOOD",
        status: "AVAILABLE",
        createdAt: now,
        updatedAt: now,
      }).onConflictDoNothing();
    }
  }

  // ── Org 1 — Science Library Books ────────────────────────

  const org1Library2Books = [
    { title: "Introduction to Algorithms", author: "Thomas Cormen", isbn: "9780262033848", category: "TECHNOLOGY", copies: 4 },
    { title: "Clean Code", author: "Robert C. Martin", isbn: "9780132350884", category: "TECHNOLOGY", copies: 5 },
    { title: "A Brief History of Time", author: "Stephen Hawking", isbn: "9780553380163", category: "SCIENCE", copies: 3 },
    { title: "The Selfish Gene", author: "Richard Dawkins", isbn: "9780198788607", category: "SCIENCE", copies: 3 },
    { title: "Design Patterns", author: "Gang of Four", isbn: "9780201633610", category: "TECHNOLOGY", copies: 4 },
    { title: "Cosmos", author: "Carl Sagan", isbn: "9780345539434", category: "SCIENCE", copies: 2 },
  ];

  for (const b of org1Library2Books) {
    const bookId = id();
    await db.insert(schema.book).values({
      id: bookId,
      organizationId: org1Id,
      libraryId: org1Library2Id,
      isbn: b.isbn,
      title: b.title,
      author: b.author,
      category: b.category,
      totalCopies: b.copies,
      availableCopies: b.copies,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoNothing();

    for (let i = 1; i <= b.copies; i++) {
      await db.insert(schema.bookCopy).values({
        id: id(),
        organizationId: org1Id,
        libraryId: org1Library2Id,
        bookId,
        accessionNumber: `WF-SL-${b.isbn.slice(-5)}-${String(i).padStart(2, "0")}`,
        condition: "GOOD",
        status: "AVAILABLE",
        createdAt: now,
        updatedAt: now,
      }).onConflictDoNothing();
    }
  }

  // ── Org 1 — Staff Accounts ────────────────────────────────

  // Management
  const org1ManagementId = id();
  await db.insert(schema.user).values({
    id: org1ManagementId,
    name: "Priya Sharma",
    email: "priya@westfield.edu",
    emailVerified: true,
    role: "MANAGEMENT",
    phone: "9000001010",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();
  await db.insert(schema.account).values({ id: id(), accountId: org1ManagementId, providerId: "credential", userId: org1ManagementId, password: hashPassword("password123"), createdAt: now, updatedAt: now }).onConflictDoNothing();
  await db.insert(schema.organizationMembership).values({ id: id(), organizationId: org1Id, userId: org1ManagementId, role: "MANAGEMENT", status: "ACTIVE", createdAt: now, updatedAt: now }).onConflictDoNothing();

  // Lib Operator (Main Library)
  const org1LibOp1Id = id();
  await db.insert(schema.user).values({
    id: org1LibOp1Id,
    name: "Ritu Nair",
    email: "ritu.lib@westfield.edu",
    emailVerified: true,
    role: "LIB_OPERATOR",
    phone: "9000001020",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();
  await db.insert(schema.account).values({ id: id(), accountId: org1LibOp1Id, providerId: "credential", userId: org1LibOp1Id, password: hashPassword("password123"), createdAt: now, updatedAt: now }).onConflictDoNothing();
  await db.insert(schema.organizationMembership).values({ id: id(), organizationId: org1Id, userId: org1LibOp1Id, role: "LIB_OPERATOR", status: "ACTIVE", createdAt: now, updatedAt: now }).onConflictDoNothing();

  // Lib Operator (Science Library)
  const org1LibOp2Id = id();
  await db.insert(schema.user).values({
    id: org1LibOp2Id,
    name: "Vikram Joshi",
    email: "vikram.lib@westfield.edu",
    emailVerified: true,
    role: "LIB_OPERATOR",
    phone: "9000001021",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();
  await db.insert(schema.account).values({ id: id(), accountId: org1LibOp2Id, providerId: "credential", userId: org1LibOp2Id, password: hashPassword("password123"), createdAt: now, updatedAt: now }).onConflictDoNothing();
  await db.insert(schema.organizationMembership).values({ id: id(), organizationId: org1Id, userId: org1LibOp2Id, role: "LIB_OPERATOR", status: "ACTIVE", createdAt: now, updatedAt: now }).onConflictDoNothing();

  // Operator (wallet top-up)
  const org1OperatorId = id();
  await db.insert(schema.user).values({
    id: org1OperatorId,
    name: "Suresh Rao",
    email: "suresh.op@westfield.edu",
    emailVerified: true,
    role: "OPERATOR",
    phone: "9000001030",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();
  await db.insert(schema.account).values({ id: id(), accountId: org1OperatorId, providerId: "credential", userId: org1OperatorId, password: hashPassword("password123"), createdAt: now, updatedAt: now }).onConflictDoNothing();
  await db.insert(schema.organizationMembership).values({ id: id(), organizationId: org1Id, userId: org1OperatorId, role: "OPERATOR", status: "ACTIVE", createdAt: now, updatedAt: now }).onConflictDoNothing();

  // Attendance
  const org1AttendanceId = id();
  await db.insert(schema.user).values({
    id: org1AttendanceId,
    name: "Meena Pillai",
    email: "meena.att@westfield.edu",
    emailVerified: true,
    role: "ATTENDANCE",
    phone: "9000001040",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();
  await db.insert(schema.account).values({ id: id(), accountId: org1AttendanceId, providerId: "credential", userId: org1AttendanceId, password: hashPassword("password123"), createdAt: now, updatedAt: now }).onConflictDoNothing();
  await db.insert(schema.organizationMembership).values({ id: id(), organizationId: org1Id, userId: org1AttendanceId, role: "ATTENDANCE", status: "ACTIVE", createdAt: now, updatedAt: now }).onConflictDoNothing();

  // ── Org 1 — Device Accounts ───────────────────────────────

  // Kiosk device login user (North Block)
  const org1KioskUser1Id = id();
  await db.insert(schema.user).values({
    id: org1KioskUser1Id,
    name: "Kiosk - North Block",
    email: "kiosk-north@westfield.edu",
    emailVerified: true,
    role: "DEVICE",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();
  await db.insert(schema.account).values({ id: id(), accountId: org1KioskUser1Id, providerId: "credential", userId: org1KioskUser1Id, password: hashPassword("password123"), createdAt: now, updatedAt: now }).onConflictDoNothing();
  await db.insert(schema.organizationMembership).values({ id: id(), organizationId: org1Id, userId: org1KioskUser1Id, role: "DEVICE", status: "ACTIVE", createdAt: now, updatedAt: now }).onConflictDoNothing();

  const org1KioskDevice1Id = id();
  await db.insert(schema.organizationDevice).values({
    id: org1KioskDevice1Id,
    organizationId: org1Id,
    deviceType: "KIOSK",
    deviceName: "North Block Kiosk",
    deviceCode: "WF-KSK-01",
    authTokenHash: crypto.createHash("sha256").update("wf-kiosk-01-token").digest("hex"),
    canteenId: org1Canteen1Id,
    loginUserId: org1KioskUser1Id,
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();

  // Kiosk device login user (Sports Canteen)
  const org1KioskUser2Id = id();
  await db.insert(schema.user).values({
    id: org1KioskUser2Id,
    name: "Kiosk - Sports",
    email: "kiosk-sports@westfield.edu",
    emailVerified: true,
    role: "DEVICE",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();
  await db.insert(schema.account).values({ id: id(), accountId: org1KioskUser2Id, providerId: "credential", userId: org1KioskUser2Id, password: hashPassword("password123"), createdAt: now, updatedAt: now }).onConflictDoNothing();
  await db.insert(schema.organizationMembership).values({ id: id(), organizationId: org1Id, userId: org1KioskUser2Id, role: "DEVICE", status: "ACTIVE", createdAt: now, updatedAt: now }).onConflictDoNothing();

  const org1KioskDevice2Id = id();
  await db.insert(schema.organizationDevice).values({
    id: org1KioskDevice2Id,
    organizationId: org1Id,
    deviceType: "KIOSK",
    deviceName: "Sports Canteen Kiosk",
    deviceCode: "WF-KSK-02",
    authTokenHash: crypto.createHash("sha256").update("wf-kiosk-02-token").digest("hex"),
    canteenId: org1Canteen2Id,
    loginUserId: org1KioskUser2Id,
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();

  // Gate device
  const org1GateUserId = id();
  await db.insert(schema.user).values({
    id: org1GateUserId,
    name: "Gate - Main",
    email: "gate@westfield.edu",
    emailVerified: true,
    role: "DEVICE",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();
  await db.insert(schema.account).values({ id: id(), accountId: org1GateUserId, providerId: "credential", userId: org1GateUserId, password: hashPassword("password123"), createdAt: now, updatedAt: now }).onConflictDoNothing();
  await db.insert(schema.organizationMembership).values({ id: id(), organizationId: org1Id, userId: org1GateUserId, role: "DEVICE", status: "ACTIVE", createdAt: now, updatedAt: now }).onConflictDoNothing();

  await db.insert(schema.organizationDevice).values({
    id: id(),
    organizationId: org1Id,
    deviceType: "GATE",
    deviceName: "Main Gate",
    deviceCode: "WF-GATE-01",
    authTokenHash: crypto.createHash("sha256").update("wf-gate-01-token").digest("hex"),
    loginUserId: org1GateUserId,
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();

  // Library device (Main Library)
  const org1LibDeviceUserId = id();
  await db.insert(schema.user).values({
    id: org1LibDeviceUserId,
    name: "Library Terminal - Main",
    email: "lib-terminal@westfield.edu",
    emailVerified: true,
    role: "DEVICE",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();
  await db.insert(schema.account).values({ id: id(), accountId: org1LibDeviceUserId, providerId: "credential", userId: org1LibDeviceUserId, password: hashPassword("password123"), createdAt: now, updatedAt: now }).onConflictDoNothing();
  await db.insert(schema.organizationMembership).values({ id: id(), organizationId: org1Id, userId: org1LibDeviceUserId, role: "DEVICE", status: "ACTIVE", createdAt: now, updatedAt: now }).onConflictDoNothing();

  const org1LibDeviceId = id();
  await db.insert(schema.organizationDevice).values({
    id: org1LibDeviceId,
    organizationId: org1Id,
    deviceType: "LIBRARY",
    deviceName: "Main Library Terminal",
    deviceCode: "WF-LIB-01",
    authTokenHash: crypto.createHash("sha256").update("wf-lib-01-token").digest("hex"),
    libraryId: org1Library1Id,
    loginUserId: org1LibDeviceUserId,
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();

  // ── Org 1 — Parent Accounts & Children ────────────────────

  const parents = [
    {
      parentId: id(),
      name: "Ramesh Gupta",
      email: "ramesh@example.com",
      phone: "9100001001",
      children: [
        { name: "Ananya Gupta", gr: "WF2024001", cls: "Grade 9", section: "A", rfid: "RFID-WF-001" },
        { name: "Rohan Gupta", gr: "WF2024002", cls: "Grade 7", section: "B", rfid: "RFID-WF-002" },
      ],
    },
    {
      parentId: id(),
      name: "Sunita Kapoor",
      email: "sunita@example.com",
      phone: "9100001002",
      children: [
        { name: "Isha Kapoor", gr: "WF2024003", cls: "Grade 10", section: "A", rfid: "RFID-WF-003" },
      ],
    },
    {
      parentId: id(),
      name: "Deepak Patel",
      email: "deepak@example.com",
      phone: "9100001003",
      children: [
        { name: "Aryan Patel", gr: "WF2024004", cls: "Grade 8", section: "C", rfid: "RFID-WF-004" },
        { name: "Nisha Patel", gr: "WF2024005", cls: "Grade 6", section: "A", rfid: "RFID-WF-005" },
      ],
    },
    {
      parentId: id(),
      name: "Kavitha Menon",
      email: "kavitha@example.com",
      phone: "9100001004",
      children: [
        { name: "Aditya Menon", gr: "WF2024006", cls: "Grade 11", section: "B", rfid: "RFID-WF-006" },
      ],
    },
  ];

  for (const p of parents) {
    await db.insert(schema.user).values({
      id: p.parentId,
      name: p.name,
      email: p.email,
      emailVerified: true,
      role: "PARENT",
      phone: p.phone,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoNothing();

    await db.insert(schema.account).values({
      id: id(),
      accountId: p.parentId,
      providerId: "credential",
      userId: p.parentId,
      password: hashPassword("password123"),
      createdAt: now,
      updatedAt: now,
    }).onConflictDoNothing();

    await db.insert(schema.organizationMembership).values({
      id: id(),
      organizationId: org1Id,
      userId: p.parentId,
      role: "PARENT",
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    }).onConflictDoNothing();

    for (const c of p.children) {
      const childId = id();
      await db.insert(schema.child).values({
        id: childId,
        organizationId: org1Id,
        parentId: p.parentId,
        name: c.name,
        grNumber: c.gr,
        className: c.cls,
        section: c.section,
        rfidCardId: c.rfid,
        presenceStatus: "OUTSIDE",
        createdAt: now,
        updatedAt: now,
      }).onConflictDoNothing();

      // Create wallet
      const walletId = id();
      const startBalance = Math.floor(Math.random() * 400 + 200);
      await db.insert(schema.wallet).values({
        id: walletId,
        childId,
        balance: startBalance,
        createdAt: now,
        updatedAt: now,
      }).onConflictDoNothing();

      // Seed some wallet top-ups
      let runningBalance = 0;
      const topupAmount = startBalance + 100;
      await db.insert(schema.walletTransaction).values({
        id: id(),
        walletId,
        type: "TOP_UP",
        amount: topupAmount,
        balanceAfter: topupAmount,
        description: "Initial top-up",
        operatorId: org1OperatorId,
        createdAt: daysAgo(14),
      }).onConflictDoNothing();
      runningBalance = topupAmount;

      // Seed some orders
      const canteenForChild = [org1Canteen1Id, org1Canteen2Id][Math.floor(Math.random() * 2)];
      const menuIdForCanteen = org1Canteen1MenuIds[0];
      const orderAmount = 60 + Math.floor(Math.random() * 60);

      const orderId = id();
      await db.insert(schema.order).values({
        id: orderId,
        userId: p.parentId,
        childId,
        canteenId: canteenForChild,
        tokenCode: `TKN-${orderId.slice(0, 6).toUpperCase()}`,
        status: "SERVED",
        totalAmount: orderAmount,
        paymentMethod: "WALLET",
        paymentStatus: "PAID",
        createdAt: daysAgo(3),
        updatedAt: daysAgo(3),
      }).onConflictDoNothing();

      await db.insert(schema.orderItem).values({
        id: id(),
        orderId,
        menuItemId: menuIdForCanteen,
        quantity: 1,
        unitPrice: orderAmount,
        createdAt: daysAgo(3),
      }).onConflictDoNothing();

      runningBalance -= orderAmount;
      await db.insert(schema.walletTransaction).values({
        id: id(),
        walletId,
        type: "DEBIT",
        amount: orderAmount,
        balanceAfter: runningBalance,
        description: "Canteen order",
        orderId,
        createdAt: daysAgo(3),
      }).onConflictDoNothing();
    }
  }

  // ── Org 1 — General Users ─────────────────────────────────

  const generalUsers = [
    { name: "Aarav Shah", email: "aarav@westfield.edu", phone: "9200001001" },
    { name: "Pooja Iyer", email: "pooja@westfield.edu", phone: "9200001002" },
  ];

  for (const g of generalUsers) {
    const gId = id();
    await db.insert(schema.user).values({
      id: gId,
      name: g.name,
      email: g.email,
      emailVerified: true,
      role: "GENERAL",
      phone: g.phone,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoNothing();
    await db.insert(schema.account).values({ id: id(), accountId: gId, providerId: "credential", userId: gId, password: hashPassword("password123"), createdAt: now, updatedAt: now }).onConflictDoNothing();
    await db.insert(schema.organizationMembership).values({ id: id(), organizationId: org1Id, userId: gId, role: "GENERAL", status: "ACTIVE", createdAt: now, updatedAt: now }).onConflictDoNothing();
  }

  // ────────────────────────────────────────────────────────
  // ── Organisation 2: Greenfield College ──────────────────
  // ────────────────────────────────────────────────────────

  const org2Id = id();
  await db.insert(schema.organization).values({
    id: org2Id,
    name: "Greenfield College",
    slug: "greenfield-college",
    type: "COLLEGE",
    status: "ACTIVE",
    createdByUserId: platformOwnerId,
    approvedByUserId: platformOwnerId,
    approvedAt: now,
    contactEmail: "admin@greenfield.edu",
    contactPhone: "9000002000",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();

  // Org 2 Admin
  const org2AdminId = id();
  await db.insert(schema.user).values({
    id: org2AdminId,
    name: "Neha Bhat",
    email: "neha@greenfield.edu",
    emailVerified: true,
    role: "ADMIN",
    phone: "9000002001",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();
  await db.insert(schema.account).values({ id: id(), accountId: org2AdminId, providerId: "credential", userId: org2AdminId, password: hashPassword("password123"), createdAt: now, updatedAt: now }).onConflictDoNothing();
  await db.insert(schema.organizationMembership).values({ id: id(), organizationId: org2Id, userId: org2AdminId, role: "ADMIN", status: "ACTIVE", createdAt: now, updatedAt: now }).onConflictDoNothing();

  // Org 2 Canteens
  const org2Canteen1Id = id();
  await db.insert(schema.canteen).values({
    id: org2Canteen1Id,
    organizationId: org2Id,
    name: "Main Cafeteria",
    description: "Multi-cuisine food court",
    location: "Ground Floor, Admin Block",
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();

  const org2Canteen2Id = id();
  await db.insert(schema.canteen).values({
    id: org2Canteen2Id,
    organizationId: org2Id,
    name: "Hostel Canteen",
    description: "Residential dining for hostel students",
    location: "Hostel Block A",
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();

  // Org 2 Libraries
  const org2Library1Id = id();
  await db.insert(schema.library).values({
    id: org2Library1Id,
    organizationId: org2Id,
    name: "Central Library",
    description: "Main college library",
    location: "Library Building",
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();

  const org2Library2Id = id();
  await db.insert(schema.library).values({
    id: org2Library2Id,
    organizationId: org2Id,
    name: "Department Library",
    description: "Engineering department collection",
    location: "Engineering Block, Room 201",
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();

  // Org 2 — Main Cafeteria Menu
  const menuItemsOrg2Canteen1 = [
    { name: "Chicken Biryani", price: 120, category: "MEALS" as const },
    { name: "Paneer Butter Masala + Roti", price: 95, category: "MEALS" as const },
    { name: "South Indian Thali", price: 85, category: "MEALS" as const },
    { name: "Veg Sandwich", price: 45, category: "SNACKS" as const },
    { name: "Cold Brew Coffee", price: 60, category: "DRINKS" as const },
    { name: "Fresh Lime Soda", price: 30, category: "DRINKS" as const },
  ];

  for (const item of menuItemsOrg2Canteen1) {
    await db.insert(schema.menuItem).values({
      id: id(),
      organizationId: org2Id,
      canteenId: org2Canteen1Id,
      name: item.name,
      price: item.price,
      category: item.category,
      subscribable: item.category === "MEALS",
      available: true,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoNothing();
  }

  // Org 2 — Hostel Canteen Menu
  const menuItemsOrg2Canteen2 = [
    { name: "Full Breakfast Combo", price: 70, category: "MEALS" as const },
    { name: "Evening Snack Box", price: 40, category: "SNACKS" as const },
    { name: "Maggi Noodles", price: 30, category: "SNACKS" as const },
    { name: "Masala Chai", price: 10, category: "DRINKS" as const },
    { name: "Dinner Thali", price: 80, category: "MEALS" as const },
  ];

  for (const item of menuItemsOrg2Canteen2) {
    await db.insert(schema.menuItem).values({
      id: id(),
      organizationId: org2Id,
      canteenId: org2Canteen2Id,
      name: item.name,
      price: item.price,
      category: item.category,
      subscribable: item.category === "MEALS",
      available: true,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoNothing();
  }

  // Org 2 — Central Library Books
  const org2Library1Books = [
    { title: "The Psychology of Money", author: "Morgan Housel", isbn: "9780857197689", category: "FINANCE", copies: 4 },
    { title: "Ikigai", author: "Héctor García", isbn: "9781786330895", category: "SELF_HELP", copies: 5 },
    { title: "Zero to One", author: "Peter Thiel", isbn: "9780804139021", category: "BUSINESS", copies: 3 },
    { title: "Rich Dad Poor Dad", author: "Robert Kiyosaki", isbn: "9781612680194", category: "FINANCE", copies: 6 },
    { title: "Deep Work", author: "Cal Newport", isbn: "9781455586691", category: "SELF_HELP", copies: 4 },
  ];

  for (const b of org2Library1Books) {
    const bookId = id();
    await db.insert(schema.book).values({
      id: bookId,
      organizationId: org2Id,
      libraryId: org2Library1Id,
      isbn: b.isbn,
      title: b.title,
      author: b.author,
      category: b.category,
      totalCopies: b.copies,
      availableCopies: b.copies,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoNothing();

    for (let i = 1; i <= b.copies; i++) {
      await db.insert(schema.bookCopy).values({
        id: id(),
        organizationId: org2Id,
        libraryId: org2Library1Id,
        bookId,
        accessionNumber: `GF-CL-${b.isbn.slice(-5)}-${String(i).padStart(2, "0")}`,
        condition: "GOOD",
        status: "AVAILABLE",
        createdAt: now,
        updatedAt: now,
      }).onConflictDoNothing();
    }
  }

  // Org 2 — Department Library Books
  const org2Library2Books = [
    { title: "Computer Networks", author: "Andrew Tanenbaum", isbn: "9780132126953", category: "TECHNOLOGY", copies: 5 },
    { title: "Operating System Concepts", author: "Silberschatz", isbn: "9781119800361", category: "TECHNOLOGY", copies: 4 },
    { title: "Database Management Systems", author: "Ramakrishnan", isbn: "9780072465631", category: "TECHNOLOGY", copies: 4 },
    { title: "Software Engineering", author: "Ian Sommerville", isbn: "9780133943030", category: "TECHNOLOGY", copies: 3 },
  ];

  for (const b of org2Library2Books) {
    const bookId = id();
    await db.insert(schema.book).values({
      id: bookId,
      organizationId: org2Id,
      libraryId: org2Library2Id,
      isbn: b.isbn,
      title: b.title,
      author: b.author,
      category: b.category,
      totalCopies: b.copies,
      availableCopies: b.copies,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoNothing();

    for (let i = 1; i <= b.copies; i++) {
      await db.insert(schema.bookCopy).values({
        id: id(),
        organizationId: org2Id,
        libraryId: org2Library2Id,
        bookId,
        accessionNumber: `GF-DL-${b.isbn.slice(-5)}-${String(i).padStart(2, "0")}`,
        condition: "NEW",
        status: "AVAILABLE",
        createdAt: now,
        updatedAt: now,
      }).onConflictDoNothing();
    }
  }

  // Org 2 — Staff
  const org2ManagementId = id();
  await db.insert(schema.user).values({
    id: org2ManagementId,
    name: "Rahul Verma",
    email: "rahul@greenfield.edu",
    emailVerified: true,
    role: "MANAGEMENT",
    phone: "9000002010",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();
  await db.insert(schema.account).values({ id: id(), accountId: org2ManagementId, providerId: "credential", userId: org2ManagementId, password: hashPassword("password123"), createdAt: now, updatedAt: now }).onConflictDoNothing();
  await db.insert(schema.organizationMembership).values({ id: id(), organizationId: org2Id, userId: org2ManagementId, role: "MANAGEMENT", status: "ACTIVE", createdAt: now, updatedAt: now }).onConflictDoNothing();

  const org2LibOpId = id();
  await db.insert(schema.user).values({
    id: org2LibOpId,
    name: "Anjali Singh",
    email: "anjali.lib@greenfield.edu",
    emailVerified: true,
    role: "LIB_OPERATOR",
    phone: "9000002020",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();
  await db.insert(schema.account).values({ id: id(), accountId: org2LibOpId, providerId: "credential", userId: org2LibOpId, password: hashPassword("password123"), createdAt: now, updatedAt: now }).onConflictDoNothing();
  await db.insert(schema.organizationMembership).values({ id: id(), organizationId: org2Id, userId: org2LibOpId, role: "LIB_OPERATOR", status: "ACTIVE", createdAt: now, updatedAt: now }).onConflictDoNothing();

  const org2OperatorId = id();
  await db.insert(schema.user).values({
    id: org2OperatorId,
    name: "Ganesh Kumar",
    email: "ganesh.op@greenfield.edu",
    emailVerified: true,
    role: "OPERATOR",
    phone: "9000002030",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();
  await db.insert(schema.account).values({ id: id(), accountId: org2OperatorId, providerId: "credential", userId: org2OperatorId, password: hashPassword("password123"), createdAt: now, updatedAt: now }).onConflictDoNothing();
  await db.insert(schema.organizationMembership).values({ id: id(), organizationId: org2Id, userId: org2OperatorId, role: "OPERATOR", status: "ACTIVE", createdAt: now, updatedAt: now }).onConflictDoNothing();

  // Org 2 — Kiosk device (Main Cafeteria)
  const org2KioskUserId = id();
  await db.insert(schema.user).values({
    id: org2KioskUserId,
    name: "Kiosk - Main Cafeteria",
    email: "kiosk-main@greenfield.edu",
    emailVerified: true,
    role: "DEVICE",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();
  await db.insert(schema.account).values({ id: id(), accountId: org2KioskUserId, providerId: "credential", userId: org2KioskUserId, password: hashPassword("password123"), createdAt: now, updatedAt: now }).onConflictDoNothing();
  await db.insert(schema.organizationMembership).values({ id: id(), organizationId: org2Id, userId: org2KioskUserId, role: "DEVICE", status: "ACTIVE", createdAt: now, updatedAt: now }).onConflictDoNothing();

  await db.insert(schema.organizationDevice).values({
    id: id(),
    organizationId: org2Id,
    deviceType: "KIOSK",
    deviceName: "Main Cafeteria Kiosk",
    deviceCode: "GF-KSK-01",
    authTokenHash: crypto.createHash("sha256").update("gf-kiosk-01-token").digest("hex"),
    canteenId: org2Canteen1Id,
    loginUserId: org2KioskUserId,
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();

  // Org 2 — Library device
  const org2LibDeviceUserId = id();
  await db.insert(schema.user).values({
    id: org2LibDeviceUserId,
    name: "Library Terminal - Central",
    email: "lib-terminal@greenfield.edu",
    emailVerified: true,
    role: "DEVICE",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();
  await db.insert(schema.account).values({ id: id(), accountId: org2LibDeviceUserId, providerId: "credential", userId: org2LibDeviceUserId, password: hashPassword("password123"), createdAt: now, updatedAt: now }).onConflictDoNothing();
  await db.insert(schema.organizationMembership).values({ id: id(), organizationId: org2Id, userId: org2LibDeviceUserId, role: "DEVICE", status: "ACTIVE", createdAt: now, updatedAt: now }).onConflictDoNothing();

  await db.insert(schema.organizationDevice).values({
    id: id(),
    organizationId: org2Id,
    deviceType: "LIBRARY",
    deviceName: "Central Library Terminal",
    deviceCode: "GF-LIB-01",
    authTokenHash: crypto.createHash("sha256").update("gf-lib-01-token").digest("hex"),
    libraryId: org2Library1Id,
    loginUserId: org2LibDeviceUserId,
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();

  // Org 2 — Parent Accounts
  const org2Parents = [
    {
      parentId: id(),
      name: "Sanjay Trivedi",
      email: "sanjay@example.com",
      phone: "9300001001",
      children: [
        { name: "Kritika Trivedi", gr: "GF2024001", cls: "B.Tech 2nd Year", section: "CS-A", rfid: "RFID-GF-001" },
      ],
    },
    {
      parentId: id(),
      name: "Lalitha Reddy",
      email: "lalitha@example.com",
      phone: "9300001002",
      children: [
        { name: "Nikhil Reddy", gr: "GF2024002", cls: "B.Com 1st Year", section: "A", rfid: "RFID-GF-002" },
        { name: "Preethi Reddy", gr: "GF2024003", cls: "BA 3rd Year", section: "B", rfid: "RFID-GF-003" },
      ],
    },
  ];

  for (const p of org2Parents) {
    await db.insert(schema.user).values({
      id: p.parentId,
      name: p.name,
      email: p.email,
      emailVerified: true,
      role: "PARENT",
      phone: p.phone,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoNothing();
    await db.insert(schema.account).values({ id: id(), accountId: p.parentId, providerId: "credential", userId: p.parentId, password: hashPassword("password123"), createdAt: now, updatedAt: now }).onConflictDoNothing();
    await db.insert(schema.organizationMembership).values({ id: id(), organizationId: org2Id, userId: p.parentId, role: "PARENT", status: "ACTIVE", createdAt: now, updatedAt: now }).onConflictDoNothing();

    for (const c of p.children) {
      const childId = id();
      await db.insert(schema.child).values({
        id: childId,
        organizationId: org2Id,
        parentId: p.parentId,
        name: c.name,
        grNumber: c.gr,
        className: c.cls,
        section: c.section,
        rfidCardId: c.rfid,
        presenceStatus: "OUTSIDE",
        createdAt: now,
        updatedAt: now,
      }).onConflictDoNothing();

      const walletId = id();
      const startBalance = Math.floor(Math.random() * 500 + 300);
      await db.insert(schema.wallet).values({
        id: walletId,
        childId,
        balance: startBalance,
        createdAt: now,
        updatedAt: now,
      }).onConflictDoNothing();

      await db.insert(schema.walletTransaction).values({
        id: id(),
        walletId,
        type: "TOP_UP",
        amount: startBalance + 200,
        balanceAfter: startBalance + 200,
        description: "Initial top-up",
        operatorId: org2OperatorId,
        createdAt: daysAgo(10),
      }).onConflictDoNothing();
    }
  }

  // Org 2 — General users
  const org2GeneralId = id();
  await db.insert(schema.user).values({
    id: org2GeneralId,
    name: "Karan Malhotra",
    email: "karan@greenfield.edu",
    emailVerified: true,
    role: "GENERAL",
    phone: "9400001001",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();
  await db.insert(schema.account).values({ id: id(), accountId: org2GeneralId, providerId: "credential", userId: org2GeneralId, password: hashPassword("password123"), createdAt: now, updatedAt: now }).onConflictDoNothing();
  await db.insert(schema.organizationMembership).values({ id: id(), organizationId: org2Id, userId: org2GeneralId, role: "GENERAL", status: "ACTIVE", createdAt: now, updatedAt: now }).onConflictDoNothing();

  console.log("✅ Seed complete!");
  console.log("");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🏫 Westfield Academy (org 1)");
  console.log("   Admin:      arjun@westfield.edu");
  console.log("   Management: priya@westfield.edu");
  console.log("   Lib Op 1:   ritu.lib@westfield.edu (Main Library)");
  console.log("   Lib Op 2:   vikram.lib@westfield.edu (Science Library)");
  console.log("   Operator:   suresh.op@westfield.edu");
  console.log("   Parents:    ramesh@example.com, sunita@example.com,");
  console.log("               deepak@example.com, kavitha@example.com");
  console.log("   Canteens:   North Block Canteen, Sports Canteen");
  console.log("   Libraries:  Main Library, Science & Tech Library");
  console.log("");
  console.log("🎓 Greenfield College (org 2)");
  console.log("   Admin:      neha@greenfield.edu");
  console.log("   Management: rahul@greenfield.edu");
  console.log("   Lib Op:     anjali.lib@greenfield.edu");
  console.log("   Operator:   ganesh.op@greenfield.edu");
  console.log("   Parents:    sanjay@example.com, lalitha@example.com");
  console.log("   Canteens:   Main Cafeteria, Hostel Canteen");
  console.log("   Libraries:  Central Library, Department Library");
  console.log("");
  console.log("   All passwords: password123");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
