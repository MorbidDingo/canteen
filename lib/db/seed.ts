import "dotenv/config";
import { and, eq } from "drizzle-orm";
import { db } from "./index";
import * as schema from "./schema";

type AppRole =
  | "PARENT"
  | "GENERAL"
  | "OWNER"
  | "ADMIN"
  | "OPERATOR"
  | "MANAGEMENT"
  | "LIB_OPERATOR"
  | "ATTENDANCE";

async function createUserWithRole(
  email: string,
  password: string,
  name: string,
  role: AppRole,
) {
  const existing = await db
    .select()
    .from(schema.user)
    .where(eq(schema.user.email, email));

  if (existing.length > 0) {
    if (existing[0].role !== role) {
      await db
        .update(schema.user)
        .set({ role, updatedAt: new Date() })
        .where(eq(schema.user.id, existing[0].id));
    }
    console.log(`  ⏭️  ${role} user (${email}) already exists, skipping...`);
    return { ...existing[0], role };
  }

  const { auth } = await import("../auth");
  const response = await auth.api.signUpEmail({
    body: { name, email, password },
  });

  if (response?.user) {
    await db
      .update(schema.user)
      .set({ role })
      .where(eq(schema.user.id, response.user.id));
    console.log(`  ✅ ${role} user created (${email} / ${password})`);
    return { ...response.user, role };
  }
  console.log(`  ⚠️  Failed to create ${role} user`);
  return null;
}

