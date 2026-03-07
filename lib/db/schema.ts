import { pgTable, text, boolean, doublePrecision, integer, timestamp } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ─── Better Auth Core Tables ─────────────────────────────

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),

  // App-specific fields
  role: text("role", { enum: ["PARENT", "ADMIN", "OPERATOR", "MANAGEMENT"] })
    .notNull()
    .default("PARENT"),
  phone: text("phone"),
  // Legacy flat fields (kept for backward compat, use `child` table instead)
  childName: text("child_name"),
  childGrNumber: text("child_gr_number"),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

// ─── Child (multi-child per parent) ──────────────────────

export const child = pgTable("child", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  parentId: text("parent_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  grNumber: text("gr_number").unique(),
  className: text("class_name"),
  section: text("section"),
  rfidCardId: text("rfid_card_id").unique(),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
});

// ─── Wallet ──────────────────────────────────────────────

export const wallet = pgTable("wallet", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  childId: text("child_id")
    .notNull()
    .unique()
    .references(() => child.id, { onDelete: "cascade" }),
  balance: doublePrecision("balance").notNull().default(0),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
});

export const walletTransaction = pgTable("wallet_transaction", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  walletId: text("wallet_id")
    .notNull()
    .references(() => wallet.id, { onDelete: "cascade" }),
  type: text("type", { enum: ["TOP_UP", "DEBIT", "REFUND"] }).notNull(),
  amount: doublePrecision("amount").notNull(),
  balanceAfter: doublePrecision("balance_after").notNull(),
  description: text("description"),
  orderId: text("order_id").references(() => order.id),
  operatorId: text("operator_id").references(() => user.id),
  razorpayPaymentId: text("razorpay_payment_id"),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
});

// ─── Parent Controls ─────────────────────────────────────

export const parentControl = pgTable("parent_control", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  childId: text("child_id")
    .notNull()
    .unique()
    .references(() => child.id, { onDelete: "cascade" }),
  dailySpendLimit: doublePrecision("daily_spend_limit"),
  perOrderLimit: doublePrecision("per_order_limit"),
  blockedCategories: text("blocked_categories").default("[]"),
  blockedItemIds: text("blocked_item_ids").default("[]"),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
});

// ─── Pre-Orders ──────────────────────────────────────────

export const preOrder = pgTable("pre_order", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  childId: text("child_id")
    .notNull()
    .references(() => child.id, { onDelete: "cascade" }),
  parentId: text("parent_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  scheduledDate: text("scheduled_date").notNull(),
  status: text("status", { enum: ["PENDING", "FULFILLED", "EXPIRED", "CANCELLED"] })
    .notNull()
    .default("PENDING"),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
});

export const preOrderItem = pgTable("pre_order_item", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  preOrderId: text("pre_order_id")
    .notNull()
    .references(() => preOrder.id, { onDelete: "cascade" }),
  menuItemId: text("menu_item_id")
    .notNull()
    .references(() => menuItem.id),
  quantity: integer("quantity").notNull().default(1),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
});

// ─── App Tables ──────────────────────────────────────────

export const menuItem = pgTable("menu_item", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  description: text("description"),
  price: doublePrecision("price").notNull(),
  category: text("category", { enum: ["SNACKS", "MEALS", "DRINKS", "PACKED_FOOD"] }).notNull(),
  imageUrl: text("image_url"),
  available: boolean("available").notNull().default(true),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
});

export const order = pgTable("order", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  childId: text("child_id").references(() => child.id),
  tokenCode: text("token_code"),
  status: text("status", {
    enum: ["PLACED", "PREPARING", "SERVED", "CANCELLED"],
  })
    .notNull()
    .default("PLACED"),
  totalAmount: doublePrecision("total_amount").notNull(),
  paymentMethod: text("payment_method", { enum: ["CASH", "UPI", "ONLINE", "WALLET"] }).notNull().default("CASH"),
  paymentStatus: text("payment_status", { enum: ["PAID", "UNPAID"] }).notNull().default("UNPAID"),
  razorpayOrderId: text("razorpay_order_id"),
  razorpayPaymentId: text("razorpay_payment_id"),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
});

export const orderItem = pgTable("order_item", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  orderId: text("order_id")
    .notNull()
    .references(() => order.id, { onDelete: "cascade" }),
  menuItemId: text("menu_item_id")
    .notNull()
    .references(() => menuItem.id),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: doublePrecision("unit_price").notNull(),
  instructions: text("instructions"),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
});

// ─── Relations ───────────────────────────────────────────

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  orders: many(order),
  children: many(child),
  preOrders: many(preOrder),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));

export const childRelations = relations(child, ({ one, many }) => ({
  parent: one(user, { fields: [child.parentId], references: [user.id] }),
  wallet: one(wallet),
  parentControl: one(parentControl),
  orders: many(order),
  preOrders: many(preOrder),
}));

export const walletRelations = relations(wallet, ({ one, many }) => ({
  child: one(child, { fields: [wallet.childId], references: [child.id] }),
  transactions: many(walletTransaction),
}));

export const walletTransactionRelations = relations(walletTransaction, ({ one }) => ({
  wallet: one(wallet, { fields: [walletTransaction.walletId], references: [wallet.id] }),
  order: one(order, { fields: [walletTransaction.orderId], references: [order.id] }),
  operator: one(user, { fields: [walletTransaction.operatorId], references: [user.id] }),
}));

export const parentControlRelations = relations(parentControl, ({ one }) => ({
  child: one(child, { fields: [parentControl.childId], references: [child.id] }),
}));

export const preOrderRelations = relations(preOrder, ({ one, many }) => ({
  child: one(child, { fields: [preOrder.childId], references: [child.id] }),
  parent: one(user, { fields: [preOrder.parentId], references: [user.id] }),
  items: many(preOrderItem),
}));

export const preOrderItemRelations = relations(preOrderItem, ({ one }) => ({
  preOrder: one(preOrder, { fields: [preOrderItem.preOrderId], references: [preOrder.id] }),
  menuItem: one(menuItem, { fields: [preOrderItem.menuItemId], references: [menuItem.id] }),
}));

export const orderRelations = relations(order, ({ one, many }) => ({
  user: one(user, { fields: [order.userId], references: [user.id] }),
  child: one(child, { fields: [order.childId], references: [child.id] }),
  items: many(orderItem),
}));

export const orderItemRelations = relations(orderItem, ({ one }) => ({
  order: one(order, { fields: [orderItem.orderId], references: [order.id] }),
  menuItem: one(menuItem, { fields: [orderItem.menuItemId], references: [menuItem.id] }),
}));

export const menuItemRelations = relations(menuItem, ({ many }) => ({
  orderItems: many(orderItem),
  preOrderItems: many(preOrderItem),
}));
