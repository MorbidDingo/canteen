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

export const PLATFORM_FEE_PERCENT = 2;

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
  GENERAL: "GENERAL",
  ADMIN: "ADMIN",
  OPERATOR: "OPERATOR",
  MANAGEMENT: "MANAGEMENT",
  LIB_OPERATOR: "LIB_OPERATOR",
  ATTENDANCE: "ATTENDANCE",
  DEVICE: "DEVICE",
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  PARENT: "Parent",
  GENERAL: "General / Teacher",
  ADMIN: "Admin",
  OPERATOR: "Operator",
  MANAGEMENT: "Management",
  LIB_OPERATOR: "Library Operator",
  ATTENDANCE: "Attendance",
  DEVICE: "Device Account",
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

/** Category-aware instruction suggestions. Returns relevant presets based on item category & name. */
export function getSuggestedInstructions(category: string, name: string): string[] {
  const n = name.toLowerCase();

  // Common base for most food items
  const base: string[] = [];

  switch (category) {
    case "MEALS":
      base.push("Less spicy", "Less oily", "No onion", "Extra roti");
      if (n.includes("rice") || n.includes("biryani") || n.includes("pulao"))
        base.push("Less rice", "Extra raita");
      if (n.includes("dal") || n.includes("curry") || n.includes("sabzi"))
        base.push("Less gravy");
      if (n.includes("thali"))
        base.push("No pickle", "Extra dal");
      break;
    case "SNACKS":
      base.push("Less spicy", "Less oily");
      if (n.includes("sandwich") || n.includes("burger") || n.includes("wrap"))
        base.push("No mayo", "No cheese", "Extra cheese");
      if (n.includes("pav") || n.includes("vada"))
        base.push("No pav", "Extra pav");
      if (n.includes("samosa") || n.includes("pakoda") || n.includes("fry"))
        base.push("Extra chutney");
      if (n.includes("pizza") || n.includes("pasta"))
        base.push("No cheese", "Extra cheese");
      if (n.includes("dosa") || n.includes("idli") || n.includes("uttapam"))
        base.push("Extra chutney", "Extra sambar");
      if (base.length <= 2) base.push("No onion", "Extra chutney");
      break;
    case "DRINKS":
      base.push("Less sugar", "No ice");
      if (n.includes("tea") || n.includes("chai") || n.includes("coffee"))
        base.push("Less milk", "Strong");
      if (n.includes("juice") || n.includes("shake") || n.includes("smoothie") || n.includes("lassi"))
        base.push("No sugar", "Extra cold");
      break;
    case "PACKED_FOOD":
      base.push("Heat before serving");
      break;
    default:
      base.push("Less spicy", "Less oily", "No onion");
  }

  // Deduplicate and limit to 5
  return [...new Set(base)].slice(0, 5);
}

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

export type BookCategory = string;

export const BOOK_CATEGORY_LABELS: Record<string, string> = {
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
  fine_mode: "DAY",
  fine_per_day: "0",
  fine_per_week: "0",
  max_fine_per_book: "100",
  allow_self_service_issue: "true",
  penalty_limit_per_student: "0",
  request_hold_hours: "48",
};

// ─── App Settings Defaults ───────────────────────────────

export const APP_SETTINGS_DEFAULTS: Record<string, string> = {
  subscription_min_order_value: "60",
  subscription_min_days: "3",
  subscription_max_days: "180",
  subscription_breaks_json: JSON.stringify(DEFAULT_BREAK_SLOTS),
};

/** Maximum number of active (PENDING) pre-orders per child */
export const MAX_ACTIVE_PREORDERS_PER_CHILD = 1;
/** Legacy alias kept for compatibility */
export const MAX_ACTIVE_PREORDERS = MAX_ACTIVE_PREORDERS_PER_CHILD;

/** Maximum number of children allowed per parent account */
export const MAX_CHILDREN_PER_PARENT = 4;

// ─── Certe+ Premium Subscription ─────────────────────────

