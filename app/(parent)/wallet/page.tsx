"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Wallet as WalletIcon,
  ArrowUpCircle,
  ArrowDownCircle,
  RotateCcw,
  Loader2,
  IndianRupee,
  Plus,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  WALLET_TRANSACTION_LABELS,
  type WalletTransactionType,
} from "@/lib/constants";

// Extend Window for Razorpay checkout
declare global {
  interface Window {
    Razorpay: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  handler: (response: RazorpayResponse) => void;
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
  modal?: { ondismiss?: () => void };
}

interface RazorpayResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

interface RazorpayInstance {
  open: () => void;
  close: () => void;
}

type ChildWallet = {
  childId: string;
  childName: string;
  parentName: string;
  rfidCardLast3: string | null;
  balance: number;
};

type Transaction = {
  id: string;
  type: WalletTransactionType;
  amount: number;
  balanceAfter: number;
  description: string | null;
  createdAt: string;
};

const QUICK_AMOUNTS = [100, 200, 500, 1000];

export default function WalletPage() {
  const router = useRouter();
  const [wallets, setWallets] = useState<ChildWallet[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string>("");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [txLoading, setTxLoading] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState<string>("");
  const [topUpLoading, setTopUpLoading] = useState(false);
  const cardTrackRef = useRef<HTMLDivElement>(null);
  const cardScrollRafRef = useRef<number | null>(null);
  const selectedChildIdRef = useRef(selectedChildId);

  // Load Razorpay checkout script
  useEffect(() => {
    if (typeof window !== "undefined" && !window.Razorpay) {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      document.head.appendChild(script);
    }
  }, []);

  const fetchWallets = useCallback(async () => {
    try {
      const res = await fetch("/api/wallet");
      if (res.ok) {
        const data: ChildWallet[] = await res.json();
        setWallets(data);
        setSelectedChildId((prev) => {
          if (!prev && data.length > 0) return data[0].childId;
          return prev;
        });
      }
    } catch {
      toast.error("Failed to load wallets");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTransactions = useCallback(async (childId: string) => {
    setTxLoading(true);
    try {
      const res = await fetch(`/api/wallet/transactions?childId=${childId}`);
      if (res.ok) {
        setTransactions(await res.json());
      }
    } catch {
      toast.error("Failed to load transactions");
    } finally {
      setTxLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWallets();
  }, [fetchWallets]);

  useEffect(() => {
    selectedChildIdRef.current = selectedChildId;
  }, [selectedChildId]);

  useEffect(() => {
    if (selectedChildId) {
      fetchTransactions(selectedChildId);
    }
  }, [selectedChildId, fetchTransactions]);

  const selectedWallet = wallets.find((w) => w.childId === selectedChildId);
  const selectedWalletIndex = wallets.findIndex((w) => w.childId === selectedChildId);

  const handleCardScroll = useCallback(() => {
    const track = cardTrackRef.current;
    if (!track || wallets.length === 0) return;
    if (cardScrollRafRef.current !== null) {
      return;
    }
    cardScrollRafRef.current = window.requestAnimationFrame(() => {
      cardScrollRafRef.current = null;
      const firstCard = track.firstElementChild as HTMLElement | null;
      const cardWidth = firstCard?.clientWidth ?? track.clientWidth;
      const cardGap = parseFloat(window.getComputedStyle(track).columnGap || "0");
      const cardSpan = cardWidth + cardGap;
      if (cardWidth === 0) return;
      const nextIndex = Math.round(track.scrollLeft / cardSpan);
      const nextWallet = wallets[Math.max(0, Math.min(nextIndex, wallets.length - 1))];
      if (nextWallet && nextWallet.childId !== selectedChildIdRef.current) {
        setSelectedChildId(nextWallet.childId);
      }
    });
  }, [wallets]);

  useEffect(() => {
    return () => {
      if (cardScrollRafRef.current !== null) {
        cancelAnimationFrame(cardScrollRafRef.current);
      }
    };
  }, []);

  const scrollToWallet = useCallback((walletIndex: number) => {
    const track = cardTrackRef.current;
    if (!track) return;
    const firstCard = track.firstElementChild as HTMLElement | null;
    const cardWidth = firstCard?.clientWidth ?? track.clientWidth;
    const cardGap = parseFloat(window.getComputedStyle(track).columnGap || "0");
    track.scrollTo({
      left: (cardWidth + cardGap) * walletIndex,
      behavior: "smooth",
    });
  }, []);

  useEffect(() => {
    if (!selectedChildId && wallets.length > 0) {
      setSelectedChildId(wallets[0].childId);
    }
  }, [selectedChildId, wallets]);

  useEffect(() => {
    if (!selectedChildId || wallets.length === 0 || selectedWalletIndex < 0) return;
    scrollToWallet(selectedWalletIndex);
  }, [selectedChildId, selectedWalletIndex, scrollToWallet, wallets.length]);

  const handleRazorpayTopUp = (
    razorpayOrderId: string,
    amountPaise: number,
    keyId: string,
    walletId: string,
    childName: string,
  ): Promise<{ newBalance: number }> => {
    return new Promise((resolve, reject) => {
      if (!window.Razorpay) {
        reject(
          new Error("Payment SDK not loaded. Please refresh and try again."),
        );
        return;
      }

      const options: RazorpayOptions = {
        key: keyId,
        amount: amountPaise,
        currency: "INR",
        name: "Venus Café",
        description: `Wallet top-up for ${childName}`,
        order_id: razorpayOrderId,
        handler: async (response: RazorpayResponse) => {
          try {
            const verifyRes = await fetch("/api/wallet/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                walletId,
                amount: amountPaise,
              }),
            });

            if (!verifyRes.ok) {
              const data = await verifyRes.json();
              reject(new Error(data.error || "Payment verification failed"));
              return;
            }

            const result = await verifyRes.json();
            resolve(result);
          } catch (err) {
            reject(err);
          }
        },
        theme: { color: "var(--primary)" },
        modal: {
          ondismiss: () => {
            reject(new Error("Payment cancelled"));
          },
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    });
  };

  const handleTopUp = async () => {
    const amount = parseFloat(topUpAmount);
    if (isNaN(amount) || amount < 10 || amount > 5000) {
      toast.error("Enter an amount between ₹10 and ₹5,000");
      return;
    }

    if (!selectedChildId) {
      toast.error("Select a child first");
      return;
    }

    setTopUpLoading(true);
    try {
      // Step 1: Create Razorpay order
      const res = await fetch("/api/wallet/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ childId: selectedChildId, amount }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create top-up order");
      }

      const {
        razorpayOrderId,
        amount: amountPaise,
        keyId,
        walletId,
      } = await res.json();

      const childName =
        wallets.find((w) => w.childId === selectedChildId)?.childName || "";

      // Step 2: Open Razorpay checkout and wait for result
      const { newBalance } = await handleRazorpayTopUp(
        razorpayOrderId,
        amountPaise,
        keyId,
        walletId,
        childName,
      );

      toast.success(`₹${amount.toFixed(0)} added to wallet!`);
      setTopUpAmount("");

      // Update wallet balance locally
      setWallets((prev) =>
        prev.map((w) =>
          w.childId === selectedChildId ? { ...w, balance: newBalance } : w,
        ),
      );

      // Refresh transactions
      fetchTransactions(selectedChildId);
    } catch (err) {
      if (err instanceof Error && err.message === "Payment cancelled") {
        toast.info("Payment cancelled");
      } else {
        toast.error(
          err instanceof Error ? err.message : "Failed to initiate payment",
        );
      }
    } finally {
      setTopUpLoading(false);
    }
  };

  const txIcon = (type: WalletTransactionType) => {
    switch (type) {
      case "TOP_UP":
        return <ArrowUpCircle className="h-4 w-4 text-emerald-500" />;
      case "DEBIT":
        return <ArrowDownCircle className="h-4 w-4 text-destructive" />;
      case "REFUND":
        return <RotateCcw className="h-4 w-4 text-primary" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (wallets.length === 0) {
    return (
      <div className="container mx-auto max-w-lg px-4 py-6 space-y-4">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2 w-fit gap-1.5"
          onClick={() => router.push("/settings")}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Settings
        </Button>

        <Card>
          <CardContent className="pt-8 pb-8 text-center">
            <WalletIcon className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">
              No wallets found. Add a child first to see their wallet.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-lg px-4 py-6 space-y-6">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="-ml-2 w-fit gap-1.5"
        onClick={() => router.push("/settings")}
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Settings
      </Button>

      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <WalletIcon className="h-6 w-6 text-primary" />
          Wallet
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage wallet balance and add money online
        </p>
      </div>

      {/* Swipeable stacked premium wallet cards */}
      <div className="relative">
        {wallets.length > 1 && (
          <>
            <div className="absolute inset-x-8 top-3 h-full rounded-2xl border border-amber-200/10 bg-zinc-950/70" />
            <div className="absolute inset-x-4 top-1.5 h-full rounded-2xl border border-amber-100/10 bg-zinc-900/75" />
          </>
        )}
        <div
          ref={cardTrackRef}
          className="relative z-10 flex gap-3 overflow-x-auto px-2 snap-x snap-mandatory scroll-px-2 scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          onScroll={handleCardScroll}
        >
          {wallets.map((walletItem, index) => (
            <button
              key={walletItem.childId}
              type="button"
              onClick={() => {
                setSelectedChildId(walletItem.childId);
                scrollToWallet(index);
              }}
              className="min-w-[88%] snap-center text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              aria-label={`Select ${walletItem.childName} wallet card`}
            >
              <div className="wallet-card-premium rounded-2xl border border-white/10 shadow-2xl">
                <div className="relative z-10 px-6 py-6 space-y-7">
                  <div>
                    <p className="text-2xl font-semibold tracking-wide text-shimmer-silver text-engraved-silver">
                      {walletItem.childName}
                    </p>
                    <p className="text-sm mt-1 text-shimmer-silver-soft text-engraved-silver-soft">
                      {walletItem.parentName}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-[0.2em] text-white/55">
                      Balance
                    </p>
                    <p className="text-4xl font-bold flex items-center gap-1 text-shimmer-gold text-engraved-gold">
                      <IndianRupee className="h-8 w-8" />
                      {walletItem.balance.toFixed(2)}
                    </p>
                  </div>
                  <p className="text-sm tracking-[0.3em] text-shimmer-silver text-engraved-silver">
                    ••• ••• ••• {walletItem.rfidCardLast3 ?? "•••"}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
        {wallets.length > 1 && (
          <>
            <div className="mt-2 flex items-center justify-center gap-3 text-amber-300/85">
              <button
                type="button"
                className="rounded-full border border-amber-200/35 bg-amber-200/10 p-1.5 transition hover:bg-amber-200/20"
                onClick={() => {
                  const nextIndex = Math.max(0, selectedWalletIndex - 1);
                  setSelectedChildId(wallets[nextIndex].childId);
                  scrollToWallet(nextIndex);
                }}
                aria-label="View previous wallet card"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <p className="text-[11px] tracking-[0.2em] text-center uppercase text-amber-100/80">
                Swipe or tap the next card
              </p>
              <button
                type="button"
                className="rounded-full border border-amber-200/35 bg-amber-200/10 p-1.5 transition hover:bg-amber-200/20"
                onClick={() => {
                  const nextIndex = Math.min(wallets.length - 1, selectedWalletIndex + 1);
                  setSelectedChildId(wallets[nextIndex].childId);
                  scrollToWallet(nextIndex);
                }}
                aria-label="View next wallet card"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="mt-2 flex items-center justify-center gap-1.5">
              {wallets.map((walletItem, index) => (
                <button
                  key={walletItem.childId}
                  type="button"
                  className={`h-1.5 rounded-full transition-all ${
                    selectedChildId === walletItem.childId
                      ? "w-6 bg-primary"
                      : "w-2 bg-muted-foreground/40"
                  }`}
                  onClick={() => {
                    setSelectedChildId(walletItem.childId);
                    scrollToWallet(index);
                  }}
                  aria-label={`View ${walletItem.childName} wallet card`}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Top-up card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add Money
          </CardTitle>
          <CardDescription>
            Add money to {selectedWallet?.childName || "your child"}&apos;s
            wallet via UPI / Card / Net Banking
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Quick amount buttons */}
          <div className="grid grid-cols-4 gap-2">
            {QUICK_AMOUNTS.map((amt) => (
              <Button
                key={amt}
                variant={topUpAmount === String(amt) ? "default" : "outline"}
                size="sm"
                onClick={() => setTopUpAmount(String(amt))}
                className={
                  topUpAmount === String(amt) ? "btn-gradient btn-shimmer" : ""
                }
              >
                ₹{amt}
              </Button>
            ))}
          </div>

          {/* Custom amount input */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                ₹
              </span>
              <Input
                type="number"
                min={10}
                max={5000}
                placeholder="Enter amount"
                value={topUpAmount}
                onChange={(e) => setTopUpAmount(e.target.value)}
                className="pl-7"
              />
            </div>
            <Button
              onClick={handleTopUp}
              disabled={topUpLoading || !topUpAmount}
              className="btn-gradient btn-shimmer min-w-[120px]"
            >
              {topUpLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <IndianRupee className="h-4 w-4 mr-1" />
                  Add Money
                </>
              )}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Min ₹10 • Max ₹5,000 • Powered by Razorpay
          </p>
        </CardContent>
      </Card>

      {/* Transaction history */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recent Transactions</CardTitle>
          <CardDescription>Last 50 transactions</CardDescription>
        </CardHeader>
        <CardContent>
          {txLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : transactions.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-6">
              No transactions yet
            </p>
          ) : (
            <div className="space-y-3">
              {transactions.map((tx) => (
                <div key={tx.id}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {txIcon(tx.type)}
                      <div>
                        <p className="text-sm font-medium">
                          {WALLET_TRANSACTION_LABELS[tx.type]}
                        </p>
                        {tx.description && (
                          <p className="text-xs text-muted-foreground">
                            {tx.description}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {new Date(tx.createdAt).toLocaleString("en-IN")}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p
                        className={`font-semibold ${
                          tx.type === "DEBIT"
                            ? "text-destructive"
                            : "text-emerald-500"
                        }`}
                      >
                        {tx.type === "DEBIT" ? "-" : "+"}₹{tx.amount.toFixed(2)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Bal: ₹{tx.balanceAfter.toFixed(2)}
                      </p>
                    </div>
                  </div>
                  <Separator className="mt-3" />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
