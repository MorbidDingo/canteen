// ─── Order Statuses ──────────────────────────────────────

export const ORDER_STATUS = {
  PLACED: "PLACED",
  PREPARING: "PREPARING",
  SERVED: "SERVED",
  CANCELLED: "CANCELLED",
} as const;

export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PLACED: "Placed",
  PREPARING: "Preparing",
  SERVED: "Served",
  CANCELLED: "Cancelled",
};

export const ORDER_STATUS_COLORS: Record<OrderStatus, string> = {
  PLACED: "bg-[#2eab57]/15 text-[#1e7a3c]",
  PREPARING: "bg-[#f58220]/15 text-[#c66a10]",
  SERVED: "bg-[#1a3a8f]/10 text-[#1a3a8f]",
  CANCELLED: "bg-[#e32726]/10 text-[#e32726]",
};

// ─── Payment ─────────────────────────────────────────────

export const PAYMENT_METHOD = {
  CASH: "CASH",
  UPI: "UPI",
  ONLINE: "ONLINE",
  WALLET: "WALLET",
} as const;

export type PaymentMethod = (typeof PAYMENT_METHOD)[keyof typeof PAYMENT_METHOD];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Cash",
  UPI: "UPI",
  ONLINE: "Razorpay",
  WALLET: "Wallet",
};

export const PAYMENT_STATUS = {
  PAID: "PAID",
  UNPAID: "UNPAID",
} as const;

export type PaymentStatus = (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS];

export const PAYMENT_STATUS_COLORS: Record<PaymentStatus, string> = {
  PAID: "bg-[#2eab57]/15 text-[#1e7a3c]",
  UNPAID: "bg-[#f58220]/15 text-[#c66a10]",
};

// ─── Menu Categories ─────────────────────────────────────

export const MENU_CATEGORIES = {
  SNACKS: "SNACKS",
  MEALS: "MEALS",
  DRINKS: "DRINKS",
  PACKED_FOOD: "PACKED_FOOD",
} as const;

export type MenuCategory = (typeof MENU_CATEGORIES)[keyof typeof MENU_CATEGORIES];

export const MENU_CATEGORY_LABELS: Record<MenuCategory, string> = {
  SNACKS: "Snacks",
  MEALS: "Meals",
  DRINKS: "Drinks",
  PACKED_FOOD: "Packed Food",
};

export const MENU_CATEGORY_COLORS: Record<MenuCategory, string> = {
  SNACKS: "bg-[#f58220]/15 text-[#c66a10]",
  MEALS: "bg-[#1a3a8f]/10 text-[#1a3a8f]",
  DRINKS: "bg-[#2eab57]/15 text-[#1e7a3c]",
  PACKED_FOOD: "bg-[#e32726]/10 text-[#e32726]",
};

// ─── User Roles ──────────────────────────────────────────

export const USER_ROLES = {
  PARENT: "PARENT",
  ADMIN: "ADMIN",
  OPERATOR: "OPERATOR",
  MANAGEMENT: "MANAGEMENT",
  LIB_OPERATOR: "LIB_OPERATOR",
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  PARENT: "Parent",
  ADMIN: "Admin",
  OPERATOR: "Operator",
  MANAGEMENT: "Management",
  LIB_OPERATOR: "Library Operator",
};

// ─── Wallet Transaction Types ────────────────────────────

export const WALLET_TRANSACTION_TYPE = {
  TOP_UP: "TOP_UP",
  DEBIT: "DEBIT",
  REFUND: "REFUND",
  LIBRARY_FINE: "LIBRARY_FINE",
} as const;

export type WalletTransactionType =
  (typeof WALLET_TRANSACTION_TYPE)[keyof typeof WALLET_TRANSACTION_TYPE];

export const WALLET_TRANSACTION_LABELS: Record<WalletTransactionType, string> = {
  TOP_UP: "Top Up",
  DEBIT: "Purchase",
  REFUND: "Refund",
  LIBRARY_FINE: "Library Fine",
};

