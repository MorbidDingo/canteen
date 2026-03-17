import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "./index";
import * as schema from "./schema";

async function createUserWithRole(
  email: string,
  password: string,
  name: string,
  role: "PARENT" | "GENERAL" | "ADMIN" | "OPERATOR" | "MANAGEMENT" | "LIB_OPERATOR" | "ATTENDANCE"
) {
  const existing = await db
    .select()
    .from(schema.user)
    .where(eq(schema.user.email, email));

  if (existing.length > 0) {
    console.log(`  ⏭️  ${role} user (${email}) already exists, skipping...`);
    return existing[0];
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
          parentId: parent.id,
          name: "Arjun Sharma",
          grNumber: "GR-2024-001",
          className: "Class 5",
          section: "A",
          rfidCardId: "CARD001",
        },
        {
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
      await db.insert(schema.menuItem).values(item);
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
