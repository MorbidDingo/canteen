import { pgTable, text, boolean, doublePrecision, integer, timestamp, unique, check } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

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
  role: text("role", {
    enum: ["PARENT", "GENERAL", "ADMIN", "OPERATOR", "MANAGEMENT", "LIB_OPERATOR", "ATTENDANCE", "OWNER", "DEVICE"],
  })
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

// ─── Multi-Org Foundation Tables ────────────────────────

export const organization = pgTable("organization", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  type: text("type", { enum: ["SCHOOL", "COLLEGE", "OTHER"] })
    .notNull()
    .default("SCHOOL"),
  status: text("status", { enum: ["PENDING", "ACTIVE", "SUSPENDED", "CLOSED"] })
    .notNull()
    .default("PENDING"),
  createdByUserId: text("created_by_user_id")
    .notNull()
    .references(() => user.id),
  approvedByUserId: text("approved_by_user_id").references(() => user.id),
  approvedAt: timestamp("approved_at"),
  suspendedAt: timestamp("suspended_at"),
  suspensionReason: text("suspension_reason"),
  defaultTimezone: text("default_timezone").notNull().default("Asia/Kolkata"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
});

// ─── Canteen (sub-entity of organization) ────────────────

export const canteen = pgTable("canteen", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  location: text("location"),
  status: text("status", { enum: ["ACTIVE", "INACTIVE"] })
    .notNull()
    .default("ACTIVE"),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
});

// ─── Library (sub-entity of organization) ────────────────

export const library = pgTable("library", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  location: text("location"),
  status: text("status", { enum: ["ACTIVE", "INACTIVE"] })
    .notNull()
    .default("ACTIVE"),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
});

export const organizationMembership = pgTable(
  "organization_membership",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", {
      enum: ["OWNER", "ADMIN", "MANAGEMENT", "OPERATOR", "LIB_OPERATOR", "ATTENDANCE", "PARENT", "GENERAL", "DEVICE"],
    }).notNull(),
    status: text("status", { enum: ["INVITED", "ACTIVE", "SUSPENDED", "REMOVED"] })
      .notNull()
      .default("INVITED"),
    invitedByUserId: text("invited_by_user_id").references(() => user.id),
    joinedAt: timestamp("joined_at"),
    suspendedAt: timestamp("suspended_at"),
    suspensionReason: text("suspension_reason"),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
  },
  (table) => ({
    uniqueOrgUserRole: unique("organization_membership_org_user_role_unique").on(
      table.organizationId,
      table.userId,
      table.role,
    ),
  }),
);

export const platformUserRole = pgTable("platform_user_role", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["PLATFORM_OWNER", "PLATFORM_SUPPORT"] }).notNull(),
  status: text("status", { enum: ["ACTIVE", "DISABLED"] }).notNull().default("ACTIVE"),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
});

export const organizationApprovalRequest = pgTable("organization_approval_request", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  applicantUserId: text("applicant_user_id")
    .notNull()
    .references(() => user.id),
  requestedName: text("requested_name").notNull(),
  requestedSlug: text("requested_slug").notNull(),
  status: text("status", { enum: ["PENDING", "APPROVED", "REJECTED"] })
    .notNull()
    .default("PENDING"),
  reviewedByUserId: text("reviewed_by_user_id").references(() => user.id),
  reviewedAt: timestamp("reviewed_at"),
  reviewNotes: text("review_notes"),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
});

export const organizationReactivationRequest = pgTable("organization_reactivation_request", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  requestedByUserId: text("requested_by_user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  status: text("status", { enum: ["PENDING", "APPROVED", "REJECTED"] })
    .notNull()
    .default("PENDING"),
  reason: text("reason"),
  reviewedByUserId: text("reviewed_by_user_id").references(() => user.id),
  reviewedAt: timestamp("reviewed_at"),
  reviewNotes: text("review_notes"),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
});

export const organizationContract = pgTable("organization_contract", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  contractCode: text("contract_code").notNull(),
  planName: text("plan_name").notNull(),
  startsAt: timestamp("starts_at").notNull(),
  endsAt: timestamp("ends_at").notNull(),
  status: text("status", { enum: ["ACTIVE", "EXPIRED", "GRACE", "TERMINATED"] })
    .notNull()
    .default("ACTIVE"),
  autoSuspendOnExpiry: boolean("auto_suspend_on_expiry").notNull().default(true),
  notes: text("notes"),
  createdByUserId: text("created_by_user_id")
    .notNull()
    .references(() => user.id),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
});

export const organizationFeatureEntitlement = pgTable(
  "organization_feature_entitlement",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    featureKey: text("feature_key").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    source: text("source", { enum: ["PLAN_DEFAULT", "CONTRACT_OVERRIDE", "OWNER_OVERRIDE"] })
      .notNull()
      .default("PLAN_DEFAULT"),
    hardLockedByOwner: boolean("hard_locked_by_owner").notNull().default(false),
    updatedByUserId: text("updated_by_user_id")
      .notNull()
      .references(() => user.id),
    updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
  },
  (table) => ({
    uniqueOrgFeature: unique("organization_feature_entitlement_org_feature_unique").on(
      table.organizationId,
      table.featureKey,
    ),
  }),
);

export const organizationPaymentConfig = pgTable(
  "organization_payment_config",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: ["RAZORPAY"] }).notNull().default("RAZORPAY"),
    mode: text("mode", { enum: ["PLATFORM_MANAGED", "ORG_MANAGED"] })
      .notNull()
      .default("ORG_MANAGED"),
    keyId: text("key_id"),
    keySecretEncrypted: text("key_secret_encrypted"),
    webhookSecretEncrypted: text("webhook_secret_encrypted"),
    settlementOwner: text("settlement_owner", { enum: ["ORG", "PLATFORM"] })
      .notNull()
      .default("ORG"),
    status: text("status", { enum: ["PENDING_VERIFICATION", "ACTIVE", "DISABLED"] })
      .notNull()
      .default("PENDING_VERIFICATION"),
    lastVerifiedAt: timestamp("last_verified_at"),
    updatedByUserId: text("updated_by_user_id")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
  },
  (table) => ({
    uniqueOrgProvider: unique("organization_payment_config_org_provider_unique").on(
      table.organizationId,
      table.provider,
    ),
  }),
);

export const organizationDevice = pgTable(
  "organization_device",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    deviceType: text("device_type", { enum: ["GATE", "KIOSK", "LIBRARY"] }).notNull(),
    deviceName: text("device_name").notNull().default("Terminal"),
    deviceCode: text("device_code").notNull(),
    authTokenHash: text("auth_token_hash").notNull(),
    currentIp: text("current_ip"),
    lastIp: text("last_ip"),
    lastUserAgent: text("last_user_agent"),
    loginUserId: text("login_user_id").references(() => user.id, { onDelete: "set null" }),
    canteenId: text("canteen_id").references(() => canteen.id, { onDelete: "set null" }),
    libraryId: text("library_id").references(() => library.id, { onDelete: "set null" }),
    createdByUserId: text("created_by_user_id").references(() => user.id),
    status: text("status", { enum: ["ACTIVE", "DISABLED"] }).notNull().default("ACTIVE"),
    lastSeenAt: timestamp("last_seen_at"),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
  },
  (table) => ({
    uniqueOrgDevice: unique("organization_device_org_type_code_unique").on(
      table.organizationId,
      table.deviceType,
      table.deviceCode,
    ),
    // Each device maps to exactly one resource: canteen OR library, never both
    singleResourceCheck: check(
      "device_single_resource",
      sql`NOT (${table.canteenId} IS NOT NULL AND ${table.libraryId} IS NOT NULL)`,
    ),
  }),
);