// ─── Pre-Order Statuses ──────────────────────────────────

export const PRE_ORDER_STATUS = {
  PENDING: "PENDING",
  FULFILLED: "FULFILLED",
  EXPIRED: "EXPIRED",
  CANCELLED: "CANCELLED",
} as const;

export type PreOrderStatus =
  (typeof PRE_ORDER_STATUS)[keyof typeof PRE_ORDER_STATUS];

export const PRE_ORDER_STATUS_LABELS: Record<PreOrderStatus, string> = {
  PENDING: "Pending",
  FULFILLED: "Fulfilled",
  EXPIRED: "Expired",
  CANCELLED: "Cancelled",
};

// ─── Predefined Instructions ─────────────────────────────

export const PREDEFINED_INSTRUCTIONS = [
  "Less oily",
  "No pav",
  "Less spicy",
  "No onion",
] as const;

// ─── Discount Types ──────────────────────────────────────

export const DISCOUNT_TYPE = {
  PERCENTAGE: "PERCENTAGE",
  FLAT: "FLAT",
} as const;

export type DiscountType = (typeof DISCOUNT_TYPE)[keyof typeof DISCOUNT_TYPE];

export const DISCOUNT_TYPE_LABELS: Record<DiscountType, string> = {
  PERCENTAGE: "Percentage",
  FLAT: "Flat Amount",
};

export const DISCOUNT_MODE = {
  AUTO: "AUTO",
  MANUAL: "MANUAL",
} as const;

export type DiscountMode = (typeof DISCOUNT_MODE)[keyof typeof DISCOUNT_MODE];

export const DISCOUNT_MODE_LABELS: Record<DiscountMode, string> = {
  AUTO: "Auto-applied",
  MANUAL: "Manual",
};

// ─── Analytics ───────────────────────────────────────────

export const CONFIDENCE_LEVELS = {
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW",
} as const;

export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[keyof typeof CONFIDENCE_LEVELS];

export const CONFIDENCE_COLORS: Record<ConfidenceLevel, string> = {
  HIGH: "bg-emerald-500/15 text-emerald-700",
  MEDIUM: "bg-amber-500/15 text-amber-700",
  LOW: "bg-red-500/15 text-red-700",
};

export const CATEGORY_CHART_COLORS: Record<MenuCategory, string> = {
  SNACKS: "#f58220",
  MEALS: "#1a3a8f",
  DRINKS: "#2eab57",
  PACKED_FOOD: "#e32726",
};

// ─── Token Code Generation ──────────────────────────────

const TOKEN_CHARSET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L

export function generateTokenCode(): string {
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += TOKEN_CHARSET[Math.floor(Math.random() * TOKEN_CHARSET.length)];
  }
  return code;
}

// ─── Library: Book Categories ────────────────────────────

export const BOOK_CATEGORIES = {
  FICTION: "FICTION",
  NON_FICTION: "NON_FICTION",
  TEXTBOOK: "TEXTBOOK",
  REFERENCE: "REFERENCE",
  PERIODICAL: "PERIODICAL",
  GENERAL: "GENERAL",
} as const;

export type BookCategory = (typeof BOOK_CATEGORIES)[keyof typeof BOOK_CATEGORIES];

export const BOOK_CATEGORY_LABELS: Record<BookCategory, string> = {
  FICTION: "Fiction",
  NON_FICTION: "Non-Fiction",
  TEXTBOOK: "Textbook",
  REFERENCE: "Reference",
  PERIODICAL: "Periodical",
  GENERAL: "General",
};

// ─── Library: Book Copy Status ───────────────────────────

export const BOOK_COPY_STATUS = {
  AVAILABLE: "AVAILABLE",
  ISSUED: "ISSUED",
  LOST: "LOST",
  DAMAGED: "DAMAGED",
  RETIRED: "RETIRED",
} as const;