export const CERTE_PLUS_PLANS = {
  WEEKLY: { key: "WEEKLY", label: "Weekly", price: 79, days: 7, duration: "7 days" },
  MONTHLY: { key: "MONTHLY", label: "Monthly", price: 129, days: 30, duration: "30 days" },
  THREE_MONTHS: { key: "THREE_MONTHS", label: "3 Months", price: 349, days: 90, duration: "90 days" },
  SIX_MONTHS: { key: "SIX_MONTHS", label: "6 Months", price: 729, days: 180, duration: "180 days" },
} as const;

export const CERTE_PLUS_PLAN_LIST = Object.values(CERTE_PLUS_PLANS);

export type CertePlusPlan = keyof typeof CERTE_PLUS_PLANS;

export const CERTE_PLUS = {
  MONTHLY_PRICE: 129, // default plan price (monthly)
  WALLET_OVERDRAFT_LIMIT: 299,
  LIBRARY_PENALTY_ALLOWANCE: 10,
  PRE_ORDER_MIN_SCHOOL_DAYS: 5, // minimum 1 week (5 school days)
  PRE_ORDER_PLATFORM_FEE_PERCENT: PLATFORM_FEE_PERCENT, // 2% platform fee on pre-order payments
} as const;

// ─── Organization Owner Subscription Plans ──────────────

export const OWNER_ORG_PLANS = {
  BASIC: {
    key: "BASIC",
    label: "Basic",
    price: 499,
    orgLimit: 1,
    durationDays: 30,
    description: "Best for a single school campus.",
  },
  PREMIUM: {
    key: "PREMIUM",
    label: "Premium",
    price: 1499,
    orgLimit: 3,
    durationDays: 30,
    description: "For growing groups with up to three organizations.",
  },
  MEGA: {
    key: "MEGA",
    label: "Mega",
    price: 3999,
    orgLimit: 10,
    durationDays: 30,
    description: "For large networks managing up to ten organizations.",
  },
} as const;

export type OwnerOrgPlan = keyof typeof OWNER_ORG_PLANS;
export const OWNER_ORG_PLAN_LIST = Object.values(OWNER_ORG_PLANS);

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

// ─── Book Reader ────────────────────────────────────────

export const READER_MAX_ACTIVE_BOOKS = 3;

export const READING_MODES = {
  LIGHT: "LIGHT",
  DARK: "DARK",
  BLUE_LIGHT: "BLUE_LIGHT",
  GREY: "GREY",
} as const;

export type ReadingMode = (typeof READING_MODES)[keyof typeof READING_MODES];

export const READING_MODE_LABELS: Record<ReadingMode, string> = {
  LIGHT: "Light",
  DARK: "Dark",
  BLUE_LIGHT: "Blue Light Filter",
  GREY: "Grey",
};

import { DEFAULT_BREAK_SLOTS } from "@/lib/break-slots";

// ─── Timetable Scheduling ────────────────────────────────

export const TIMETABLE_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export type TimetableDay = (typeof TIMETABLE_DAYS)[number];

export const TIMETABLE_DAY_LABELS: Record<TimetableDay, string> = {
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
  Sat: "Saturday",
};

export const TIMETABLE_STATUS = {
  DRAFT: "DRAFT",
  ACTIVE: "ACTIVE",
  ARCHIVED: "ARCHIVED",
} as const;

export type TimetableStatus = (typeof TIMETABLE_STATUS)[keyof typeof TIMETABLE_STATUS];

export const TIMETABLE_STATUS_LABELS: Record<TimetableStatus, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  ARCHIVED: "Archived",
};

export const TIMETABLE_STATUS_COLORS: Record<TimetableStatus, string> = {
  DRAFT: "bg-amber-100 text-amber-700",
  ACTIVE: "bg-emerald-100 text-emerald-700",
  ARCHIVED: "bg-slate-100 text-slate-600",
};