export const organizationDeviceAssignment = pgTable(
  "organization_device_assignment",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    deviceId: text("device_id")
      .notNull()
      .references(() => organizationDevice.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    assignedByUserId: text("assigned_by_user_id").references(() => user.id),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
  },
  (table) => ({
    uniqueDeviceUser: unique("organization_device_assignment_device_user_unique").on(
      table.deviceId,
      table.userId,
    ),
  }),
);

// ─── Child (multi-child per parent) ──────────────────────

export const child = pgTable(
  "child",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
    parentId: text("parent_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    grNumber: text("gr_number"),
    className: text("class_name"),
    section: text("section"),
    rfidCardId: text("rfid_card_id"),
    image: text("image"),
    presenceStatus: text("presence_status", { enum: ["INSIDE", "OUTSIDE"] })
      .notNull()
      .default("OUTSIDE"),
    lastGateTapAt: timestamp("last_gate_tap_at"),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
  },
  (table) => ({
    uniqueOrgGrNumber: unique("child_org_gr_number_unique").on(table.organizationId, table.grNumber),
    uniqueOrgRfidCardId: unique("child_org_rfid_card_id_unique").on(table.organizationId, table.rfidCardId),
  }),
);

export const temporaryRfidAccess = pgTable(
  "temporary_rfid_access",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
    childId: text("child_id")
      .notNull()
      .references(() => child.id, { onDelete: "cascade" }),
    temporaryRfidCardId: text("temporary_rfid_card_id").notNull(),
    accessType: text("access_type", { enum: ["STUDENT_TEMP", "GUEST_TEMP"] })
      .notNull()
      .default("STUDENT_TEMP"),
    validFrom: timestamp("valid_from").notNull().$defaultFn(() => new Date()),
    validUntil: timestamp("valid_until").notNull(),
    revokedAt: timestamp("revoked_at"),
    createdByOperatorId: text("created_by_operator_id").references(() => user.id),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
  },
  (table) => ({
    uniqueOrgTemporaryRfidCardId: unique("temporary_rfid_access_org_card_id_unique").on(
      table.organizationId,
      table.temporaryRfidCardId,
    ),
  }),
);

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
  aiAutoOrderEnabled: boolean("ai_auto_order_enabled").notNull().default(false),
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
  canteenId: text("canteen_id").references(() => canteen.id, { onDelete: "set null" }),
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
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  canteenId: text("canteen_id").references(() => canteen.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  description: text("description"),
  price: doublePrecision("price").notNull(),
  category: text("category", { enum: ["SNACKS", "MEALS", "DRINKS", "PACKED_FOOD"] }).notNull(),
  imageUrl: text("image_url"),
  videoUrl: text("video_url"),
  additionalImages: text("additional_images"), // JSON array of image URLs
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
  canteenId: text("canteen_id").references(() => canteen.id, { onDelete: "set null" }),
  deviceId: text("device_id").references(() => organizationDevice.id, { onDelete: "set null" }),
  tokenCode: text("token_code"),
  status: text("status", {
    enum: ["PLACED", "PREPARING", "SERVED", "CANCELLED"],
  })
    .notNull()
    .default("PLACED"),
  totalAmount: doublePrecision("total_amount").notNull(),
  platformFee: doublePrecision("platform_fee").notNull().default(0),
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

export const settlementAccount = pgTable(
  "settlement_account",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accountType: text("account_type", { enum: ["CANTEEN_ADMIN", "MANAGEMENT"] }).notNull(),
    label: text("label").notNull(),
    method: text("method", { enum: ["BANK_ACCOUNT", "UPI"] }).notNull(),
    bankAccountNumber: text("bank_account_number"),
    bankIfsc: text("bank_ifsc"),
    bankAccountHolderName: text("bank_account_holder_name"),
    upiVpa: text("upi_vpa"),
    razorpayContactId: text("razorpay_contact_id"),
    razorpayFundAccountId: text("razorpay_fund_account_id"),
    status: text("status", { enum: ["ACTIVE", "BLOCKED", "PENDING_VERIFICATION"] })
      .notNull()
      .default("PENDING_VERIFICATION"),
    blockedByUserId: text("blocked_by_user_id").references(() => user.id, { onDelete: "set null" }),
    blockedAt: timestamp("blocked_at"),
    blockReason: text("block_reason"),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
  },
  (table) => ({
    uniqueSettlementAccountDetails: unique("settlement_account_org_user_method_details_unique").on(
      table.organizationId,
      table.userId,
      table.method,
      table.bankAccountNumber,
      table.bankIfsc,
      table.upiVpa,
    ),
  }),
);

export const canteenPaymentRouting = pgTable("canteen_payment_routing", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  canteenId: text("canteen_id")
    .notNull()
    .unique()
    .references(() => canteen.id, { onDelete: "cascade" }),
  settlementAccountId: text("settlement_account_id")
    .notNull()
    .references(() => settlementAccount.id),
  overriddenByUserId: text("overridden_by_user_id").references(() => user.id, { onDelete: "set null" }),
  overriddenAt: timestamp("overridden_at"),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
});

export const settlementLedger = pgTable("settlement_ledger", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  settlementAccountId: text("settlement_account_id").references(() => settlementAccount.id),
  orderId: text("order_id").references(() => order.id, { onDelete: "set null" }),
  grossAmount: doublePrecision("gross_amount").notNull(),
  platformFee: doublePrecision("platform_fee").notNull(),
  netAmount: doublePrecision("net_amount").notNull(),
  entryType: text("entry_type", { enum: ["DEBIT", "REVERSAL"] }).notNull(),
  status: text("status", { enum: ["PENDING", "PROCESSING", "SETTLED", "FAILED"] })
    .notNull()
    .default("PENDING"),
  razorpayPayoutId: text("razorpay_payout_id"),
  settledAt: timestamp("settled_at"),
  failureReason: text("failure_reason"),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
});

