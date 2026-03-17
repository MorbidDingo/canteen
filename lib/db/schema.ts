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
  role: text("role", { enum: ["PARENT", "ADMIN", "OPERATOR", "MANAGEMENT", "LIB_OPERATOR", "ATTENDANCE"] })
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
  presenceStatus: text("presence_status", { enum: ["INSIDE", "OUTSIDE"] })
    .notNull()
    .default("OUTSIDE"),
  lastGateTapAt: timestamp("last_gate_tap_at"),
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
  type: text("type", { enum: ["TOP_UP", "DEBIT", "REFUND", "LIBRARY_FINE"] }).notNull(),
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
  blockedBookCategories: text("blocked_book_categories").default("[]"),
  blockedBookAuthors: text("blocked_book_authors").default("[]"),
  blockedBookIds: text("blocked_book_ids").default("[]"),
  preIssueBookId: text("pre_issue_book_id"),
  preIssueExpiresAt: timestamp("pre_issue_expires_at"),
  preIssueDeclinedUntil: timestamp("pre_issue_declined_until"),
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
  mode: text("mode", { enum: ["ONE_DAY", "SUBSCRIPTION"] })
    .notNull()
    .default("ONE_DAY"),
  scheduledDate: text("scheduled_date").notNull(),
  subscriptionUntil: text("subscription_until"),
  lastFulfilledDate: text("last_fulfilled_date"),
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
  breakName: text("break_name"),
  lastFulfilledOn: text("last_fulfilled_on"),
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
  availableUnits: integer("available_units"), // null = unlimited, 0 = sold out
  subscribable: boolean("subscribable").notNull().default(true), // whether item can be selected for subscriptions
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
  parentNotifications: many(parentNotification),
  certeSubscriptions: many(certeSubscription),
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
  bookIssuances: many(bookIssuance),
  gateLogs: many(gateLog),
  parentNotifications: many(parentNotification),
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
  discounts: many(discount),
}));

// ─── Discounts ───────────────────────────────────────────

export const discount = pgTable("discount", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  menuItemId: text("menu_item_id")
    .notNull()
    .references(() => menuItem.id, { onDelete: "cascade" }),
  type: text("type", { enum: ["PERCENTAGE", "FLAT"] }).notNull(),
  value: doublePrecision("value").notNull(),
  reason: text("reason"),
  mode: text("mode", { enum: ["AUTO", "MANUAL"] }).notNull().default("MANUAL"),
  active: boolean("active").notNull().default(false),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
});

export const discountRelations = relations(discount, ({ one }) => ({
  menuItem: one(menuItem, { fields: [discount.menuItemId], references: [menuItem.id] }),
}));

// ─── Audit Log ───────────────────────────────────────────

export const auditLog = pgTable("audit_log", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  userRole: text("user_role").notNull(),
  action: text("action").notNull(),
  details: text("details"), // JSON string
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
});

export const offlineSyncAction = pgTable("offline_sync_action", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  actionId: text("action_id").notNull().unique(),
  actionType: text("action_type", {
    enum: ["KIOSK_ORDER", "LIBRARY_ISSUE", "LIBRARY_RETURN", "GATE_TAP"],
  }).notNull(),
  status: text("status", { enum: ["SUCCESS", "FAILED"] }).notNull().default("SUCCESS"),
  response: text("response"),
  processedAt: timestamp("processed_at").notNull().$defaultFn(() => new Date()),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
});

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  user: one(user, { fields: [auditLog.userId], references: [user.id] }),
}));

// ─── Gate Log (entry/exit attendance) ────────────────────

export const gateLog = pgTable("gate_log", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  childId: text("child_id")
    .notNull()
    .references(() => child.id, { onDelete: "cascade" }),
  direction: text("direction", { enum: ["ENTRY", "EXIT"] }).notNull(),
  gateId: text("gate_id"),
  tappedAt: timestamp("tapped_at").notNull().$defaultFn(() => new Date()),
  isValid: boolean("is_valid").notNull().default(true), // false if anomaly detected
  anomalyReason: text("anomaly_reason"), // reason if isValid is false
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
});