async function ensureDefaultOrganization(createdByUserId: string) {
  const [existingOrg] = await db
    .select()
    .from(schema.organization)
    .where(eq(schema.organization.slug, "default-org"))
    .limit(1);

  if (existingOrg) {
    return existingOrg;
  }

  const now = new Date();
  const [insertedOrg] = await db
    .insert(schema.organization)
    .values({
      name: "Default Organization",
      slug: "default-org",
      type: "SCHOOL",
      status: "ACTIVE",
      createdByUserId,
      approvedByUserId: createdByUserId,
      approvedAt: now,
      defaultTimezone: "Asia/Kolkata",
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return insertedOrg;
}

async function ensureMembership(userId: string, organizationId: string, role: AppRole) {
  const [existingMembership] = await db
    .select({ id: schema.organizationMembership.id })
    .from(schema.organizationMembership)
    .where(
      and(
        eq(schema.organizationMembership.organizationId, organizationId),
        eq(schema.organizationMembership.userId, userId),
        eq(schema.organizationMembership.role, role),
      ),
    )
    .limit(1);

  if (existingMembership) {
    return;
  }

  await db.insert(schema.organizationMembership).values({
    organizationId,
    userId,
    role,
    status: "ACTIVE",
    joinedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

async function ensurePlatformOwnerRole(userId: string) {
  const [ownerRole] = await db
    .select({ id: schema.platformUserRole.id })
    .from(schema.platformUserRole)
    .where(eq(schema.platformUserRole.userId, userId))
    .limit(1);

  if (ownerRole) return;

  await db.insert(schema.platformUserRole).values({
    userId,
    role: "PLATFORM_OWNER",
    status: "ACTIVE",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

async function seed() {
  // ─── Create Users ─────────────────────────────────────
  console.log("👤 Creating users...");

  const admin = await createUserWithRole(
    "admin@schoolcafe.com",
    "Admin@123",
    "Admin",
    "ADMIN"
  );

  const operator = await createUserWithRole(
    "operator@schoolcafe.com",
    "Operator@123",
    "Cafeteria Operator",
    "OPERATOR"
  );

  const management = await createUserWithRole(
    "management@schoolcafe.com",
    "Management@123",
    "School Manager",
    "MANAGEMENT"
  );

  const libOperator = await createUserWithRole(
    "librarian@schoolcafe.com",
    "Librarian@123",
    "Library Operator",
    "LIB_OPERATOR"
  );

  const parent = await createUserWithRole(
    "parent@schoolcafe.com",
    "Parent@123",
    "Demo Parent",
    "PARENT"
  );

  const attendance = await createUserWithRole(
    "attendance@schoolcafe.com",
    "Attendance@123",
    "Attendance Officer",
    "ATTENDANCE"
  );

  const tenantOwner = await createUserWithRole(
    "tenant.owner@schoolcafe.com",
    "TenantOwner@123",
    "Tenant Owner",
    "OWNER"
  );

  const personalOwnerEmail = process.env.MY_ACCOUNT_EMAIL?.trim().toLowerCase() || "owner@certe.in";
  const personalOwnerPassword = process.env.MY_ACCOUNT_PASSWORD || "Owner@123";
  const personalOwnerName = process.env.MY_ACCOUNT_NAME || "Certe Owner";
  const personalOwner = await createUserWithRole(
    personalOwnerEmail,
    personalOwnerPassword,
    personalOwnerName,
    "OWNER"
  );

  // ─── Create Default Organization + Memberships ─────────
  if (!management && !admin) {
    throw new Error("Cannot create default organization without admin or management user.");
  }

  const orgOwnerUserId = management?.id ?? admin!.id;
  const defaultOrg = await ensureDefaultOrganization(orgOwnerUserId);
  console.log(`\n🏫 Using organization: ${defaultOrg.name} (${defaultOrg.slug})`);

  if (admin) await ensureMembership(admin.id, defaultOrg.id, "ADMIN");
  if (tenantOwner) await ensureMembership(tenantOwner.id, defaultOrg.id, "OWNER");
  if (personalOwner) await ensureMembership(personalOwner.id, defaultOrg.id, "OWNER");
  if (operator) await ensureMembership(operator.id, defaultOrg.id, "OPERATOR");
  if (management) await ensureMembership(management.id, defaultOrg.id, "MANAGEMENT");
  if (libOperator) await ensureMembership(libOperator.id, defaultOrg.id, "LIB_OPERATOR");
  if (attendance) await ensureMembership(attendance.id, defaultOrg.id, "ATTENDANCE");
  if (parent) await ensureMembership(parent.id, defaultOrg.id, "PARENT");

  if (admin) {
    await ensurePlatformOwnerRole(admin.id);
    console.log("  ✅ Platform owner role assigned to admin user");
  }

  if (personalOwner) {
    await ensurePlatformOwnerRole(personalOwner.id);
    console.log(`  ✅ Platform owner role assigned to personal account (${personalOwnerEmail})`);
  }

  // ─── Create Test Children + Wallets ───────────────────
  if (parent) {
    console.log("\n👧 Creating test children...");

    const existingChildren = await db
      .select()
      .from(schema.child)
      .where(eq(schema.child.parentId, parent.id));

    if (existingChildren.length > 0) {
      console.log(`  ⏭️  Children already exist for demo parent, skipping...`);
    } else {
      const testChildren = [
        {
          organizationId: defaultOrg.id,
          parentId: parent.id,
          name: "Arjun Sharma",
          grNumber: "GR-2024-001",
          className: "Class 5",
          section: "A",
          rfidCardId: "CARD001",
        },
        {
          organizationId: defaultOrg.id,
          parentId: parent.id,
          name: "Priya Sharma",
          grNumber: "GR-2024-002",
          className: "Class 3",
          section: "B",
          rfidCardId: "CARD002",
        },
      ];

      for (const c of testChildren) {
        const [inserted] = await db
          .insert(schema.child)
          .values(c)
          .returning({ id: schema.child.id });

        // Create wallet for each child
        await db.insert(schema.wallet).values({
          childId: inserted.id,
          balance: 500,
        });

        // Create default parent controls
        await db.insert(schema.parentControl).values({
          childId: inserted.id,
          dailySpendLimit: 200,
          perOrderLimit: 100,
          blockedCategories: "[]",
          blockedItemIds: "[]",
        });

        console.log(`  ✅ ${c.name} (${c.grNumber}) — ₹500 wallet, RFID: ${c.rfidCardId}`);
      }
    }
  }

  // ─── Seed Menu Items ───────────────────────────────────
  console.log("\n🌱 Seeding menu items...");

  const menuItems = [
    // Snacks
    {
      name: "Samosa",
      description: "Crispy golden pastry filled with spiced potatoes and peas",
      price: 15,
      category: "SNACKS" as const,
      available: true,
    },
    {
      name: "Vada Pav",
      description: "Mumbai's favorite street food — spiced potato fritter in a pav bun",
      price: 20,
      category: "SNACKS" as const,
      available: true,
    },
    {
      name: "Pav Bhaji",
      description: "Buttery bread rolls served with mashed vegetable curry",
      price: 40,
      category: "SNACKS" as const,
      available: true,
    },
    {
      name: "Sandwich",
      description: "Grilled vegetable sandwich with cheese and chutney",
      price: 30,
      category: "SNACKS" as const,
      available: true,
    },
    {
      name: "French Fries",
      description: "Crispy golden fries with ketchup",
      price: 35,
      category: "SNACKS" as const,
      available: true,
    },

    // Meals
    {
      name: "Veg Thali",
      description: "Complete meal with roti, rice, dal, sabzi, and salad",
      price: 60,
      category: "MEALS" as const,
      available: true,
    },
    {
      name: "Fried Rice",
      description: "Indo-Chinese style fried rice with vegetables",
      price: 45,
      category: "MEALS" as const,
      available: true,
    },
    {
      name: "Chole Bhature",
      description: "Spiced chickpea curry served with fluffy fried bread",
      price: 50,
      category: "MEALS" as const,
      available: true,
    },
    {
      name: "Noodles",
      description: "Hakka noodles stir-fried with fresh vegetables",
      price: 40,
      category: "MEALS" as const,
      available: true,
    },

    // Drinks
    {
      name: "Mango Lassi",
      description: "Refreshing yogurt-based mango smoothie",
      price: 25,
      category: "DRINKS" as const,
      available: true,
    },
    {
      name: "Masala Chai",
      description: "Traditional Indian spiced tea",
      price: 10,
      category: "DRINKS" as const,
      available: true,
    },
    {
      name: "Fresh Lime Soda",
      description: "Chilled lime soda — sweet or salted",
      price: 20,
      category: "DRINKS" as const,
      available: true,
    },
    {
      name: "Cold Coffee",
      description: "Creamy iced coffee blended with milk",
      price: 30,
      category: "DRINKS" as const,
      available: true,
    },
    {
      name: "Buttermilk",
      description: "Cool spiced buttermilk (chaas)",
      price: 15,
      category: "DRINKS" as const,
      available: true,
    },

    // Packed Food (new category)
    {
      name: "Chips Packet",
      description: "Salted potato chips — 50g pack",
      price: 20,
      category: "PACKED_FOOD" as const,
      available: true,
    },
    {
      name: "Biscuits",
      description: "Cream biscuit pack — assorted flavors",
      price: 15,
      category: "PACKED_FOOD" as const,
      available: true,
    },
    {
      name: "Juice Box",
      description: "Mango or apple fruit juice — 200ml tetra pack",
      price: 25,
      category: "PACKED_FOOD" as const,
      available: true,
    },
    {
      name: "Granola Bar",
      description: "Oats and honey energy bar",
      price: 30,
      category: "PACKED_FOOD" as const,
      available: true,
    },
    {
      name: "Cake Slice",
      description: "Chocolate or vanilla cake slice (packaged)",
      price: 35,
      category: "PACKED_FOOD" as const,
      available: true,
    },
    {
      name: "Namkeen Mix",
      description: "Spiced mixture — 100g pouch",
      price: 15,
      category: "PACKED_FOOD" as const,
      available: true,
    },
    {
      name: "Chocolate Bar",
      description: "Milk chocolate bar — 40g",
      price: 25,
      category: "PACKED_FOOD" as const,
      available: true,
    },
    {
      name: "Dried Fruit Pack",
      description: "Mixed dry fruits and nuts — 50g pack",
      price: 40,
      category: "PACKED_FOOD" as const,
      available: true,
    },
  ];

  // Check if menu items already exist
  const existingItems = await db.select().from(schema.menuItem);
  if (existingItems.length > 0) {
    console.log(`  ⏭️  ${existingItems.length} menu items already exist, skipping...`);
  } else {
    for (const item of menuItems) {
      await db.insert(schema.menuItem).values({
        ...item,
        organizationId: defaultOrg.id,
      });
      console.log(`  ✅ ${item.name} (${item.category}) — ₹${item.price}`);
    }
    console.log(`\n🎉 Seeded ${menuItems.length} menu items successfully!`);
  }

  console.log("\n✨ Seed complete!");
  console.log("\n📋 Test Accounts:");
  console.log("  Admin:        admin@schoolcafe.com / Admin@123");
  console.log("  Operator:     operator@schoolcafe.com / Operator@123");
  console.log("  Management:   management@schoolcafe.com / Management@123");
  console.log("  Lib Operator: librarian@schoolcafe.com / Librarian@123");
  console.log("  Attendance:   attendance@schoolcafe.com / Attendance@123");
  console.log("  Parent:       parent@schoolcafe.com / Parent@123");
  console.log("  Children:     Arjun Sharma (CARD001), Priya Sharma (CARD002)");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  });