export const settlementBatch = pgTable("settlement_batch", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  settlementAccountId: text("settlement_account_id")
    .notNull()
    .references(() => settlementAccount.id),
  totalGross: doublePrecision("total_gross").notNull(),
  totalFee: doublePrecision("total_fee").notNull(),
  totalNet: doublePrecision("total_net").notNull(),
  orderCount: integer("order_count").notNull().default(0),
  status: text("status", { enum: ["PENDING", "PROCESSING", "SETTLED", "FAILED", "PARTIALLY_FAILED"] })
    .notNull()
    .default("PENDING"),
  razorpayPayoutId: text("razorpay_payout_id"),
  processedAt: timestamp("processed_at"),
  failureReason: text("failure_reason"),
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
  organizationOwnerSubscriptions: many(organizationOwnerSubscription),
  createdOrganizations: many(organization, { relationName: "organization_created_by" }),
  approvedOrganizations: many(organization, { relationName: "organization_approved_by" }),
  organizationMemberships: many(organizationMembership),
  platformRoles: many(platformUserRole),
  organizationApprovalRequests: many(organizationApprovalRequest),
  reviewedOrganizationApprovalRequests: many(organizationApprovalRequest, {
    relationName: "organization_approval_reviewed_by",
  }),
  organizationReactivationRequests: many(organizationReactivationRequest),
  reviewedOrganizationReactivationRequests: many(organizationReactivationRequest, {
    relationName: "organization_reactivation_reviewed_by",
  }),
  createdOrganizationContracts: many(organizationContract),
  updatedOrganizationFeatureEntitlements: many(organizationFeatureEntitlement),
  updatedOrganizationPaymentConfigs: many(organizationPaymentConfig),
  loginDevices: many(organizationDevice, { relationName: "organization_device_login_user" }),
  createdDevices: many(organizationDevice, { relationName: "organization_device_created_by" }),
  assignedDevices: many(organizationDeviceAssignment, { relationName: "organization_device_assignment_user" }),
  createdDeviceAssignments: many(organizationDeviceAssignment, {
    relationName: "organization_device_assignment_created_by",
  }),
  settlementAccounts: many(settlementAccount, { relationName: "settlement_account_owner" }),
  blockedSettlementAccounts: many(settlementAccount, { relationName: "settlement_account_blocked_by" }),
  overriddenCanteenPaymentRoutings: many(canteenPaymentRouting, {
    relationName: "canteen_payment_routing_overridden_by",
  }),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));

export const organizationRelations = relations(organization, ({ one, many }) => ({
  createdBy: one(user, {
    fields: [organization.createdByUserId],
    references: [user.id],
    relationName: "organization_created_by",
  }),
  approvedBy: one(user, {
    fields: [organization.approvedByUserId],
    references: [user.id],
    relationName: "organization_approved_by",
  }),
  memberships: many(organizationMembership),
  reactivationRequests: many(organizationReactivationRequest),
  contracts: many(organizationContract),
  featureEntitlements: many(organizationFeatureEntitlement),
  paymentConfigs: many(organizationPaymentConfig),
  devices: many(organizationDevice),
  deviceAssignments: many(organizationDeviceAssignment),
  children: many(child),
  menuItems: many(menuItem),
  auditLogs: many(auditLog),
  books: many(book),
  bookCopies: many(bookCopy),
  bulkPhotoUploads: many(bulkPhotoUpload),
  librarySettings: many(librarySetting),
  appSettings: many(appSetting),
  temporaryRfidAccesses: many(temporaryRfidAccess),
  canteens: many(canteen),
  libraries: many(library),
  settlementAccounts: many(settlementAccount),
  settlementLedgers: many(settlementLedger),
  settlementBatches: many(settlementBatch),
}));

// ─── Canteen & Library Relations ─────────────────────────

export const canteenRelations = relations(canteen, ({ one, many }) => ({
  organization: one(organization, { fields: [canteen.organizationId], references: [organization.id] }),
  menuItems: many(menuItem),
  orders: many(order),
  preOrders: many(preOrder),
  devices: many(organizationDevice, { relationName: "device_canteen" }),
  paymentRoutings: many(canteenPaymentRouting),
}));

export const libraryRelations = relations(library, ({ one, many }) => ({
  organization: one(organization, { fields: [library.organizationId], references: [organization.id] }),
  books: many(book),
  bookCopies: many(bookCopy),
  bookIssuances: many(bookIssuance),
  issueRequests: many(libraryAppIssueRequest),
  settings: many(librarySetting),
  devices: many(organizationDevice, { relationName: "device_library" }),
}));

export const organizationMembershipRelations = relations(organizationMembership, ({ one }) => ({
  organization: one(organization, {
    fields: [organizationMembership.organizationId],
    references: [organization.id],
  }),
  user: one(user, {
    fields: [organizationMembership.userId],
    references: [user.id],
  }),
  invitedBy: one(user, {
    fields: [organizationMembership.invitedByUserId],
    references: [user.id],
  }),
}));

export const platformUserRoleRelations = relations(platformUserRole, ({ one }) => ({
  user: one(user, { fields: [platformUserRole.userId], references: [user.id] }),
}));

export const organizationApprovalRequestRelations = relations(
  organizationApprovalRequest,
  ({ one }) => ({
    applicant: one(user, {
      fields: [organizationApprovalRequest.applicantUserId],
      references: [user.id],
    }),
    reviewer: one(user, {
      fields: [organizationApprovalRequest.reviewedByUserId],
      references: [user.id],
      relationName: "organization_approval_reviewed_by",
    }),
  }),
);

export const organizationReactivationRequestRelations = relations(
  organizationReactivationRequest,
  ({ one }) => ({
    organization: one(organization, {
      fields: [organizationReactivationRequest.organizationId],
      references: [organization.id],
    }),
    requester: one(user, {
      fields: [organizationReactivationRequest.requestedByUserId],
      references: [user.id],
    }),
    reviewer: one(user, {
      fields: [organizationReactivationRequest.reviewedByUserId],
      references: [user.id],
      relationName: "organization_reactivation_reviewed_by",
    }),
  }),
);

export const organizationContractRelations = relations(organizationContract, ({ one }) => ({
  organization: one(organization, {
    fields: [organizationContract.organizationId],
    references: [organization.id],
  }),
  createdBy: one(user, {
    fields: [organizationContract.createdByUserId],
    references: [user.id],
  }),
}));

export const organizationFeatureEntitlementRelations = relations(
  organizationFeatureEntitlement,
  ({ one }) => ({
    organization: one(organization, {
      fields: [organizationFeatureEntitlement.organizationId],
      references: [organization.id],
    }),
    updatedBy: one(user, {
      fields: [organizationFeatureEntitlement.updatedByUserId],
      references: [user.id],
    }),
  }),
);

export const organizationPaymentConfigRelations = relations(
  organizationPaymentConfig,
  ({ one }) => ({
    organization: one(organization, {
      fields: [organizationPaymentConfig.organizationId],
      references: [organization.id],
    }),
    updatedBy: one(user, {
      fields: [organizationPaymentConfig.updatedByUserId],
      references: [user.id],
    }),
  }),
);

export const organizationDeviceRelations = relations(organizationDevice, ({ one, many }) => ({
  organization: one(organization, {
    fields: [organizationDevice.organizationId],
    references: [organization.id],
  }),
  canteen: one(canteen, {
    fields: [organizationDevice.canteenId],
    references: [canteen.id],
    relationName: "device_canteen",
  }),
  library: one(library, {
    fields: [organizationDevice.libraryId],
    references: [library.id],
    relationName: "device_library",
  }),
  loginUser: one(user, {
    fields: [organizationDevice.loginUserId],
    references: [user.id],
    relationName: "organization_device_login_user",
  }),
  createdBy: one(user, {
    fields: [organizationDevice.createdByUserId],
    references: [user.id],
    relationName: "organization_device_created_by",
  }),
  assignments: many(organizationDeviceAssignment),
}));