// ─── Parent Notifications ───────────────────────────────

export const parentNotification = pgTable("parent_notification", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  parentId: text("parent_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  childId: text("child_id")
    .notNull()
    .references(() => child.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  metadata: text("metadata"),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
});

export const gateLogRelations = relations(gateLog, ({ one }) => ({
  child: one(child, { fields: [gateLog.childId], references: [child.id] }),
}));

// ─── Library: Book (master record) ───────────────────────

export const book = pgTable("book", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  isbn: text("isbn"),
  title: text("title").notNull(),
  author: text("author").notNull(),
  publisher: text("publisher"),
  edition: text("edition"),
  category: text("category", {
    enum: ["FICTION", "NON_FICTION", "TEXTBOOK", "REFERENCE", "PERIODICAL", "GENERAL"],
  }).notNull().default("GENERAL"),
  description: text("description"),
  coverImageUrl: text("cover_image_url"),
  totalCopies: integer("total_copies").notNull().default(0),
  availableCopies: integer("available_copies").notNull().default(0),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
});

// ─── Library: Book Copy (physical copy) ──────────────────

export const bookCopy = pgTable("book_copy", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  bookId: text("book_id")
    .notNull()
    .references(() => book.id, { onDelete: "cascade" }),
  accessionNumber: text("accession_number").unique().notNull(),
  condition: text("condition", {
    enum: ["NEW", "GOOD", "FAIR", "POOR", "DAMAGED"],
  }).notNull().default("NEW"),
  status: text("status", {
    enum: ["AVAILABLE", "ISSUED", "LOST", "DAMAGED", "RETIRED"],
  }).notNull().default("AVAILABLE"),
  location: text("location"),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
});

// ─── Bulk Photo Upload Tracking ───────────────────────────

export const bulkPhotoUpload = pgTable("bulk_photo_upload", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  uploadedBy: text("uploaded_by")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size").notNull(), // in bytes
  totalFiles: integer("total_files").notNull(), // expected number of photos
  processedFiles: integer("processed_files").notNull().default(0),
  failedFiles: integer("failed_files").notNull().default(0),
  status: text("status", {
    enum: ["UPLOADED", "VALIDATING", "PROCESSING", "COMPLETED", "FAILED"],
  })
    .notNull()
    .default("UPLOADED"),
  currentStep: text("current_step", {
    enum: [
      "FILE_RECEIVED",
      "FILE_VALIDATION",
      "STRUCTURE_CHECK",
      "PHOTO_PROCESSING",
      "DATABASE_UPDATE",
      "COMPLETED",
      "FAILED",
    ],
  })
    .notNull()
    .default("FILE_RECEIVED"),
  errorMessage: text("error_message"),
  metadata: text("metadata"), // JSON object for custom data
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
});

export const photoUploadBatch = pgTable("photo_upload_batch", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  bulkUploadId: text("bulk_upload_id")
    .notNull()
    .references(() => bulkPhotoUpload.id, { onDelete: "cascade" }),
  childId: text("child_id")
    .notNull()
    .references(() => child.id, { onDelete: "cascade" }),
  photoUrl: text("photo_url").notNull(), // stored photo path
  originalFileName: text("original_file_name"),
  fileSize: integer("file_size"), // in bytes
  uploadStatus: text("upload_status", { enum: ["PENDING", "SUCCESS", "FAILED"] })
    .notNull()
    .default("PENDING"),
  errorReason: text("error_reason"),
  processingStartedAt: timestamp("processing_started_at"),
  processingCompletedAt: timestamp("processing_completed_at"),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
});

// ─── Relations ───────────────────────────────────────────

export const bulkPhotoUploadRelations = relations(bulkPhotoUpload, ({ one, many }) => ({
  uploader: one(user, { fields: [bulkPhotoUpload.uploadedBy], references: [user.id] }),
  batches: many(photoUploadBatch),
}));

export const photoUploadBatchRelations = relations(photoUploadBatch, ({ one }) => ({
  bulkUpload: one(bulkPhotoUpload, {
    fields: [photoUploadBatch.bulkUploadId],
    references: [bulkPhotoUpload.id],
  }),
  child: one(child, { fields: [photoUploadBatch.childId], references: [child.id] }),
}));