export const ROOM_TYPES = {
  REGULAR: "REGULAR",
  LAB: "LAB",
  AUDITORIUM: "AUDITORIUM",
  LIBRARY: "LIBRARY",
  SPORTS: "SPORTS",
  OTHER: "OTHER",
} as const;

export type RoomType = (typeof ROOM_TYPES)[keyof typeof ROOM_TYPES];

export const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  REGULAR: "Classroom",
  LAB: "Laboratory",
  AUDITORIUM: "Auditorium",
  LIBRARY: "Library",
  SPORTS: "Sports",
  OTHER: "Other",
};

export const CONSTRAINT_TYPES = {
  HARD: "HARD",
  SOFT: "SOFT",
} as const;

export type ConstraintType = (typeof CONSTRAINT_TYPES)[keyof typeof CONSTRAINT_TYPES];

export const CONSTRAINT_CATEGORIES = {
  NO_TEACHER_DOUBLE_BOOKING: "NO_TEACHER_DOUBLE_BOOKING",
  NO_ROOM_DOUBLE_BOOKING: "NO_ROOM_DOUBLE_BOOKING",
  NO_GROUP_DOUBLE_BOOKING: "NO_GROUP_DOUBLE_BOOKING",
  ROOM_CAPACITY: "ROOM_CAPACITY",
  TEACHER_MAX_PERIODS_DAY: "TEACHER_MAX_PERIODS_DAY",
  TEACHER_MAX_PERIODS_WEEK: "TEACHER_MAX_PERIODS_WEEK",
  TEACHER_CONSECUTIVE_LIMIT: "TEACHER_CONSECUTIVE_LIMIT",
  TEACHER_PREFERRED_SLOTS: "TEACHER_PREFERRED_SLOTS",
  TEACHER_UNAVAILABLE_SLOTS: "TEACHER_UNAVAILABLE_SLOTS",
  SUBJECT_PREFERRED_TIME: "SUBJECT_PREFERRED_TIME",
  SUBJECT_MAX_CONSECUTIVE: "SUBJECT_MAX_CONSECUTIVE",
  BALANCED_DAILY_LOAD: "BALANCED_DAILY_LOAD",
  MINIMIZE_ROOM_CHANGES: "MINIMIZE_ROOM_CHANGES",
  CUSTOM: "CUSTOM",
} as const;

export type ConstraintCategory = (typeof CONSTRAINT_CATEGORIES)[keyof typeof CONSTRAINT_CATEGORIES];

export const CONSTRAINT_CATEGORY_LABELS: Record<ConstraintCategory, string> = {
  NO_TEACHER_DOUBLE_BOOKING: "No Teacher Double-Booking",
  NO_ROOM_DOUBLE_BOOKING: "No Room Double-Booking",
  NO_GROUP_DOUBLE_BOOKING: "No Group Double-Booking",
  ROOM_CAPACITY: "Room Capacity Check",
  TEACHER_MAX_PERIODS_DAY: "Teacher Max Periods/Day",
  TEACHER_MAX_PERIODS_WEEK: "Teacher Max Periods/Week",
  TEACHER_CONSECUTIVE_LIMIT: "Teacher Consecutive Limit",
  TEACHER_PREFERRED_SLOTS: "Teacher Preferred Time Slots",
  TEACHER_UNAVAILABLE_SLOTS: "Teacher Unavailable Slots",
  SUBJECT_PREFERRED_TIME: "Subject Preferred Time",
  SUBJECT_MAX_CONSECUTIVE: "Subject Max Consecutive Periods",
  BALANCED_DAILY_LOAD: "Balanced Daily Load",
  MINIMIZE_ROOM_CHANGES: "Minimize Room Changes",
  CUSTOM: "Custom Constraint",
};

export const DEFAULT_SUBJECT_COLORS = [
  "#6366f1", "#ec4899", "#f59e0b", "#10b981", "#3b82f6",
  "#8b5cf6", "#ef4444", "#14b8a6", "#f97316", "#06b6d4",
  "#84cc16", "#e879f9", "#22d3ee", "#a855f7", "#fb923c",
] as const;