export const organizationDeviceAssignmentRelations = relations(
  organizationDeviceAssignment,
  ({ one }) => ({
    organization: one(organization, {
      fields: [organizationDeviceAssignment.organizationId],
      references: [organization.id],
    }),
    device: one(organizationDevice, {
      fields: [organizationDeviceAssignment.deviceId],
      references: [organizationDevice.id],
    }),
    user: one(user, {
      fields: [organizationDeviceAssignment.userId],
      references: [user.id],
      relationName: "organization_device_assignment_user",
    }),
    assignedBy: one(user, {
      fields: [organizationDeviceAssignment.assignedByUserId],
      references: [user.id],
      relationName: "organization_device_assignment_created_by",
    }),
  }),
);

export const childRelations = relations(child, ({ one, many }) => ({
  organization: one(organization, { fields: [child.organizationId], references: [organization.id] }),
  parent: one(user, { fields: [child.parentId], references: [user.id] }),
  wallet: one(wallet),
  parentControl: one(parentControl),
  orders: many(order),
  preOrders: many(preOrder),
  bookIssuances: many(bookIssuance),
  gateLogs: many(gateLog),
  temporaryRfidAccesses: many(temporaryRfidAccess),
  parentNotifications: many(parentNotification),
  certeSubscriptionPenaltyUsages: many(certeSubscriptionPenaltyUsage),
}));

export const temporaryRfidAccessRelations = relations(temporaryRfidAccess, ({ one }) => ({
  organization: one(organization, {
    fields: [temporaryRfidAccess.organizationId],
    references: [organization.id],
  }),
  child: one(child, { fields: [temporaryRfidAccess.childId], references: [child.id] }),
  operator: one(user, { fields: [temporaryRfidAccess.createdByOperatorId], references: [user.id] }),
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
  canteen: one(canteen, { fields: [preOrder.canteenId], references: [canteen.id] }),
  items: many(preOrderItem),
}));

export const preOrderItemRelations = relations(preOrderItem, ({ one }) => ({
  preOrder: one(preOrder, { fields: [preOrderItem.preOrderId], references: [preOrder.id] }),
  menuItem: one(menuItem, { fields: [preOrderItem.menuItemId], references: [menuItem.id] }),
}));

export const orderRelations = relations(order, ({ one, many }) => ({
  user: one(user, { fields: [order.userId], references: [user.id] }),
  child: one(child, { fields: [order.childId], references: [child.id] }),
  canteen: one(canteen, { fields: [order.canteenId], references: [canteen.id] }),
  device: one(organizationDevice, { fields: [order.deviceId], references: [organizationDevice.id] }),
  items: many(orderItem),
  settlementLedgers: many(settlementLedger),
}));

export const orderItemRelations = relations(orderItem, ({ one }) => ({
  order: one(order, { fields: [orderItem.orderId], references: [order.id] }),
  menuItem: one(menuItem, { fields: [orderItem.menuItemId], references: [menuItem.id] }),
}));

export const settlementAccountRelations = relations(settlementAccount, ({ one, many }) => ({
  organization: one(organization, {
    fields: [settlementAccount.organizationId],
    references: [organization.id],
  }),
  user: one(user, {
    fields: [settlementAccount.userId],
    references: [user.id],
    relationName: "settlement_account_owner",
  }),
  blockedBy: one(user, {
    fields: [settlementAccount.blockedByUserId],
    references: [user.id],
    relationName: "settlement_account_blocked_by",
  }),
  canteenRoutings: many(canteenPaymentRouting),
  ledgerEntries: many(settlementLedger),
  batches: many(settlementBatch),
}));

export const canteenPaymentRoutingRelations = relations(canteenPaymentRouting, ({ one }) => ({
  canteen: one(canteen, {
    fields: [canteenPaymentRouting.canteenId],
    references: [canteen.id],
  }),
  settlementAccount: one(settlementAccount, {
    fields: [canteenPaymentRouting.settlementAccountId],
    references: [settlementAccount.id],
  }),
  overriddenBy: one(user, {
    fields: [canteenPaymentRouting.overriddenByUserId],
    references: [user.id],
    relationName: "canteen_payment_routing_overridden_by",
  }),
}));

export const settlementLedgerRelations = relations(settlementLedger, ({ one }) => ({
  organization: one(organization, {
    fields: [settlementLedger.organizationId],
    references: [organization.id],
  }),
  settlementAccount: one(settlementAccount, {
    fields: [settlementLedger.settlementAccountId],
    references: [settlementAccount.id],
  }),
  order: one(order, {
    fields: [settlementLedger.orderId],
    references: [order.id],
  }),
}));

export const settlementBatchRelations = relations(settlementBatch, ({ one }) => ({
  organization: one(organization, {
    fields: [settlementBatch.organizationId],
    references: [organization.id],
  }),
  settlementAccount: one(settlementAccount, {
    fields: [settlementBatch.settlementAccountId],
    references: [settlementAccount.id],
  }),
}));

export const menuItemRelations = relations(menuItem, ({ one, many }) => ({
  organization: one(organization, { fields: [menuItem.organizationId], references: [organization.id] }),
  canteen: one(canteen, { fields: [menuItem.canteenId], references: [canteen.id] }),
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
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
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
  organization: one(organization, { fields: [auditLog.organizationId], references: [organization.id] }),
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

// ─── Messaging Service ───────────────────────────────────

export const messagingLog = pgTable("messaging_log", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  parentId: text("parent_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  childId: text("child_id").references(() => child.id, { onDelete: "cascade" }),
  phoneNumber: text("phone_number").notNull(),
  type: text("type", { enum: ["WHATSAPP", "SMS", "FAILED"] }).notNull(),
  notificationType: text("notification_type").notNull(),
  messageContent: text("message_content").notNull(),
  serviceResponse: text("service_response"),
  sentAt: timestamp("sent_at").notNull(),
  deliveredAt: timestamp("delivered_at"),
  failureReason: text("failure_reason"),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
});

export const parentMessagingPreference = pgTable("parent_messaging_preference", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  parentId: text("parent_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  phoneNumber: text("phone_number"),
  preferredChannel: text("preferred_channel", {
    enum: ["WHATSAPP", "SMS", "BOTH"],
  })
    .notNull()
    .default("BOTH"),
  fallbackEnabled: boolean("fallback_enabled").notNull().default(true),
  gateNotificationsEnabled: boolean("gate_notifications_enabled").notNull().default(true),
  orderNotificationsEnabled: boolean("order_notifications_enabled").notNull().default(true),
  spendingNotificationsEnabled: boolean("spending_notifications_enabled").notNull().default(true),
  cardNotificationsEnabled: boolean("card_notifications_enabled").notNull().default(true),
  blockedNotificationsEnabled: boolean("blocked_notifications_enabled").notNull().default(true),
  consentGivenAt: timestamp("consent_given_at"),
  updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
});

export const gateLogRelations = relations(gateLog, ({ one }) => ({
  child: one(child, { fields: [gateLog.childId], references: [child.id] }),
}));

// ─── Library: Book (master record) ───────────────────────

export const book = pgTable("book", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  libraryId: text("library_id").references(() => library.id, { onDelete: "set null" }),
  isbn: text("isbn"),
  title: text("title").notNull(),
  author: text("author").notNull(),
  publisher: text("publisher"),
  edition: text("edition"),
  category: text("category").notNull().default("GENERAL"),
  description: text("description"),
  coverImageUrl: text("cover_image_url"),
  totalCopies: integer("total_copies").notNull().default(0),
  availableCopies: integer("available_copies").notNull().default(0),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
});

// ─── Library: Book Copy (physical copy) ──────────────────

export const bookCopy = pgTable(
  "book_copy",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
    libraryId: text("library_id").references(() => library.id, { onDelete: "set null" }),
    bookId: text("book_id")
      .notNull()
      .references(() => book.id, { onDelete: "cascade" }),
    accessionNumber: text("accession_number").notNull(),
    condition: text("condition", {
      enum: ["NEW", "GOOD", "FAIR", "POOR", "DAMAGED"],
    }).notNull().default("NEW"),
    status: text("status", {
      enum: ["AVAILABLE", "ISSUED", "LOST", "DAMAGED", "RETIRED"],
    }).notNull().default("AVAILABLE"),
    location: text("location"),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
  },
  (table) => ({
    uniqueOrgAccessionNumber: unique("book_copy_org_accession_number_unique").on(
      table.organizationId,
      table.accessionNumber,
    ),
  }),
);

// ─── Bulk Photo Upload Tracking ───────────────────────────

export const bulkPhotoUpload = pgTable("bulk_photo_upload", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
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
  organization: one(organization, {
    fields: [bulkPhotoUpload.organizationId],
    references: [organization.id],
  }),
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
  libraryId: text("library_id").references(() => library.id, { onDelete: "set null" }),
  childId: text("child_id")
    .notNull()
    .references(() => child.id, { onDelete: "cascade" }),
  issuedAt: timestamp("issued_at").notNull().$defaultFn(() => new Date()),
  dueDate: timestamp("due_date").notNull(),
  returnedAt: timestamp("returned_at"),
  status: text("status", {
    enum: ["ISSUED", "RETURNED", "OVERDUE", "LOST", "RETURN_PENDING"],
  }).notNull().default("ISSUED"),
  deviceId: text("device_id").references(() => organizationDevice.id, { onDelete: "set null" }),
  reissueCount: integer("reissue_count").notNull().default(0),
  issuedBy: text("issued_by"),
  returnConfirmedBy: text("return_confirmed_by").references(() => user.id),
  fineAmount: doublePrecision("fine_amount").notNull().default(0),
  fineDeducted: boolean("fine_deducted").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
});