// ─── Library: Book Issuance (issue/return ledger) ────────

export const bookIssuance = pgTable("book_issuance", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  bookCopyId: text("book_copy_id")
    .notNull()
    .references(() => bookCopy.id),
  childId: text("child_id")
    .notNull()
    .references(() => child.id, { onDelete: "cascade" }),
  issuedAt: timestamp("issued_at").notNull().$defaultFn(() => new Date()),
  dueDate: timestamp("due_date").notNull(),
  returnedAt: timestamp("returned_at"),
  status: text("status", {
    enum: ["ISSUED", "RETURNED", "OVERDUE", "LOST", "RETURN_PENDING"],
  }).notNull().default("ISSUED"),
  reissueCount: integer("reissue_count").notNull().default(0),
  issuedBy: text("issued_by"),
  returnConfirmedBy: text("return_confirmed_by").references(() => user.id),
  fineAmount: doublePrecision("fine_amount").notNull().default(0),
  fineDeducted: boolean("fine_deducted").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
});

// ─── Library: Settings (key-value config) ────────────────

export const librarySetting = pgTable("library_setting", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  key: text("key").unique().notNull(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
  updatedBy: text("updated_by").references(() => user.id),
});

// ─── App Settings (key-value config) ─────────────────────

export const appSetting = pgTable("app_setting", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  key: text("key").unique().notNull(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
  updatedBy: text("updated_by").references(() => user.id),
});

// ─── Certe+ Premium Subscription ─────────────────────────

export const certeSubscription = pgTable("certe_subscription", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  parentId: text("parent_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  plan: text("plan", { enum: ["WEEKLY", "MONTHLY", "THREE_MONTHS", "SIX_MONTHS"] })
    .notNull()
    .default("MONTHLY"),
  status: text("status", { enum: ["ACTIVE", "EXPIRED", "CANCELLED"] })
    .notNull()
    .default("ACTIVE"),
  startDate: timestamp("start_date").notNull().$defaultFn(() => new Date()),
  endDate: timestamp("end_date").notNull(),
  amount: doublePrecision("amount").notNull().default(129),
  paymentMethod: text("payment_method", { enum: ["WALLET", "RAZORPAY"] }).notNull(),
  razorpayPaymentId: text("razorpay_payment_id"),
  walletOverdraftUsed: doublePrecision("wallet_overdraft_used").notNull().default(0),
  libraryPenaltiesUsed: integer("library_penalties_used").notNull().default(0),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
});

// ─── Library Relations ───────────────────────────────────

export const bookRelations = relations(book, ({ many }) => ({
  copies: many(bookCopy),
}));

export const bookCopyRelations = relations(bookCopy, ({ one, many }) => ({
  book: one(book, { fields: [bookCopy.bookId], references: [book.id] }),
  issuances: many(bookIssuance),
}));

export const bookIssuanceRelations = relations(bookIssuance, ({ one }) => ({
  bookCopy: one(bookCopy, { fields: [bookIssuance.bookCopyId], references: [bookCopy.id] }),
  child: one(child, { fields: [bookIssuance.childId], references: [child.id] }),
  returnConfirmer: one(user, { fields: [bookIssuance.returnConfirmedBy], references: [user.id] }),
}));

export const librarySettingRelations = relations(librarySetting, ({ one }) => ({
  updater: one(user, { fields: [librarySetting.updatedBy], references: [user.id] }),
}));

export const appSettingRelations = relations(appSetting, ({ one }) => ({
  updater: one(user, { fields: [appSetting.updatedBy], references: [user.id] }),
}));

export const certeSubscriptionRelations = relations(certeSubscription, ({ one }) => ({
  parent: one(user, { fields: [certeSubscription.parentId], references: [user.id] }),
}));

export const parentNotificationRelations = relations(parentNotification, ({ one }) => ({
  parent: one(user, { fields: [parentNotification.parentId], references: [user.id] }),
  child: one(child, { fields: [parentNotification.childId], references: [child.id] }),
}));
