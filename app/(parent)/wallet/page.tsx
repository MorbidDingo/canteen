"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
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
  Plus,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import {
  WALLET_TRANSACTION_LABELS,
  type WalletTransactionType,
} from "@/lib/constants";

// ─── Razorpay types ───────────────────────────────────────────────────────────
declare global {
  interface Window {
    Razorpay: new (options: RazorpayOptions) => RazorpayInstance;
  }
}
interface RazorpayOptions {
  key: string; amount: number; currency: string;
  name: string; description: string; order_id: string;
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
interface RazorpayInstance { open: () => void; close: () => void; }

// ─── Domain types ─────────────────────────────────────────────────────────────
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
const CARD_H     = 200;
const GHOST_STEP = 10;

// ─── Injected CSS ─────────────────────────────────────────────────────────────
const WALLET_CSS = `
  /* ── Student name: bright gold engraved ─────────────────── */
  .wt-gold {
    background: linear-gradient(105deg,
      #c49a1a 0%,  #e8c14a 18%, #fde97a 32%,
      #fff5b0 50%, #fde97a 68%, #e8c14a 82%, #c49a1a 100%);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    filter:
      drop-shadow(0  1.5px 0 rgba(0,0,0,0.95))
      drop-shadow(0 -0.8px 0 rgba(255,240,130,0.30));
  }

  /* ── Parent name: mid gold engraved ─────────────────────── */
  .wt-gold-sm {
    background: linear-gradient(105deg,
      #9a7512 0%,  #c49928 18%, #e8c050 32%,
      #f8dea0 50%, #e8c050 68%, #c49928 82%, #9a7512 100%);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    filter:
      drop-shadow(0  1.5px 0 rgba(0,0,0,0.95))
      drop-shadow(0 -0.8px 0 rgba(240,195,90,0.22));
  }

  /* ── Balance: bright silver engraved ────────────────────── */
  .wt-silver {
    background: linear-gradient(105deg,
      #8c8c8c 0%, #c8c8c8 18%, #eaeaea 32%,
      #ffffff 50%, #eaeaea 68%, #c8c8c8 82%, #8c8c8c 100%);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    filter:
      drop-shadow(0  1.5px 0 rgba(0,0,0,0.95))
      drop-shadow(0 -0.8px 0 rgba(255,255,255,0.28));
  }

  /* ── Card number: mid silver engraved ───────────────────── */
  .wt-silver-sm {
    background: linear-gradient(105deg,
      #707070 0%, #aaaaaa 18%, #d0d0d0 32%,
      #f0f0f0 50%, #d0d0d0 68%, #aaaaaa 82%, #707070 100%);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    filter:
      drop-shadow(0  1.5px 0 rgba(0,0,0,0.95))
      drop-shadow(0 -0.8px 0 rgba(255,255,255,0.18));
  }

  /* ── Card body ───────────────────────────────────────────── */
  .w-card-face {
    background:
      radial-gradient(ellipse at 20% 30%, rgba(80,58,16,0.35) 0%, transparent 50%),
      radial-gradient(ellipse at 80% 75%, rgba(50,38,10,0.28) 0%, transparent 48%),
      linear-gradient(148deg,
        #1a1a1a 0%,  #222222 28%,
        #181818 55%, #202020 78%,
        #191919 100%);
    border: 1px solid rgba(212,175,55,0.16);
    /* no outer shadow */
  }

  /* ── Ghost card ─────────────────────────────────────────── */
  .w-card-ghost {
    background: linear-gradient(148deg, #111111 0%, #181818 50%, #121212 100%);
    border: 1px solid rgba(212,175,55,0.07);
  }

  /* ── Tilt shimmer overlay ───────────────────────────────── */
  .w-tilt-shimmer {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.6s ease;
    background: radial-gradient(
      ellipse 65% 45% at var(--sx, 50%) var(--sy, 50%),
      rgba(255,228,96,0.15)  0%,
      rgba(255,255,220,0.07) 45%,
      transparent            72%
    );
    mix-blend-mode: screen;
  }
  .w-tilt-shimmer.visible {
    opacity: 1;
    transition: opacity 0.12s ease;
  }

  /* ── + button on card ───────────────────────────────────── */
  .w-plus {
    background: rgba(212,175,55,0.08);
    border: 1px solid rgba(212,175,55,0.30);
    color: #d4af37;
    transition: background 0.25s, border-color 0.25s;
  }
  .w-plus:hover {
    background: rgba(212,175,55,0.18);
    border-color: rgba(212,175,55,0.55);
  }

  /* ── Top-up panel ───────────────────────────────────────── */
  .w-topup {
    background: linear-gradient(160deg, #ffffff 0%, #fff9f3 100%);
    border: 1px solid rgba(251, 146, 60, 0.28);
  }

  /* ── Hint / label text ──────────────────────────────────── */
  .w-hint {
    color: rgba(212,175,55,0.82);
    font-size: 9.5px;
    letter-spacing: 0.24em;
    text-transform: uppercase;
    font-weight: 600;
  }

  /* ── Nav arrow buttons ──────────────────────────────────── */
  .w-nav-btn {
    border: 1px solid rgba(212,175,55,0.24);
    color: rgba(212,175,55,0.65);
    background: transparent;
    cursor: pointer;
    transition: background 0.2s, border-color 0.2s, color 0.2s;
  }
  .w-nav-btn:hover:not(:disabled) {
    background: rgba(212,175,55,0.10);
    border-color: rgba(212,175,55,0.48);
    color: rgba(212,175,55,0.92);
  }
  .w-nav-btn:disabled {
    opacity: 0.25;
    cursor: default;
    pointer-events: none;
  }
`;

// ─── Component ────────────────────────────────────────────────────────────────
export default function WalletPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const isGeneralAccount = session?.user?.role === "GENERAL";
  const [wallets, setWallets]                 = useState<ChildWallet[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string>("");
  const [transactions, setTransactions]       = useState<Transaction[]>([]);
  const [loading, setLoading]                 = useState(true);
  const [txLoading, setTxLoading]             = useState(false);
  const [topUpAmount, setTopUpAmount]         = useState<string>("");
  const [topUpLoading, setTopUpLoading]       = useState(false);
  const [cardExpanded, setCardExpanded]       = useState(false);
  const [topUpOpen, setTopUpOpen]             = useState(false);
  const [tiltShimmer, setTiltShimmer]         = useState({ x: 50, y: 50, active: false });

  const cardTrackRef     = useRef<HTMLDivElement>(null);
  const scrollRafRef     = useRef<number | null>(null);
  const selectedIdRef    = useRef(selectedChildId);
  const tiltTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load Razorpay SDK ────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window !== "undefined" && !window.Razorpay) {
      const s = document.createElement("script");
      s.src = "https://checkout.razorpay.com/v1/checkout.js";
      s.async = true;
      document.head.appendChild(s);
    }
  }, []);

  // ── Device tilt → shimmer ────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: DeviceOrientationEvent) => {
      const gamma = e.gamma ?? 0;
      const beta  = e.beta  ?? 0;
      const x = Math.max(0, Math.min(100, 50 + (gamma / 90) * 55));
      const y = Math.max(0, Math.min(100, 50 + (beta  / 90) * 35));
      setTiltShimmer({ x, y, active: true });
      if (tiltTimerRef.current) clearTimeout(tiltTimerRef.current);
      tiltTimerRef.current = setTimeout(
        () => setTiltShimmer((p) => ({ ...p, active: false })),
        1200,
      );
    };
    window.addEventListener("deviceorientation", handler, true);
    return () => {
      window.removeEventListener("deviceorientation", handler, true);
      if (tiltTimerRef.current) clearTimeout(tiltTimerRef.current);
    };
  }, []);

  // ── Data fetching ────────────────────────────────────────────────────────
  const fetchWallets = useCallback(async () => {
    try {
      const res = await fetch("/api/wallet");
      if (res.ok) {
        const data: ChildWallet[] = await res.json();
        setWallets(data);
        setSelectedChildId((prev) => (!prev && data.length > 0 ? data[0].childId : prev));
      }
    } catch { toast.error("Failed to load wallets"); }
    finally { setLoading(false); }
  }, []);

  const fetchTransactions = useCallback(async (childId: string) => {
    setTxLoading(true);
    try {
      const res = await fetch(`/api/wallet/transactions?childId=${childId}`);
      if (res.ok) setTransactions(await res.json());
    } catch { toast.error("Failed to load transactions"); }
    finally { setTxLoading(false); }
  }, []);

  useEffect(() => { fetchWallets(); },                                           [fetchWallets]);
  useEffect(() => { selectedIdRef.current = selectedChildId; },                 [selectedChildId]);
  useEffect(() => { if (selectedChildId) fetchTransactions(selectedChildId); }, [selectedChildId, fetchTransactions]);

  // ── Derived ──────────────────────────────────────────────────────────────
  const selectedWallet      = wallets.find((w) => w.childId === selectedChildId);
  const selectedWalletIndex = wallets.findIndex((w) => w.childId === selectedChildId);

  // ── Core scroll helper ───────────────────────────────────────────────────
  // Uses getBoundingClientRect so it is accurate on both desktop and mobile.
  const scrollToWallet = useCallback((idx: number) => {
    const track = cardTrackRef.current;
    if (!track) return;
    const card = track.children[idx] as HTMLElement | undefined;
    if (!card) return;

    const trackRect = track.getBoundingClientRect();
    const cardRect  = card.getBoundingClientRect();

    // How far the card's left edge currently is from the track's left edge,
    // accounting for current scroll position.
    const cardOffsetInTrack = cardRect.left - trackRect.left + track.scrollLeft;
    // Scroll so the card is centred in the track.
    const centred = cardOffsetInTrack - (track.clientWidth - card.offsetWidth) / 2;

    track.scrollTo({ left: Math.max(0, centred), behavior: "smooth" });
  }, []);

  // ── Detect nearest card while user swipes ────────────────────────────────
  const handleCardScroll = useCallback(() => {
    const track = cardTrackRef.current;
    if (!track || wallets.length === 0) return;
    if (scrollRafRef.current !== null) return;
    scrollRafRef.current = window.requestAnimationFrame(() => {
      scrollRafRef.current = null;
      const centreX = track.scrollLeft + track.clientWidth / 2;
      let closestIdx = 0, closestDist = Infinity;
      Array.from(track.children).forEach((child, idx) => {
        const el   = child as HTMLElement;
        const dist = Math.abs(el.offsetLeft + el.offsetWidth / 2 - centreX);
        if (dist < closestDist) { closestDist = dist; closestIdx = idx; }
      });
      const next = wallets[Math.max(0, Math.min(closestIdx, wallets.length - 1))];
      if (next && next.childId !== selectedIdRef.current) setSelectedChildId(next.childId);
    });
  }, [wallets]);

  useEffect(() => () => {
    if (scrollRafRef.current !== null) cancelAnimationFrame(scrollRafRef.current);
  }, []);

  useEffect(() => {
    if (!selectedChildId && wallets.length > 0) setSelectedChildId(wallets[0].childId);
  }, [selectedChildId, wallets]);

  // When the expanded view first opens scroll to the selected card.
  // We do NOT re-scroll on every selectedChildId change here — the arrow
  // buttons call scrollToWallet themselves so we avoid double-scrolling.
  const prevExpandedRef = useRef(false);
  useEffect(() => {
    const justOpened = cardExpanded && !prevExpandedRef.current;
    prevExpandedRef.current = cardExpanded;
    if (justOpened && selectedWalletIndex >= 0) {
      requestAnimationFrame(() => scrollToWallet(selectedWalletIndex));
    }
  }, [cardExpanded, selectedWalletIndex, scrollToWallet]);

  // ── Arrow navigation ─────────────────────────────────────────────────────
  // State update + scroll are called together so the UI is always in sync.
  const goPrev = useCallback(() => {
    if (selectedWalletIndex <= 0) return;
    const idx = selectedWalletIndex - 1;
    setSelectedChildId(wallets[idx].childId);
    // Defer one frame so React has flushed the new selectedChildId before we
    // read the track DOM, though scrollToWallet doesn't actually depend on it.
    requestAnimationFrame(() => scrollToWallet(idx));
  }, [selectedWalletIndex, wallets, scrollToWallet]);

  const goNext = useCallback(() => {
    if (selectedWalletIndex >= wallets.length - 1) return;
    const idx = selectedWalletIndex + 1;
    setSelectedChildId(wallets[idx].childId);
    requestAnimationFrame(() => scrollToWallet(idx));
  }, [selectedWalletIndex, wallets, scrollToWallet]);

  // ── Razorpay ─────────────────────────────────────────────────────────────
  const handleRazorpayTopUp = (
    razorpayOrderId: string, amountPaise: number, keyId: string,
    walletId: string, childName: string,
  ): Promise<{ newBalance: number }> =>
    new Promise((resolve, reject) => {
      if (!window.Razorpay) {
        reject(new Error("Payment SDK not loaded. Please refresh and try again."));
        return;
      }
      new window.Razorpay({
        key: keyId, amount: amountPaise, currency: "INR",
        name: "certe", description: `Wallet top-up for ${childName}`,
        order_id: razorpayOrderId,
        handler: async (resp) => {
          try {
            const verifyRes = await fetch("/api/wallet/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                razorpay_order_id:   resp.razorpay_order_id,
                razorpay_payment_id: resp.razorpay_payment_id,
                razorpay_signature:  resp.razorpay_signature,
                walletId, amount: amountPaise,
              }),
            });
            if (!verifyRes.ok) {
              const d = await verifyRes.json();
              reject(new Error(d.error || "Payment verification failed"));
              return;
            }
            resolve(await verifyRes.json());
          } catch (err) { reject(err); }
        },
        theme: { color: "var(--primary)" },
        modal: { ondismiss: () => reject(new Error("Payment cancelled")) },
      }).open();
    });

  const handleTopUp = async () => {
    const amount = parseFloat(topUpAmount);
    if (isNaN(amount) || amount < 10 || amount > 5000) {
      toast.error("Enter an amount between 10 and 5,000 credits"); return;
    }
    if (!selectedChildId) { toast.error("Select a child first"); return; }
    setTopUpLoading(true);
    try {
      const res = await fetch("/api/wallet/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ childId: selectedChildId, amount }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to create top-up order");
      }
      const { razorpayOrderId, amount: amountPaise, keyId, walletId } = await res.json();
      const childName = wallets.find((w) => w.childId === selectedChildId)?.childName || "";
      const { newBalance } = await handleRazorpayTopUp(razorpayOrderId, amountPaise, keyId, walletId, childName);
      toast.success(`${amount.toFixed(0)} credits added to wallet!`);
      setTopUpAmount("");
      setTopUpOpen(false);
      setWallets((prev) => prev.map((w) => w.childId === selectedChildId ? { ...w, balance: newBalance } : w));
      fetchTransactions(selectedChildId);
    } catch (err) {
      if (err instanceof Error && err.message === "Payment cancelled") toast.info("Payment cancelled");
      else toast.error(err instanceof Error ? err.message : "Failed to initiate payment");
    } finally { setTopUpLoading(false); }
  };

  // ── Misc ─────────────────────────────────────────────────────────────────
  const handlePlusClick = (e: React.MouseEvent, childId: string) => {
    e.stopPropagation();
    if (childId !== selectedChildId) {
      setSelectedChildId(childId);
      setTopUpAmount("");
      setTopUpOpen(true);
    } else {
      setTopUpOpen((prev) => !prev);
    }
  };

  const txIcon = (type: WalletTransactionType) => {
    switch (type) {
      case "TOP_UP": return <ArrowUpCircle  className="h-4 w-4 text-emerald-500" />;
      case "DEBIT":  return <ArrowDownCircle className="h-4 w-4 text-destructive" />;
      case "REFUND": return <RotateCcw       className="h-4 w-4 text-primary" />;
    }
  };

  // ── Shared card face ──────────────────────────────────────────────────────
  const cardInner = (w: ChildWallet) => (
    <div className="relative px-6 py-5 flex flex-col justify-between"
      style={{ height: `${CARD_H}px` }}>
      {/* Tilt-only shimmer */}
      <div
        className={`w-tilt-shimmer${tiltShimmer.active ? " visible" : ""}`}
        style={{ "--sx": `${tiltShimmer.x}%`, "--sy": `${tiltShimmer.y}%` } as React.CSSProperties}
      />

      {/* Names */}
      <div>
        <p className="text-xl font-semibold tracking-wide wt-gold leading-tight">{w.parentName || w.childName}</p>
        <p className="text-sm mt-0.5 wt-gold-sm">Family Wallet</p>
      </div>

      {/* Balance */}
      <div>
        <p className="w-hint mb-1">Available Credits</p>
        <p className="text-[2.05rem] font-bold flex items-center gap-0.5 wt-silver leading-none">
          CR {w.balance.toFixed(2)}
        </p>
      </div>

      {/* Card number + add-money button */}
      <div className="flex items-center justify-between">
        <p className="text-sm tracking-[0.32em] wt-silver-sm">
          ••• ••• ••• {w.rfidCardLast3 ?? "•••"}
        </p>
        <button
          type="button"
          onClick={(e) => handlePlusClick(e, w.childId)}
          className="w-plus flex items-center justify-center h-8 w-8 rounded-full"
          aria-label="Add money to family wallet"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );

  // ── Loading / empty ───────────────────────────────────────────────────────
  if (isGeneralAccount) {
    return (
      <div className="container mx-auto max-w-lg px-4 py-6 space-y-4">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2 w-fit gap-1.5"
          onClick={() => router.push("/settings")}
        >
          <ArrowLeft className="h-4 w-4" /> Back to Settings
        </Button>
        <Card>
          <CardContent className="pt-8 pb-8 text-center">
            <WalletIcon className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">
              Wallet is not available for general and teacher accounts.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

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
        <Button type="button" variant="ghost" size="sm" className="-ml-2 w-fit gap-1.5"
          onClick={() => router.push("/settings")}>
          <ArrowLeft className="h-4 w-4" /> Back to Settings
        </Button>
        <Card>
          <CardContent className="pt-8 pb-8 text-center">
            <WalletIcon className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No wallet found. Add a child first to activate family wallet.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const ghostCount      = Math.min(wallets.length - 1, 2);
  const stackContainerH = CARD_H + ghostCount * GHOST_STEP;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="container mx-auto max-w-lg px-4 py-6 space-y-6">
      <style dangerouslySetInnerHTML={{ __html: WALLET_CSS }} />

      <Button type="button" variant="ghost" size="sm" className="-ml-2 w-fit gap-1.5"
        onClick={() => router.push("/settings")}>
        <ArrowLeft className="h-4 w-4" /> Back to Settings
      </Button>

      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <WalletIcon className="h-6 w-6 text-primary" /> Wallet
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Manage wallet credits and add credits online · <span className="font-medium text-amber-700">1 credit = ₹1</span></p>
      </div>

      {/* ── Card section ──────────────────────────────────────────────────── */}
      <div className="space-y-3">

        {/* ── STACKED VIEW ──────────────────────────────────── */}
        {!cardExpanded && (
          <>
            <div
              className="relative select-none"
              style={{ height: `${stackContainerH}px`, cursor: wallets.length > 1 ? "pointer" : "default" }}
              onClick={() => { if (wallets.length > 1) setCardExpanded(true); }}
              role={wallets.length > 1 ? "button" : undefined}
              aria-label={wallets.length > 1 ? "Tap to expand and switch cards" : undefined}
            >
              {wallets.length >= 3 && (
                <div className="absolute w-card-ghost rounded-2xl"
                  style={{ top: `${GHOST_STEP * 2}px`, left: "18px", right: "18px", height: `${CARD_H}px`, zIndex: 1 }} />
              )}
              {wallets.length >= 2 && (
                <div className="absolute w-card-ghost rounded-2xl"
                  style={{ top: `${GHOST_STEP}px`, left: "9px", right: "9px", height: `${CARD_H}px`, zIndex: 2 }} />
              )}
              {selectedWallet && (
                <div className="absolute inset-x-0 top-0 w-card-face rounded-2xl overflow-hidden" style={{ zIndex: 3 }}>
                  {cardInner(selectedWallet)}
                </div>
              )}
            </div>

            {wallets.length > 1 && (
              <p className="w-hint text-center pointer-events-none" style={{ marginTop: "6px" }}>
                Tap card to switch
              </p>
            )}
          </>
        )}

        {/* ── EXPANDED VIEW ─────────────────────────────────── */}
        {cardExpanded && (
          <div className="space-y-2">

            {/* Nav row — arrows always visible, swipe hint mobile-only */}
            <div className="flex items-center justify-between px-1">
              {/* Swipe hint: visible on mobile (touch), hidden on desktop */}
              <div className="flex items-center gap-1 w-hint sm:invisible">
                <ChevronLeft className="h-3 w-3" />
                <span>Swipe</span>
                <ChevronRight className="h-3 w-3" />
              </div>

              {wallets.length > 1 && (
                <div className="flex items-center gap-2 ml-auto">
                  <button
                    type="button"
                    className="w-nav-btn flex items-center justify-center w-8 h-8 rounded-full"
                    onClick={goPrev}
                    disabled={selectedWalletIndex <= 0}
                    aria-label="Previous card"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>

                  {/* Index counter */}
                  <span className="w-hint tabular-nums">
                    {selectedWalletIndex + 1} / {wallets.length}
                  </span>

                  <button
                    type="button"
                    className="w-nav-btn flex items-center justify-center w-8 h-8 rounded-full"
                    onClick={goNext}
                    disabled={selectedWalletIndex >= wallets.length - 1}
                    aria-label="Next card"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Scrollable card track */}
            <div
              ref={cardTrackRef}
              className="flex gap-3 overflow-x-auto px-2 snap-x snap-mandatory scroll-px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              onScroll={handleCardScroll}
            >
              {wallets.map((w, i) => (
                <div
                  key={w.childId}
                  onClick={() => { setSelectedChildId(w.childId); scrollToWallet(i); }}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" && e.key !== " ") return;
                    e.preventDefault();
                    setSelectedChildId(w.childId);
                    scrollToWallet(i);
                  }}
                  role="button"
                  tabIndex={0}
                  className="w-card-face rounded-2xl overflow-hidden snap-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/40 shrink-0"
                  style={{ width: wallets.length === 1 ? "100%" : "88%" }}
                  aria-label={`${w.childName}'s wallet`}
                >
                  {cardInner(w)}
                </div>
              ))}
            </div>

            {/*
              Dot indicators: mobile-only (sm:hidden).
              On desktop the "1 / N" counter in the nav row serves the same purpose.
            */}
            {wallets.length > 1 && (
              <div className="flex justify-center gap-1.5 pt-0.5 sm:hidden">
                {wallets.map((w, i) => (
                  <button
                    key={w.childId}
                    type="button"
                    onClick={() => { setSelectedChildId(w.childId); scrollToWallet(i); }}
                    className="h-1.5 rounded-full transition-all duration-300"
                    style={{
                      width:      w.childId === selectedChildId ? "24px" : "8px",
                      background: w.childId === selectedChildId
                        ? "rgba(212,175,55,0.72)"
                        : "rgba(255,255,255,0.20)",
                    }}
                    aria-label={`View ${w.childName}'s card`}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── INLINE TOP-UP PANEL ─────────────────────────── */}
        {topUpOpen && selectedWallet && (
          <div className="w-topup rounded-xl p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-orange-800">
                  Add money · Family Wallet
                </p>
                <p className="text-xs mt-0.5 text-orange-700/70">
                  UPI · Card · Net Banking · Razorpay
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setTopUpOpen(false); setTopUpAmount(""); }}
                className="flex items-center justify-center w-6 h-6 rounded-full"
                style={{ color: "rgba(154, 52, 18, 0.65)", border: "1px solid rgba(251, 146, 60, 0.30)", background: "rgba(255, 247, 237, 0.85)" }}
                aria-label="Close top-up panel"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {QUICK_AMOUNTS.map((amt) => (
                <Button
                  key={amt}
                  variant={topUpAmount === String(amt) ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTopUpAmount(String(amt))}
                  className={
                    topUpAmount === String(amt)
                      ? "bg-gradient-to-r from-orange-500 to-amber-500 text-white border-0"
                      : "border-orange-200 text-orange-700 bg-white hover:bg-orange-50"
                  }
                >
                  {amt} cr
                </Button>
              ))}
            </div>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">CR</span>
                <Input
                  type="number" min={10} max={5000} placeholder="Enter credits"
                  value={topUpAmount}
                  onChange={(e) => setTopUpAmount(e.target.value)}
                  className="pl-7"
                />
              </div>
              <Button
                onClick={handleTopUp}
                disabled={topUpLoading || !topUpAmount}
                className="min-w-[96px] bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-600"
              >
                {topUpLoading
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <>Pay</>
                }
              </Button>
            </div>
            <p className="text-xs text-orange-700/70">Min 10 credits · Max 5,000 credits · 1 credit = ₹1</p>
          </div>
        )}
      </div>

      {/* ── Transaction history ────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2 flex-wrap">
            Recent Transactions
            {selectedWallet && (
              <span className="text-muted-foreground font-normal text-sm">— Family Wallet</span>
            )}
          </CardTitle>
          <CardDescription>Last 50 transactions</CardDescription>
        </CardHeader>
        <CardContent>
          {txLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : transactions.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-6">No transactions yet</p>
          ) : (
            <div className="space-y-3">
              {transactions.map((tx) => (
                <div key={tx.id}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {txIcon(tx.type)}
                      <div>
                        <p className="text-sm font-medium">{WALLET_TRANSACTION_LABELS[tx.type]}</p>
                        {tx.description && (
                          <p className="text-xs text-muted-foreground">{tx.description}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {new Date(tx.createdAt).toLocaleString("en-IN")}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-semibold ${tx.type === "DEBIT" ? "text-destructive" : "text-emerald-500"}`}>
                        {tx.type === "DEBIT" ? "-" : "+"}{tx.amount.toFixed(2)} cr
                      </p>
                      <p className="text-xs text-muted-foreground">Bal: {tx.balanceAfter.toFixed(2)} cr</p>
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