// ─── Library: App Issue Request (app -> kiosk confirmation) ──

export const libraryAppIssueRequest = pgTable("library_app_issue_request", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  libraryId: text("library_id").references(() => library.id, { onDelete: "set null" }),
  parentId: text("parent_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  childId: text("child_id")
    .notNull()
    .references(() => child.id, { onDelete: "cascade" }),
  bookId: text("book_id")
    .notNull()
    .references(() => book.id, { onDelete: "cascade" }),
  status: text("status", {
    enum: ["REQUESTED", "CONFIRMED", "CANCELLED", "EXPIRED", "REJECTED"],
  })
    .notNull()
    .default("REQUESTED"),
  expiresAt: timestamp("expires_at").notNull(),
  confirmedAt: timestamp("confirmed_at"),
  confirmedDeviceId: text("confirmed_device_id").references(() => organizationDevice.id, {
    onDelete: "set null",
  }),
  issuanceId: text("issuance_id").references(() => bookIssuance.id, {
    onDelete: "set null",
  }),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
});

// ─── Library: Settings (key-value config) ────────────────

export const librarySetting = pgTable("library_setting", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  libraryId: text("library_id").references(() => library.id, { onDelete: "cascade" }),
  key: text("key").unique().notNull(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
  updatedBy: text("updated_by").references(() => user.id),
});

// ─── App Settings (key-value config) ─────────────────────

export const appSetting = pgTable("app_setting", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  key: text("key").unique().notNull(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
  updatedBy: text("updated_by").references(() => user.id),
});

// ─── Organization Owner Subscription ────────────────────

export const organizationOwnerSubscription = pgTable("organization_owner_subscription", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  ownerUserId: text("owner_user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  tier: text("tier", { enum: ["BASIC", "PREMIUM", "MEGA"] })
    .notNull()
    .default("BASIC"),
  status: text("status", { enum: ["ACTIVE", "EXPIRED", "CANCELLED"] })
    .notNull()
    .default("ACTIVE"),
  orgLimit: integer("org_limit").notNull().default(1),
  amount: doublePrecision("amount").notNull().default(0),
  paymentMethod: text("payment_method", { enum: ["FREE", "RAZORPAY"] })
    .notNull()
    .default("FREE"),
  razorpayOrderId: text("razorpay_order_id"),
  razorpayPaymentId: text("razorpay_payment_id"),
  startsAt: timestamp("starts_at").notNull().$defaultFn(() => new Date()),
  endsAt: timestamp("ends_at"),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
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

export const certeSubscriptionPenaltyUsage = pgTable(
  "certe_subscription_penalty_usage",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    subscriptionId: text("subscription_id")
      .notNull()
      .references(() => certeSubscription.id, { onDelete: "cascade" }),
    childId: text("child_id")
      .notNull()
      .references(() => child.id, { onDelete: "cascade" }),
    penaltiesUsed: integer("penalties_used").notNull().default(0),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
  },
  (table) => ({
    uniqueSubscriptionChild: unique("certe_subscription_penalty_usage_sub_child_unique").on(
      table.subscriptionId,
      table.childId,
    ),
  }),
);

// ─── Library Relations ───────────────────────────────────

export const bookRelations = relations(book, ({ one, many }) => ({
  organization: one(organization, { fields: [book.organizationId], references: [organization.id] }),
  library: one(library, { fields: [book.libraryId], references: [library.id] }),
  copies: many(bookCopy),
}));

export const bookCopyRelations = relations(bookCopy, ({ one, many }) => ({
  organization: one(organization, { fields: [bookCopy.organizationId], references: [organization.id] }),
  library: one(library, { fields: [bookCopy.libraryId], references: [library.id] }),
  book: one(book, { fields: [bookCopy.bookId], references: [book.id] }),
  issuances: many(bookIssuance),
}));

export const bookIssuanceRelations = relations(bookIssuance, ({ one }) => ({
  bookCopy: one(bookCopy, { fields: [bookIssuance.bookCopyId], references: [bookCopy.id] }),
  library: one(library, { fields: [bookIssuance.libraryId], references: [library.id] }),
  child: one(child, { fields: [bookIssuance.childId], references: [child.id] }),
  device: one(organizationDevice, { fields: [bookIssuance.deviceId], references: [organizationDevice.id] }),
  returnConfirmer: one(user, { fields: [bookIssuance.returnConfirmedBy], references: [user.id] }),
}));

export const libraryAppIssueRequestRelations = relations(libraryAppIssueRequest, ({ one }) => ({
  organization: one(organization, {
    fields: [libraryAppIssueRequest.organizationId],
    references: [organization.id],
  }),
  library: one(library, {
    fields: [libraryAppIssueRequest.libraryId],
    references: [library.id],
  }),
  parent: one(user, {
    fields: [libraryAppIssueRequest.parentId],
    references: [user.id],
  }),
  child: one(child, {
    fields: [libraryAppIssueRequest.childId],
    references: [child.id],
  }),
  book: one(book, {
    fields: [libraryAppIssueRequest.bookId],
    references: [book.id],
  }),
  confirmedDevice: one(organizationDevice, {
    fields: [libraryAppIssueRequest.confirmedDeviceId],
    references: [organizationDevice.id],
  }),
  issuance: one(bookIssuance, {
    fields: [libraryAppIssueRequest.issuanceId],
    references: [bookIssuance.id],
  }),
}));

export const librarySettingRelations = relations(librarySetting, ({ one }) => ({
  organization: one(organization, {
    fields: [librarySetting.organizationId],
    references: [organization.id],
  }),
  library: one(library, {
    fields: [librarySetting.libraryId],
    references: [library.id],
  }),
  updater: one(user, { fields: [librarySetting.updatedBy], references: [user.id] }),
}));

export const appSettingRelations = relations(appSetting, ({ one }) => ({
  organization: one(organization, {
    fields: [appSetting.organizationId],
    references: [organization.id],
  }),
  updater: one(user, { fields: [appSetting.updatedBy], references: [user.id] }),
}));

export const certeSubscriptionRelations = relations(certeSubscription, ({ one, many }) => ({
  parent: one(user, { fields: [certeSubscription.parentId], references: [user.id] }),
  penaltyUsages: many(certeSubscriptionPenaltyUsage),
}));

export const organizationOwnerSubscriptionRelations = relations(organizationOwnerSubscription, ({ one }) => ({
  owner: one(user, {
    fields: [organizationOwnerSubscription.ownerUserId],
    references: [user.id],
  }),
}));

export const certeSubscriptionPenaltyUsageRelations = relations(
  certeSubscriptionPenaltyUsage,
  ({ one }) => ({
    subscription: one(certeSubscription, {
      fields: [certeSubscriptionPenaltyUsage.subscriptionId],
      references: [certeSubscription.id],
    }),
    child: one(child, {
      fields: [certeSubscriptionPenaltyUsage.childId],
      references: [child.id],
    }),
  }),
);

export const parentNotificationRelations = relations(parentNotification, ({ one }) => ({
  parent: one(user, { fields: [parentNotification.parentId], references: [user.id] }),
  child: one(child, { fields: [parentNotification.childId], references: [child.id] }),
}));

export const messagingLogRelations = relations(messagingLog, ({ one }) => ({
  parent: one(user, { fields: [messagingLog.parentId], references: [user.id] }),
  child: one(child, { fields: [messagingLog.childId], references: [child.id] }),
}));

export const parentMessagingPreferenceRelations = relations(parentMessagingPreference, ({ one }) => ({
  parent: one(user, { fields: [parentMessagingPreference.parentId], references: [user.id] }),
}));

// ─── AI/ML Infrastructure ────────────────────────────────

export const anomalyAlert = pgTable("anomaly_alert", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  childId: text("child_id")
    .notNull()
    .references(() => child.id, { onDelete: "cascade" }),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  type: text("type", {
    enum: ["SPENDING_SPIKE", "SKIPPED_MEAL", "RESTRICTED_ATTEMPT", "TIMING_ANOMALY"],
  }).notNull(),
  severity: text("severity", { enum: ["LOW", "MEDIUM", "HIGH"] }).notNull(),
  message: text("message").notNull(),
  data: text("data"), // JSON string
  acknowledged: boolean("acknowledged").notNull().default(false),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
});

