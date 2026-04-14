"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { hapticSuccess, hapticError, hapticWarning } from "@/lib/haptics";
import {
  Wallet as WalletIcon,
  Loader2,
  Plus,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  WALLET_TRANSACTION_LABELS,
  type WalletTransactionType,
} from "@/lib/constants";
import { BottomSheet } from "@/components/ui/motion";
import { WalletForecastWidget } from "@/components/recommendations/wallet-forecast";

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
  /* ── Card holder name: platinum metallic ────────────────── */
  .wt-gold {
    background: linear-gradient(105deg,
      #b8b8b8 0%, #d8d8d8 18%, #f0f0f0 32%,
      #ffffff 50%, #f0f0f0 68%, #d8d8d8 82%, #b8b8b8 100%);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    filter:
      drop-shadow(0 1.5px 0 rgba(0,0,0,0.9))
      drop-shadow(0 -0.8px 0 rgba(255,255,255,0.15));
  }

  /* ── Subtitle: muted platinum ───────────────────────────── */
  .wt-gold-sm {
    background: linear-gradient(105deg,
      #8a8a8a 0%, #a8a8a8 18%, #c8c8c8 32%,
      #e0e0e0 50%, #c8c8c8 68%, #a8a8a8 82%, #8a8a8a 100%);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    filter:
      drop-shadow(0 1.5px 0 rgba(0,0,0,0.9))
      drop-shadow(0 -0.8px 0 rgba(255,255,255,0.10));
  }

  /* ── Balance: bright white metallic ─────────────────────── */
  .wt-silver {
    background: linear-gradient(105deg,
      #c0c0c0 0%, #e0e0e0 18%, #f5f5f5 32%,
      #ffffff 50%, #f5f5f5 68%, #e0e0e0 82%, #c0c0c0 100%);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    filter:
      drop-shadow(0 1.5px 0 rgba(0,0,0,0.9))
      drop-shadow(0 -0.8px 0 rgba(255,255,255,0.22));
  }

  /* ── Card number: muted silver ──────────────────────────── */
  .wt-silver-sm {
    background: linear-gradient(105deg,
      #707070 0%, #aaaaaa 18%, #d0d0d0 32%,
      #f0f0f0 50%, #d0d0d0 68%, #aaaaaa 82%, #707070 100%);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    filter:
      drop-shadow(0 1.5px 0 rgba(0,0,0,0.9))
      drop-shadow(0 -0.8px 0 rgba(255,255,255,0.12));
  }

  /* ── Card body — premium black Amex style ───────────────── */
  .w-card-face {
    background:
      radial-gradient(ellipse at 15% 20%, rgba(60,60,70,0.30) 0%, transparent 45%),
      radial-gradient(ellipse at 85% 80%, rgba(40,40,50,0.25) 0%, transparent 40%),
      linear-gradient(148deg,
        #111113 0%, #1a1a1e 20%,
        #0e0e10 45%, #161618 65%,
        #111113 100%);
    border: 1px solid rgba(255,255,255,0.08);
    box-shadow:
      0 2px 8px rgba(0,0,0,0.4),
      inset 0 1px 0 rgba(255,255,255,0.05);
  }

  /* ── Ghost card ─────────────────────────────────────────── */
  .w-card-ghost {
    background: linear-gradient(148deg, #0a0a0c 0%, #111113 50%, #0c0c0e 100%);
    border: 1px solid rgba(255,255,255,0.04);
  }

  /* ── Tilt shimmer overlay — cool silver tone ────────────── */
  .w-tilt-shimmer {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.6s ease;
    background: radial-gradient(
      ellipse 65% 45% at var(--sx, 50%) var(--sy, 50%),
      rgba(200,210,230,0.12) 0%,
      rgba(220,225,240,0.05) 45%,
      transparent 72%
    );
    mix-blend-mode: screen;
  }
  .w-tilt-shimmer.visible {
    opacity: 1;
    transition: opacity 0.12s ease;
  }

  /* ── + button on card — platinum accent ─────────────────── */
  .w-plus {
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.15);
    color: rgba(255,255,255,0.70);
    transition: background 0.25s, border-color 0.25s;
  }
  .w-plus:hover {
    background: rgba(255,255,255,0.12);
    border-color: rgba(255,255,255,0.30);
  }

  /* ── Top-up panel ───────────────────────────────────────── */
  .w-topup {
    background: linear-gradient(160deg, #ffffff 0%, #fff9f3 100%);
    border: 1px solid rgba(251, 146, 60, 0.28);
  }
  @media (prefers-color-scheme: dark) {
    .w-topup {
      background: linear-gradient(160deg, #1a1a1e 0%, #161618 100%);
      border: 1px solid rgba(255,255,255,0.08);
    }
  }
  .dark .w-topup {
    background: linear-gradient(160deg, #1a1a1e 0%, #161618 100%);
    border: 1px solid rgba(255,255,255,0.08);
  }

  /* ── Hint / label text ──────────────────────────────────── */
  .w-hint {
    color: rgba(255,255,255,0.50);
    font-size: 9.5px;
    letter-spacing: 0.24em;
    text-transform: uppercase;
    font-weight: 600;
  }

  /* ── Nav arrow buttons ──────────────────────────────────── */
  .w-nav-btn {
    border: 1px solid rgba(255,255,255,0.12);
    color: rgba(255,255,255,0.50);
    background: transparent;
    cursor: pointer;
    transition: background 0.2s, border-color 0.2s, color 0.2s;
  }
  .w-nav-btn:hover:not(:disabled) {
    background: rgba(255,255,255,0.06);
    border-color: rgba(255,255,255,0.24);
    color: rgba(255,255,255,0.80);
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
  const searchParams = useSearchParams();
  const parentMode = searchParams.get("mode") === "library" ? "library" : "canteen";
  const settingsHref = `/settings?mode=${parentMode}`;
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
      hapticError(); toast.error("Enter an amount between ₹10 and ₹5,000"); return;
    }
    if (!selectedChildId) { hapticError(); toast.error("Select a child first"); return; }
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
      hapticSuccess();
      toast.success(`₹${amount.toFixed(0)} added to wallet!`);
      setTopUpAmount("");
      setTopUpOpen(false);
      setWallets((prev) => prev.map((w) => w.childId === selectedChildId ? { ...w, balance: newBalance } : w));
      fetchTransactions(selectedChildId);
    } catch (err) {
      if (err instanceof Error && err.message === "Payment cancelled") { hapticWarning(); toast.info("Payment cancelled"); }
      else { hapticError(); toast.error(err instanceof Error ? err.message : "Failed to initiate payment"); }
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
        <p className="w-hint mb-1">Available Balance</p>
        <p className="text-[2.05rem] font-bold flex items-center gap-0.5 wt-silver leading-none">
          ₹{w.balance.toFixed(2)}
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
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (wallets.length === 0) {
    return (
      <div className="px-5 pt-2">
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <WalletIcon className="h-8 w-8 text-muted-foreground/30 mx-auto" />
          <p className="mt-2 text-sm text-muted-foreground">No wallet found. Add a member first to activate family wallet.</p>
        </div>
      </div>
    );
  }

  const ghostCount      = Math.min(wallets.length - 1, 2);
  const stackContainerH = CARD_H + ghostCount * GHOST_STEP;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="px-5 space-y-6 pt-2">
      <style dangerouslySetInnerHTML={{ __html: WALLET_CSS }} />

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
                  className="w-card-face rounded-2xl overflow-hidden snap-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 shrink-0"
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
                        ? "rgba(255,255,255,0.60)"
                        : "rgba(255,255,255,0.15)",
                    }}
                    aria-label={`View ${w.childName}'s card`}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TOP-UP BOTTOM SHEET ─────────────────────── */}
        <BottomSheet
          open={topUpOpen && !!selectedWallet}
          onClose={() => { setTopUpOpen(false); setTopUpAmount(""); }}
          snapPoints={[50]}
        >
          <div className="space-y-4 pb-4">
            <div>
              <p className="text-base font-semibold">
                Add money
              </p>
              <p className="text-xs mt-0.5 text-muted-foreground">
                UPI · Card · Net Banking · Razorpay
              </p>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {QUICK_AMOUNTS.map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setTopUpAmount(String(amt))}
                  className={cn(
                    "h-9 rounded-full text-[13px] font-medium transition-colors",
                    topUpAmount === String(amt)
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/50 text-foreground hover:bg-muted",
                  )}
                >
                  ₹{amt}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">₹</span>
                <Input
                  type="number" min={10} max={5000} placeholder="Enter amount"
                  value={topUpAmount}
                  onChange={(e) => setTopUpAmount(e.target.value)}
                  className="pl-7"
                />
              </div>
              <Button
                onClick={handleTopUp}
                disabled={topUpLoading || !topUpAmount}
                className="min-w-[96px]"
                variant="premium"
              >
                {topUpLoading
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <>Pay</>
                }
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Min ₹10 · Max ₹5,000</p>
          </div>
        </BottomSheet>
      </div>

      {/* ── AI Wallet Insights — Certe+ only ─────────────────────────────── */}
      <WalletForecastWidget />

      {/* ── Transaction history ────────────────────────────────────────────── */}
      <div>
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-3">Recent Transactions</p>
        {txLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-6 text-center">
            <WalletIcon className="mx-auto h-6 w-6 text-muted-foreground/30" />
            <p className="mt-1.5 text-xs text-muted-foreground">No transactions yet</p>
          </div>
        ) : (
          <div className="space-y-0">
            {transactions.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between py-3 border-b border-border/30 last:border-0">
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium">
                    {tx.type === "DEBIT" ? "−" : "+"}₹{tx.amount.toFixed(0)}{" "}
                    <span className="text-muted-foreground font-normal">
                      {WALLET_TRANSACTION_LABELS[tx.type]}
                      {tx.description ? ` · ${tx.description}` : ""}
                    </span>
                  </p>
                  <p className="text-[12px] text-muted-foreground mt-0.5">
                    {new Date(tx.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    {" · "}
                    {new Date(tx.createdAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <p className={cn(
                  "text-[15px] font-semibold tabular-nums shrink-0 ml-3",
                  tx.type === "DEBIT" ? "text-destructive" : "text-emerald-500",
                )}>
                  {tx.type === "DEBIT" ? "−" : "+"}₹{tx.amount.toFixed(0)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