export type BookCopyStatus = (typeof BOOK_COPY_STATUS)[keyof typeof BOOK_COPY_STATUS];

export const BOOK_COPY_STATUS_LABELS: Record<BookCopyStatus, string> = {
  AVAILABLE: "Available",
  ISSUED: "Issued",
  LOST: "Lost",
  DAMAGED: "Damaged",
  RETIRED: "Retired",
};

// ─── Library: Book Copy Condition ────────────────────────

export const BOOK_COPY_CONDITION = {
  NEW: "NEW",
  GOOD: "GOOD",
  FAIR: "FAIR",
  POOR: "POOR",
  DAMAGED: "DAMAGED",
} as const;

export type BookCopyCondition = (typeof BOOK_COPY_CONDITION)[keyof typeof BOOK_COPY_CONDITION];

export const BOOK_COPY_CONDITION_LABELS: Record<BookCopyCondition, string> = {
  NEW: "New",
  GOOD: "Good",
  FAIR: "Fair",
  POOR: "Poor",
  DAMAGED: "Damaged",
};

// ─── Library: Issuance Status ────────────────────────────

export const ISSUANCE_STATUS = {
  ISSUED: "ISSUED",
  RETURNED: "RETURNED",
  OVERDUE: "OVERDUE",
  LOST: "LOST",
  RETURN_PENDING: "RETURN_PENDING",
} as const;

export type IssuanceStatus = (typeof ISSUANCE_STATUS)[keyof typeof ISSUANCE_STATUS];

export const ISSUANCE_STATUS_LABELS: Record<IssuanceStatus, string> = {
  ISSUED: "Issued",
  RETURNED: "Returned",
  OVERDUE: "Overdue",
  LOST: "Lost",
  RETURN_PENDING: "Return Pending",
};

export const ISSUANCE_STATUS_COLORS: Record<IssuanceStatus, string> = {
  ISSUED: "bg-[#1a3a8f]/10 text-[#1a3a8f]",
  RETURNED: "bg-[#2eab57]/15 text-[#1e7a3c]",
  OVERDUE: "bg-[#e32726]/10 text-[#e32726]",
  LOST: "bg-[#e32726]/10 text-[#e32726]",
  RETURN_PENDING: "bg-[#f58220]/15 text-[#c66a10]",
};

// ─── Library: Settings Defaults ──────────────────────────

export const LIBRARY_SETTINGS_DEFAULTS: Record<string, string> = {
  issue_duration_days: "7",
  max_reissues: "3",
  reissue_duration_days: "7",
  max_books_per_student: "3",
  require_operator_return_confirmation: "false",
  block_issue_if_overdue: "true",
  fine_per_day: "0",
  max_fine_per_book: "100",
  allow_self_service_issue: "true",
};

// ─── App Settings Defaults ───────────────────────────────

export const APP_SETTINGS_DEFAULTS: Record<string, string> = {
  subscription_min_order_value: "60",
  subscription_min_days: "3",
  subscription_max_days: "180",
};

// ─── Certe+ Premium Subscription ─────────────────────────

export const CERTE_PLUS = {
  MONTHLY_PRICE: 99,
  WALLET_OVERDRAFT_LIMIT: 200,
  LIBRARY_PENALTY_ALLOWANCE: 5,
} as const;

// ─── Gate Direction ─────────────────────────────────────

export const GATE_DIRECTION = {
  ENTRY: "ENTRY",
  EXIT: "EXIT",
} as const;

export type GateDirection = (typeof GATE_DIRECTION)[keyof typeof GATE_DIRECTION];

export const GATE_DIRECTION_LABELS: Record<GateDirection, string> = {
  ENTRY: "Entry",
  EXIT: "Exit",
};

/** Cooldown in milliseconds between consecutive taps for the same card */
export const GATE_TAP_COOLDOWN_MS = 3000;