export const mlRecommendationCache = pgTable("ml_recommendation_cache", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  childId: text("child_id")
    .notNull()
    .references(() => child.id, { onDelete: "cascade" }),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  timeSlot: text("time_slot").notNull(), // e.g. "MORNING", "LUNCH", "AFTERNOON"
  recommendations: text("recommendations").notNull(), // JSON array of scored recommendations
  computedAt: timestamp("computed_at").notNull().$defaultFn(() => new Date()),
  expiresAt: timestamp("expires_at").notNull(),
});

export const aiScheduledAction = pgTable("ai_scheduled_action", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  childId: text("child_id")
    .notNull()
    .references(() => child.id, { onDelete: "cascade" }),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  actionType: text("action_type", { enum: ["ORDER", "REMINDER"] }).notNull(),
  payload: text("payload").notNull(), // JSON string
  scheduledFor: timestamp("scheduled_for").notNull(),
  executedAt: timestamp("executed_at"),
  status: text("status", { enum: ["PENDING", "EXECUTED", "FAILED", "CANCELLED"] })
    .notNull()
    .default("PENDING"),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
});

// ─── Order Feedback & Cancellation Reasons ───────────────

export const orderFeedback = pgTable("order_feedback", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  orderId: text("order_id")
    .notNull()
    .unique()
    .references(() => order.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  healthyRating: integer("healthy_rating").notNull(), // 1-5 stars
  tasteRating: integer("taste_rating").notNull(),     // 1-5 stars
  quantityRating: integer("quantity_rating").notNull(), // 1-5 stars
  overallReview: text("overall_review"),               // free-text
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
});

export const orderCancellationReason = pgTable("order_cancellation_reason", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  orderId: text("order_id")
    .notNull()
    .unique()
    .references(() => order.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  reason: text("reason", {
    enum: [
      "ORDERED_BY_MISTAKE",
      "FOUND_BETTER_OPTION",
      "CHILD_NOT_IN_SCHOOL",
      "TAKING_HOMEMADE_FOOD",
      "TOO_EXPENSIVE",
      "OTHER",
    ],
  }).notNull(),
  otherText: text("other_text"), // free-text when reason = OTHER
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
});

// ─── Library: Book Favourite (ML interest signal) ────────

export const bookFavourite = pgTable(
  "book_favourite",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    bookId: text("book_id")
      .notNull()
      .references(() => book.id, { onDelete: "cascade" }),
    parentId: text("parent_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
  },
  (table) => ({
    uniquePerUser: unique("book_favourite_book_parent_org_unique").on(
      table.bookId,
      table.parentId,
      table.organizationId,
    ),
  }),
);

export const bookFavouriteRelations = relations(bookFavourite, ({ one }) => ({
  book: one(book, { fields: [bookFavourite.bookId], references: [book.id] }),
  parent: one(user, { fields: [bookFavourite.parentId], references: [user.id] }),
  organization: one(organization, { fields: [bookFavourite.organizationId], references: [organization.id] }),
}));

// ─── Library: Book Feedback (post-return ratings) ────────

export const bookFeedback = pgTable("book_feedback", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  bookId: text("book_id")
    .notNull()
    .references(() => book.id, { onDelete: "cascade" }),
  issuanceId: text("issuance_id")
    .notNull()
    .unique()
    .references(() => bookIssuance.id, { onDelete: "cascade" }),
  childId: text("child_id")
    .notNull()
    .references(() => child.id, { onDelete: "cascade" }),
  parentId: text("parent_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  enjoymentRating: integer("enjoyment_rating").notNull(), // 1-5 how much the child enjoyed
  difficultyRating: integer("difficulty_rating").notNull(), // 1-5 reading difficulty
  wouldRecommend: boolean("would_recommend").notNull(),
  tags: text("tags"), // JSON array: ["page-turner","educational","boring","too-long","inspiring","funny"]
  review: text("review"), // free-text review
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
});

