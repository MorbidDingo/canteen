"use client";

import { Button } from "@/components/ui/button";
import { motion } from "@/components/ui/motion";
import {
  Wallet,
  Shield,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { ChatMenuCardList, type ChatMenuItem } from "./chat-menu-card";

// ─── Action Types (mirrors API) ─────────────────────────

export type ChatAction =
  | { type: "menu_items"; items: Array<Record<string, unknown>> }
  | { type: "topup"; amount: number }
  | { type: "control"; controlType: string; value: string };

// ─── Render All Actions ─────────────────────────────────

export function ChatActions({ actions }: { actions: ChatAction[] }) {
  if (actions.length === 0) return null;

  return (
    <div className="mt-2 space-y-2">
      {actions.map((action, i) => (
        <ChatActionItem key={i} action={action} />
      ))}
    </div>
  );
}

function ChatActionItem({ action }: { action: ChatAction }) {
  switch (action.type) {
    case "menu_items":
      return <MenuItemsAction items={action.items} />;
    case "topup":
      return <TopupAction amount={action.amount} />;
    case "control":
      return (
        <ControlAction
          controlType={action.controlType}
          value={action.value}
        />
      );
    default:
      return null;
  }
}

// ─── Menu Items Action ──────────────────────────────────

function MenuItemsAction({ items }: { items: Array<Record<string, unknown>> }) {
  const chatItems: ChatMenuItem[] = items
    .filter((item) => item.menuItemId && item.name && item.price != null)
    .map((item) => ({
      menuItemId: String(item.menuItemId),
      name: String(item.name),
      price: Number(item.price),
      discountedPrice: item.discountedPrice != null ? Number(item.discountedPrice) : undefined,
      category: String(item.category ?? ""),
      available: item.available !== false,
      reasons: Array.isArray(item.reasons) ? item.reasons.map(String) : undefined,
    }));

  if (chatItems.length === 0) return null;

  return <ChatMenuCardList items={chatItems} />;
}

// ─── Topup Action ───────────────────────────────────────

function TopupAction({ amount }: { amount: number }) {
  const router = useRouter();

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
    >
      <Button
        size="sm"
        variant="outline"
        className="gap-1.5 rounded-xl text-[12px] border-primary/30 bg-primary/5 hover:bg-primary/10"
        onClick={() => router.push("/wallet")}
      >
        <Wallet className="h-3.5 w-3.5 text-primary" />
        Top up ₹{amount}
      </Button>
    </motion.div>
  );
}

// ─── Control Action ─────────────────────────────────────

const CONTROL_LABELS: Record<string, string> = {
  daily_limit: "Set daily limit",
  per_order_limit: "Set per-order limit",
  block_category: "Block category",
};

function ControlAction({
  controlType,
  value,
}: {
  controlType: string;
  value: string;
}) {
  const router = useRouter();
  const label = CONTROL_LABELS[controlType] ?? `Set ${controlType}`;
  const displayValue =
    controlType.includes("limit") ? `₹${value}` : value.replace(/_/g, " ");

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
    >
      <Button
        size="sm"
        variant="outline"
        className="gap-1.5 rounded-xl text-[12px] border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10"
        onClick={() => router.push("/controls")}
      >
        <Shield className="h-3.5 w-3.5 text-amber-600" />
        {label}: {displayValue}
      </Button>
    </motion.div>
  );
}
