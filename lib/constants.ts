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
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  PARENT: "Parent",
  ADMIN: "Admin",
  OPERATOR: "Operator",
  MANAGEMENT: "Management",
};

// ─── Wallet Transaction Types ────────────────────────────

export const WALLET_TRANSACTION_TYPE = {
  TOP_UP: "TOP_UP",
  DEBIT: "DEBIT",
  REFUND: "REFUND",
} as const;

export type WalletTransactionType =
  (typeof WALLET_TRANSACTION_TYPE)[keyof typeof WALLET_TRANSACTION_TYPE];

export const WALLET_TRANSACTION_LABELS: Record<WalletTransactionType, string> = {
  TOP_UP: "Top Up",
  DEBIT: "Purchase",
  REFUND: "Refund",
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

// ─── Token Code Generation ──────────────────────────────

const TOKEN_CHARSET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L

export function generateTokenCode(): string {
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += TOKEN_CHARSET[Math.floor(Math.random() * TOKEN_CHARSET.length)];
  }
  return code;
}