export const bookFeedbackRelations = relations(bookFeedback, ({ one }) => ({
  book: one(book, { fields: [bookFeedback.bookId], references: [book.id] }),
  issuance: one(bookIssuance, { fields: [bookFeedback.issuanceId], references: [bookIssuance.id] }),
  child: one(child, { fields: [bookFeedback.childId], references: [child.id] }),
  parent: one(user, { fields: [bookFeedback.parentId], references: [user.id] }),
  organization: one(organization, { fields: [bookFeedback.organizationId], references: [organization.id] }),
}));

// ─── AI/ML Relations ─────────────────────────────────────

export const anomalyAlertRelations = relations(anomalyAlert, ({ one }) => ({
  child: one(child, { fields: [anomalyAlert.childId], references: [child.id] }),
  organization: one(organization, { fields: [anomalyAlert.organizationId], references: [organization.id] }),
}));

export const mlRecommendationCacheRelations = relations(mlRecommendationCache, ({ one }) => ({
  child: one(child, { fields: [mlRecommendationCache.childId], references: [child.id] }),
  organization: one(organization, { fields: [mlRecommendationCache.organizationId], references: [organization.id] }),
}));

export const aiScheduledActionRelations = relations(aiScheduledAction, ({ one }) => ({
  user: one(user, { fields: [aiScheduledAction.userId], references: [user.id] }),
  child: one(child, { fields: [aiScheduledAction.childId], references: [child.id] }),
  organization: one(organization, { fields: [aiScheduledAction.organizationId], references: [organization.id] }),
}));

export const orderFeedbackRelations = relations(orderFeedback, ({ one }) => ({
  order: one(order, { fields: [orderFeedback.orderId], references: [order.id] }),
  user: one(user, { fields: [orderFeedback.userId], references: [user.id] }),
}));

export const orderCancellationReasonRelations = relations(orderCancellationReason, ({ one }) => ({
  order: one(order, { fields: [orderCancellationReason.orderId], references: [order.id] }),
  user: one(user, { fields: [orderCancellationReason.userId], references: [user.id] }),
}));

// ─── Book Reader (Digital Reading) ──────────────────────

export const readableBook = pgTable("readable_book", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  bookId: text("book_id").references(() => book.id, { onDelete: "set null" }),
  organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  libraryId: text("library_id").references(() => library.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  author: text("author").notNull(),
  category: text("category").notNull().default("GENERAL"),
  description: text("description"),
  coverImageUrl: text("cover_image_url"),
  language: text("language").notNull().default("en"),
  totalPages: integer("total_pages").notNull().default(0),
  totalChapters: integer("total_chapters").notNull().default(0),
  isAudioEnabled: boolean("is_audio_enabled").notNull().default(false),
  isPublicDomain: boolean("is_public_domain").notNull().default(false),
  gutenbergId: text("gutenberg_id"),
  sourceUrl: text("source_url"),
  contentType: text("content_type", { enum: ["TEXT", "PDF", "SCANNED"] }).notNull().default("TEXT"),
  isbn: text("isbn"),
  status: text("status", { enum: ["ACTIVE", "DRAFT", "ARCHIVED"] }).notNull().default("ACTIVE"),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
});

export const bookChapter = pgTable("book_chapter", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  readableBookId: text("readable_book_id").notNull().references(() => readableBook.id, { onDelete: "cascade" }),
  chapterNumber: integer("chapter_number").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  pageStart: integer("page_start").notNull().default(1),
  pageEnd: integer("page_end").notNull().default(1),
  audioUrl: text("audio_url"),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
});

export const readingSession = pgTable("reading_session", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  readableBookId: text("readable_book_id").notNull().references(() => readableBook.id, { onDelete: "cascade" }),
  organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  currentChapter: integer("current_chapter").notNull().default(1),
  currentPage: integer("current_page").notNull().default(1),
  scrollPosition: doublePrecision("scroll_position").notNull().default(0),
  readingMode: text("reading_mode", {
    enum: ["LIGHT", "DARK", "BLUE_LIGHT", "GREY"],
  }).notNull().default("LIGHT"),
  fontSize: integer("font_size").notNull().default(16),
  startedAt: timestamp("started_at").notNull().$defaultFn(() => new Date()),
  lastReadAt: timestamp("last_read_at").notNull().$defaultFn(() => new Date()),
}, (table) => [
  unique("reading_session_user_book_unique").on(table.userId, table.readableBookId),
]);

export const readingBookmark = pgTable("reading_bookmark", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  readableBookId: text("readable_book_id").notNull().references(() => readableBook.id, { onDelete: "cascade" }),
  chapterNumber: integer("chapter_number").notNull(),
  page: integer("page").notNull(),
  label: text("label"),
  embedding: text("embedding"),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
});

export const readingHighlight = pgTable("reading_highlight", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  readableBookId: text("readable_book_id").notNull().references(() => readableBook.id, { onDelete: "cascade" }),
  chapterNumber: integer("chapter_number").notNull(),
  page: integer("page").notNull(),
  startOffset: integer("start_offset").notNull(),
  endOffset: integer("end_offset").notNull(),
  highlightedText: text("highlighted_text").notNull(),
  color: text("color").notNull().default("#fbbf24"),
  note: text("note"),
  embedding: text("embedding"),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
});

export const bookContentEmbedding = pgTable("book_content_embedding", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  readableBookId: text("readable_book_id").notNull().references(() => readableBook.id, { onDelete: "cascade" }),
  chapterNumber: integer("chapter_number").notNull(),
  chunkIndex: integer("chunk_index").notNull().default(0),
  content: text("content").notNull(),
  embedding: text("embedding"),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
});

// ─── Book Reader Relations ──────────────────────────────

export const readableBookRelations = relations(readableBook, ({ one, many }) => ({
  book: one(book, { fields: [readableBook.bookId], references: [book.id] }),
  organization: one(organization, { fields: [readableBook.organizationId], references: [organization.id] }),
  library: one(library, { fields: [readableBook.libraryId], references: [library.id] }),
  chapters: many(bookChapter),
  sessions: many(readingSession),
  bookmarks: many(readingBookmark),
  highlights: many(readingHighlight),
  embeddings: many(bookContentEmbedding),
}));

export const bookChapterRelations = relations(bookChapter, ({ one }) => ({
  readableBook: one(readableBook, { fields: [bookChapter.readableBookId], references: [readableBook.id] }),
}));

export const readingSessionRelations = relations(readingSession, ({ one }) => ({
  user: one(user, { fields: [readingSession.userId], references: [user.id] }),
  readableBook: one(readableBook, { fields: [readingSession.readableBookId], references: [readableBook.id] }),
  organization: one(organization, { fields: [readingSession.organizationId], references: [organization.id] }),
}));

export const readingBookmarkRelations = relations(readingBookmark, ({ one }) => ({
  user: one(user, { fields: [readingBookmark.userId], references: [user.id] }),
  readableBook: one(readableBook, { fields: [readingBookmark.readableBookId], references: [readableBook.id] }),
}));

export const readingHighlightRelations = relations(readingHighlight, ({ one }) => ({
  user: one(user, { fields: [readingHighlight.userId], references: [user.id] }),
  readableBook: one(readableBook, { fields: [readingHighlight.readableBookId], references: [readableBook.id] }),
}));

export const bookContentEmbeddingRelations = relations(bookContentEmbedding, ({ one }) => ({
  readableBook: one(readableBook, { fields: [bookContentEmbedding.readableBookId], references: [readableBook.id] }),
}));

// ─── Gutenberg Catalog (seeded from Gutendex API) ───────

export const gutenbergCatalog = pgTable("gutenberg_catalog", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  gutenbergId: integer("gutenberg_id").notNull().unique(),
  title: text("title").notNull(),
  authors: text("authors").notNull().default("[]"),           // JSON array of { name, birth_year, death_year }
  subjects: text("subjects").notNull().default("[]"),         // JSON string[]
  bookshelves: text("bookshelves").notNull().default("[]"),   // JSON string[]
  languages: text("languages").notNull().default("[]"),       // JSON string[]
  formats: text("formats").notNull().default("{}"),           // JSON Record<string, string>
  downloadCount: integer("download_count").notNull().default(0),
  mediaType: text("media_type").notNull().default("Text"),
  coverImageUrl: text("cover_image_url"),
  category: text("category").notNull().default("GENERAL"),
  s3Key: text("s3_key"),                                      // set once content is downloaded to S3
  s3ContentType: text("s3_content_type"),                     // "text/plain", "text/html", etc.
  isDownloaded: boolean("is_downloaded").notNull().default(false),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
});

// ─── Management Notices ──────────────────────────────────

export const managementNotice = pgTable("management_notice", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  message: text("message").notNull(),
  // ALL_PARENTS, ALL_GENERAL, ALL_USERS, SPECIFIC_CLASS, SPECIFIC_USERS
  targetType: text("target_type").notNull(),
  targetClass: text("target_class"),                        // set when targetType = SPECIFIC_CLASS
  targetUserIds: text("target_user_ids"),                   // JSON string[] when targetType = SPECIFIC_USERS
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
});

export const noticeAcknowledgment = pgTable("notice_acknowledgment", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  noticeId: text("notice_id")
    .notNull()
    .references(() => managementNotice.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  acknowledgedAt: timestamp("acknowledged_at").notNull().$defaultFn(() => new Date()),
}, (table) => ({
  uniqueNoticeUser: unique("notice_ack_notice_user_unique").on(table.noticeId, table.userId),
}));

export const managementNoticeRelations = relations(managementNotice, ({ one, many }) => ({
  organization: one(organization, { fields: [managementNotice.organizationId], references: [organization.id] }),
  createdByUser: one(user, { fields: [managementNotice.createdBy], references: [user.id] }),
  acknowledgments: many(noticeAcknowledgment),
}));

export const noticeAcknowledgmentRelations = relations(noticeAcknowledgment, ({ one }) => ({
  notice: one(managementNotice, { fields: [noticeAcknowledgment.noticeId], references: [managementNotice.id] }),
  user: one(user, { fields: [noticeAcknowledgment.userId], references: [user.id] }),
}));

// ─── Payment Events ──────────────────────────────────────

/**
 * Payment accounts (UPI / Bank) created by operators for receiving event payments.
 * These must be approved by management before an event can go live.
 */
export const paymentEventAccount = pgTable("payment_event_account", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  createdByOperatorId: text("created_by_operator_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  label: text("label").notNull(),                              // e.g. "School Trip Account"
  method: text("method", { enum: ["UPI", "BANK_ACCOUNT"] }).notNull(),
  upiId: text("upi_id"),                                       // set when method = UPI
  accountHolderName: text("account_holder_name"),              // set when method = BANK_ACCOUNT
  accountNumber: text("account_number"),
  ifscCode: text("ifsc_code"),
  bankName: text("bank_name"),
  status: text("status", { enum: ["PENDING_APPROVAL", "APPROVED", "REJECTED"] })
    .notNull()
    .default("PENDING_APPROVAL"),
  approvedById: text("approved_by_id").references(() => user.id, { onDelete: "set null" }),
  approvedAt: timestamp("approved_at"),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
});

/**
 * A payment event created by an operator (e.g. Math Olympiad fee, School Trip fee).
 * Fixed amount per event.  Can be sent to parents/general accounts class-wise,
 * to selected accounts, or opened in kiosk tap mode.
 */
export const paymentEvent = pgTable("payment_event", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  createdByOperatorId: text("created_by_operator_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  paymentAccountId: text("payment_account_id")
    .references(() => paymentEventAccount.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  description: text("description"),
  amount: doublePrecision("amount").notNull(),
  // ALL_PARENTS, ALL_GENERAL, BOTH, CLASS, SELECTED, KIOSK
  targetType: text("target_type").notNull().default("BOTH"),
  targetClass: text("target_class"),                          // JSON string[] – class names/ids
  targetAccountIds: text("target_account_ids"),               // JSON string[] – specific user ids
  dueDate: timestamp("due_date"),
  status: text("status", { enum: ["DRAFT", "ACTIVE", "COMPLETED", "CANCELLED"] })
    .notNull()
    .default("DRAFT"),
  kioskMode: boolean("kiosk_mode").notNull().default(false),  // open on operator's device for tap-to-pay
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
});

/**
 * Receipt stored when a student/account completes a payment for an event.
 */
export const paymentEventReceipt = pgTable("payment_event_receipt", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  eventId: text("event_id")
    .notNull()
    .references(() => paymentEvent.id, { onDelete: "cascade" }),
  paidByUserId: text("paid_by_user_id")
    .references(() => user.id, { onDelete: "set null" }),
  childId: text("child_id")
    .references(() => child.id, { onDelete: "set null" }),
  // KIOSK_TAP = operator's device tap, SENT = push-sent to parent account
  paymentMode: text("payment_mode", { enum: ["KIOSK_TAP", "SENT"] }).notNull(),
  amount: doublePrecision("amount").notNull(),
  receiptNumber: text("receipt_number").notNull().$defaultFn(() => `RCP-${Date.now()}`),
  notes: text("notes"),
  paidAt: timestamp("paid_at").notNull().$defaultFn(() => new Date()),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
});

// ─── Payment Event Relations ─────────────────────────────

export const paymentEventAccountRelations = relations(paymentEventAccount, ({ one, many }) => ({
  organization: one(organization, { fields: [paymentEventAccount.organizationId], references: [organization.id] }),
  createdByOperator: one(user, { fields: [paymentEventAccount.createdByOperatorId], references: [user.id] }),
  approvedBy: one(user, { fields: [paymentEventAccount.approvedById], references: [user.id] }),
  events: many(paymentEvent),
}));

export const paymentEventRelations = relations(paymentEvent, ({ one, many }) => ({
  organization: one(organization, { fields: [paymentEvent.organizationId], references: [organization.id] }),
  createdByOperator: one(user, { fields: [paymentEvent.createdByOperatorId], references: [user.id] }),
  paymentAccount: one(paymentEventAccount, { fields: [paymentEvent.paymentAccountId], references: [paymentEventAccount.id] }),
  receipts: many(paymentEventReceipt),
}));

export const paymentEventReceiptRelations = relations(paymentEventReceipt, ({ one }) => ({
  event: one(paymentEvent, { fields: [paymentEventReceipt.eventId], references: [paymentEvent.id] }),
  paidByUser: one(user, { fields: [paymentEventReceipt.paidByUserId], references: [user.id] }),
  child: one(child, { fields: [paymentEventReceipt.childId], references: [child.id] }),
}));
