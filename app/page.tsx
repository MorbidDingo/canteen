"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CerteLogo, CerteWordmark } from "@/components/certe-logo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  UtensilsCrossed,
  ShoppingCart,
  Clock,
  Wallet,
  Bell,
  Shield,
  LogIn,
  ArrowRight,
  CreditCard,
  Cookie,
  Coffee,
  ChefHat,
  Package,
  ArrowUpCircle,
  ArrowDownCircle,
  CheckCircle2,
  Ban,
  BookOpen,
  DoorOpen,
} from "lucide-react";
import { motion, useInView } from "framer-motion";
import { useEffect, useRef } from "react";
import { useSession } from "@/lib/auth-client";

/* ─── Scroll-animated section wrapper ──────────────────────── */
function ScrollSection({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
      transition={{ duration: 0.6, delay, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ─── Demo data ────────────────────────────────────────────── */
const demoMenuItems = [
  { name: "Paneer Wrap", price: 60, category: "MEALS", icon: ChefHat, discount: 10, left: 12 },
  { name: "Chocolate Cookies", price: 30, category: "SNACKS", icon: Cookie, discount: 0, left: 25 },
  { name: "Mango Smoothie", price: 45, category: "DRINKS", icon: Coffee, discount: 15, left: 8 },
  { name: "Veggie Sandwich", price: 50, category: "PACKED_FOOD", icon: Package, discount: 0, left: 18 },
];

const demoTransactions = [
  { type: "debit", desc: "Paneer Wrap × 1", amount: -54, time: "12:30 PM", balance: 446 },
  { type: "credit", desc: "Wallet Top-up", amount: 500, time: "9:00 AM", balance: 500 },
  { type: "debit", desc: "Mango Smoothie × 2", amount: -76, time: "Yesterday", balance: 0 },
];

const demoNotifications = [
  { type: "KIOSK", title: "Order Served", desc: "Aarav's Paneer Wrap is ready for pickup", time: "2 min ago", read: false },
  { type: "GATE", title: "School Entry", desc: "Aarav entered school at 7:45 AM", time: "1 hr ago", read: false },
  { type: "LIBRARY", title: "Book Issued", desc: "\"Harry Potter\" issued to Aarav", time: "3 hr ago", read: true },
  { type: "BLOCKED", title: "Blocked Attempt", desc: "Drinks purchase blocked per your settings", time: "Yesterday", read: true },
];

const demoOrderSteps = [
  { label: "Placed", active: true, done: true },
  { label: "Preparing", active: true, done: true },
  { label: "Ready", active: true, done: false },
  { label: "Served", active: false, done: false },
];

/* ─── Category color mapping ──────────────────────────────── */
const categoryColors: Record<string, string> = {
  MEALS: "bg-[#d4891a]/15 text-[#d4891a]",
  SNACKS: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  DRINKS: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  PACKED_FOOD: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
};

const notifColors: Record<string, string> = {
  KIOSK: "bg-[#d4891a]/15 text-[#d4891a]",
  GATE: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  LIBRARY: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  BLOCKED: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
};

const notifIcons: Record<string, React.ReactNode> = {
  KIOSK: <ChefHat className="h-4 w-4" />,
  GATE: <DoorOpen className="h-4 w-4" />,
  LIBRARY: <BookOpen className="h-4 w-4" />,
  BLOCKED: <Ban className="h-4 w-4" />,
};

/* ─── Landing Page Component ──────────────────────────────── */
export default function Home() {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (isPending || !session?.user?.role) return;
    const role = session.user.role;
    if (role === "ADMIN") router.replace("/admin/orders");
    else if (role === "OPERATOR") router.replace("/operator/topup");
    else if (role === "MANAGEMENT") router.replace("/management");
    else if (role === "LIB_OPERATOR") router.replace("/lib-operator/dashboard");
    else if (role === "ATTENDANCE") router.replace("/attendance");
    else router.replace("/menu");
  }, [session, isPending, router]);

  if (session?.user) {
    return null;
  }

  return (
    <div className="flex flex-col">
      {/* ── Hero Section ─────────────────────────────────── */}
      <section className="relative flex flex-col items-center justify-center px-4 pt-16 pb-20 sm:pt-24 sm:pb-28 overflow-hidden">
        {/* Subtle gradient background */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#d4891a]/5 via-transparent to-transparent pointer-events-none" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-[#d4891a]/[0.04] rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-2xl text-center space-y-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="flex justify-center"
          >
            <CerteLogo size={90} />
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-4xl font-bold tracking-tight sm:text-6xl"
          >
            <CerteWordmark className="text-4xl sm:text-6xl" />
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-base sm:text-lg text-muted-foreground max-w-lg mx-auto"
          >
            The smart school canteen system. Parents pre-order meals, track
            spending, and stay connected — all from one place.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-3"
          >
            <Link href="/register">
              <Button
                size="lg"
                className="gap-2 w-full sm:w-auto bg-[#d4891a] hover:bg-[#b87314] text-white shadow-lg shadow-[#d4891a]/20 hover:shadow-xl hover:shadow-[#d4891a]/30 transition-all"
              >
                Get Started
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/menu">
              <Button
                size="lg"
                variant="outline"
                className="gap-2 w-full sm:w-auto"
              >
                <ShoppingCart className="h-4 w-4" />
                Browse Menu
              </Button>
            </Link>
          </motion.div>
        </div>

        {/* Quick value props */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="relative mt-16 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl w-full px-4"
        >
          {[
            { icon: UtensilsCrossed, label: "Pre-order Meals", color: "#d4891a" },
            { icon: Wallet, label: "Cashless Payments", color: "#1a3a8f" },
            { icon: Shield, label: "Parental Controls", color: "#2eab57" },
          ].map((item) => (
            <div
              key={item.label}
              className="flex items-center gap-3 p-4 rounded-xl bg-card border shadow-sm"
            >
              <div
                className="rounded-lg p-2.5"
                style={{ backgroundColor: `${item.color}15` }}
              >
                <item.icon className="h-5 w-5" style={{ color: item.color }} />
              </div>
              <span className="font-medium text-sm">{item.label}</span>
            </div>
          ))}
        </motion.div>
      </section>

      {/* ── Story: How It Works ──────────────────────────── */}
      <section className="px-4 py-16 sm:py-24 max-w-5xl mx-auto w-full">
        <ScrollSection>
          <div className="text-center mb-12">
            <Badge className="mb-3 bg-[#d4891a]/10 text-[#d4891a] border-[#d4891a]/20 hover:bg-[#d4891a]/10">
              How It Works
            </Badge>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              A school day, simplified
            </h2>
            <p className="text-muted-foreground mt-2 max-w-md mx-auto">
              From morning drop-off to lunchtime — here&apos;s how <CerteWordmark />
              {" "}keeps parents and schools connected.
            </p>
          </div>
        </ScrollSection>

        <div className="space-y-20 sm:space-y-28">
          {/* ── Step 1: Gate Entry ─────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <ScrollSection>
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="flex items-center justify-center w-8 h-8 rounded-full bg-[#d4891a]/15 text-[#d4891a] text-sm font-bold">
                    1
                  </span>
                  <h3 className="text-xl font-semibold">Morning Arrival</h3>
                </div>
                <p className="text-muted-foreground leading-relaxed">
                  Your child taps their RFID card at the school gate. You
                  instantly get a notification — no more wondering if they
                  reached safely.
                </p>
              </div>
            </ScrollSection>
            <ScrollSection delay={0.15}>
              <Card className="overflow-hidden">
                <CardContent className="p-0">
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/30 dark:to-blue-900/20 p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <DoorOpen className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        <span className="font-medium text-sm text-blue-700 dark:text-blue-300">Gate Entry</span>
                      </div>
                      <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0 text-xs">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Verified
                      </Badge>
                    </div>
                    <div className="bg-card rounded-xl p-4 shadow-sm border">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-[#d4891a]/15 flex items-center justify-center text-[#d4891a] font-bold text-lg">
                          A
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold">Aarav Sharma</p>
                          <p className="text-xs text-muted-foreground">
                            Class 5-B • GR: 2847
                          </p>
                        </div>
                        <div className="text-right">
                          <div className="flex items-center gap-1 text-green-600">
                            <LogIn className="h-4 w-4" />
                            <span className="text-sm font-medium">IN</span>
                          </div>
                          <p className="text-xs text-muted-foreground">7:45 AM</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </ScrollSection>
          </div>

          {/* ── Step 2: Browse Menu ────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <ScrollSection className="order-2 md:order-1">
              <div className="grid grid-cols-2 gap-3">
                {demoMenuItems.map((item) => (
                  <Card
                    key={item.name}
                    className="overflow-hidden group hover:shadow-md transition-shadow"
                  >
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div
                          className={`rounded-lg p-1.5 ${categoryColors[item.category]}`}
                        >
                          <item.icon className="h-3.5 w-3.5" />
                        </div>
                        {item.discount > 0 && (
                          <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0 text-[10px] px-1.5">
                            {item.discount}% off
                          </Badge>
                        )}
                      </div>
                      <p className="font-medium text-sm">{item.name}</p>
                      <div className="flex items-center justify-between mt-1.5">
                        <div className="flex items-center gap-1.5">
                          {item.discount > 0 ? (
                            <>
                              <span className="text-sm font-bold text-[#d4891a]">
                                ₹{Math.round(item.price * (1 - item.discount / 100))}
                              </span>
                              <span className="text-xs text-muted-foreground line-through">
                                ₹{item.price}
                              </span>
                            </>
                          ) : (
                            <span className="text-sm font-bold">₹{item.price}</span>
                          )}
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          {item.left} left
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollSection>
            <ScrollSection className="order-1 md:order-2" delay={0.15}>
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="flex items-center justify-center w-8 h-8 rounded-full bg-[#d4891a]/15 text-[#d4891a] text-sm font-bold">
                    2
                  </span>
                  <h3 className="text-xl font-semibold">Browse & Order</h3>
                </div>
                <p className="text-muted-foreground leading-relaxed">
                  Browse the cafeteria menu from your phone. See real-time
                  availability, discounts, and prices. Add items to cart and
                  pre-order before lunch rush.
                </p>
              </div>
            </ScrollSection>
          </div>

          {/* ── Step 3: Wallet & Payment ───────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <ScrollSection>
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="flex items-center justify-center w-8 h-8 rounded-full bg-[#d4891a]/15 text-[#d4891a] text-sm font-bold">
                    3
                  </span>
                  <h3 className="text-xl font-semibold">Cashless Wallet</h3>
                </div>
                <p className="text-muted-foreground leading-relaxed">
                  Top up your child&apos;s digital wallet securely. Every
                  purchase is tracked and deducted automatically — no cash
                  needed at school.
                </p>
              </div>
            </ScrollSection>
            <ScrollSection delay={0.15}>
              <div className="space-y-3">
                {/* Premium wallet card */}
                <div className="wallet-card-premium rounded-2xl p-5 text-white relative z-10">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-shimmer-silver-soft opacity-80">
                        Student Wallet
                      </p>
                      <p className="text-lg font-bold text-shimmer-gold mt-0.5">
                        Aarav Sharma
                      </p>
                    </div>
                    <CreditCard className="h-6 w-6 text-amber-300/60" />
                  </div>
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-shimmer-silver-soft opacity-60">
                        Balance
                      </p>
                      <p className="text-2xl font-bold text-shimmer-silver">
                        ₹ 446.00
                      </p>
                    </div>
                    <p className="text-xs text-shimmer-silver-soft opacity-50">
                      •••847
                    </p>
                  </div>
                </div>
                {/* Recent transactions */}
                <Card>
                  <CardContent className="p-3 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      Recent Transactions
                    </p>
                    {demoTransactions.map((tx, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 py-1.5"
                      >
                        {tx.type === "credit" ? (
                          <ArrowUpCircle className="h-4 w-4 text-green-500 shrink-0" />
                        ) : (
                          <ArrowDownCircle className="h-4 w-4 text-red-400 shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {tx.desc}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {tx.time}
                          </p>
                        </div>
                        <span
                          className={`text-sm font-semibold tabular-nums ${
                            tx.type === "credit"
                              ? "text-green-600"
                              : "text-red-500"
                          }`}
                        >
                          {tx.type === "credit" ? "+" : ""}₹{Math.abs(tx.amount)}
                        </span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </ScrollSection>
          </div>

          {/* ── Step 4: Order Tracking ─────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <ScrollSection className="order-2 md:order-1">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Order #1042</CardTitle>
                    <Badge className="bg-[#d4891a]/15 text-[#d4891a] border-0 text-xs">
                      Preparing
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Order items */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>Paneer Wrap × 1</span>
                      <span className="font-medium">₹54</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span>Mango Smoothie × 1</span>
                      <span className="font-medium">₹38</span>
                    </div>
                    <div className="border-t pt-2 flex items-center justify-between font-semibold text-sm">
                      <span>Total</span>
                      <span className="text-[#d4891a]">₹92</span>
                    </div>
                  </div>
                  {/* Progress tracker */}
                  <div className="flex items-center gap-1">
                    {demoOrderSteps.map((step, i) => (
                      <div key={step.label} className="flex-1 flex flex-col items-center gap-1.5">
                        <div className="flex items-center w-full">
                          <div
                            className={`w-3 h-3 rounded-full shrink-0 ${
                              step.done
                                ? "bg-[#d4891a]"
                                : step.active
                                ? "bg-[#d4891a]/40 ring-2 ring-[#d4891a]/30"
                                : "bg-muted"
                            }`}
                          />
                          {i < demoOrderSteps.length - 1 && (
                            <div
                              className={`h-0.5 flex-1 ${
                                step.done ? "bg-[#d4891a]" : "bg-muted"
                              }`}
                            />
                          )}
                        </div>
                        <span
                          className={`text-[10px] ${
                            step.active
                              ? "text-foreground font-medium"
                              : "text-muted-foreground"
                          }`}
                        >
                          {step.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </ScrollSection>
            <ScrollSection className="order-1 md:order-2" delay={0.15}>
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="flex items-center justify-center w-8 h-8 rounded-full bg-[#d4891a]/15 text-[#d4891a] text-sm font-bold">
                    4
                  </span>
                  <h3 className="text-xl font-semibold">Track Every Order</h3>
                </div>
                <p className="text-muted-foreground leading-relaxed">
                  Watch your child&apos;s order move from{" "}
                  <span className="font-medium text-foreground">Placed</span> →{" "}
                  <span className="font-medium text-foreground">Preparing</span>{" "}
                  → <span className="font-medium text-foreground">Served</span>{" "}
                  in real time. Get notified the moment their food is ready.
                </p>
              </div>
            </ScrollSection>
          </div>

          {/* ── Step 5: Parental Controls ──────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <ScrollSection>
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="flex items-center justify-center w-8 h-8 rounded-full bg-[#d4891a]/15 text-[#d4891a] text-sm font-bold">
                    5
                  </span>
                  <h3 className="text-xl font-semibold">You&apos;re in Control</h3>
                </div>
                <p className="text-muted-foreground leading-relaxed">
                  Set daily spending limits, block specific food categories, or
                  restrict individual items. Your rules, automatically enforced
                  at the canteen.
                </p>
              </div>
            </ScrollSection>
            <ScrollSection delay={0.15}>
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-[#2eab57]" />
                    <CardTitle className="text-base">Parental Controls</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Spending limits */}
                  <div className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Daily Limit
                      </span>
                      <span className="text-sm font-bold text-[#d4891a]">
                        ₹150
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#d4891a] rounded-full"
                        style={{ width: "36%" }}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      ₹54 spent today • ₹96 remaining
                    </p>
                  </div>
                  {/* Blocked categories */}
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">
                      Blocked Categories
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="outline" className="text-xs gap-1 text-red-500 border-red-200 dark:border-red-800">
                        <Ban className="h-3 w-3" />
                        Drinks
                      </Badge>
                      <Badge variant="outline" className="text-xs gap-1 text-red-500 border-red-200 dark:border-red-800">
                        <Ban className="h-3 w-3" />
                        Packed Food
                      </Badge>
                    </div>
                  </div>
                  {/* Per-order limit */}
                  <div className="flex items-center justify-between text-sm py-1">
                    <span className="text-muted-foreground">Per-order limit</span>
                    <span className="font-medium">₹80</span>
                  </div>
                </CardContent>
              </Card>
            </ScrollSection>
          </div>

          {/* ── Step 6: Real-time Notifications ────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <ScrollSection className="order-2 md:order-1">
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <Bell className="h-4 w-4 text-[#d4891a]" />
                    <CardTitle className="text-base">Notifications</CardTitle>
                    <Badge className="bg-[#d4891a] text-white border-0 text-[10px] h-5 px-1.5 ml-auto">
                      2 new
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {demoNotifications.map((n, i) => (
                    <div
                      key={i}
                      className={`flex items-start gap-3 p-2.5 rounded-lg transition-colors ${
                        !n.read
                          ? "bg-[#d4891a]/[0.04] dark:bg-[#d4891a]/[0.08]"
                          : ""
                      }`}
                    >
                      <div
                        className={`rounded-lg p-1.5 mt-0.5 shrink-0 ${notifColors[n.type]}`}
                      >
                        {notifIcons[n.type]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">
                            {n.title}
                          </p>
                          {!n.read && (
                            <div className="w-1.5 h-1.5 rounded-full bg-[#d4891a] shrink-0" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {n.desc}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {n.time}
                        </p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </ScrollSection>
            <ScrollSection className="order-1 md:order-2" delay={0.15}>
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="flex items-center justify-center w-8 h-8 rounded-full bg-[#d4891a]/15 text-[#d4891a] text-sm font-bold">
                    6
                  </span>
                  <h3 className="text-xl font-semibold">Stay Informed</h3>
                </div>
                <p className="text-muted-foreground leading-relaxed">
                  Get real-time alerts for everything — canteen orders, gate
                  entry/exit, library books, and blocked purchase attempts.
                  Never miss a moment.
                </p>
              </div>
            </ScrollSection>
          </div>
        </div>
      </section>

      {/* ── For Schools Section ───────────────────────────── */}
      <section className="px-4 py-16 sm:py-24 bg-muted/30">
        <div className="max-w-5xl mx-auto">
          <ScrollSection>
            <div className="text-center mb-12">
              <Badge className="mb-3 bg-[#1a3a8f]/10 text-[#1a3a8f] dark:bg-blue-900/30 dark:text-blue-400 border-[#1a3a8f]/20 hover:bg-[#1a3a8f]/10">
                For Schools
              </Badge>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                Everything your school needs
              </h2>
              <p className="text-muted-foreground mt-2 max-w-md mx-auto">
                A complete platform for canteen management, library tracking,
                and student safety.
              </p>
            </div>
          </ScrollSection>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              {
                icon: ChefHat,
                title: "Self-Service Kiosk",
                desc: "Students tap their RFID card, browse the menu, and order — all in under 30 seconds.",
                color: "#d4891a",
              },
              {
                icon: Clock,
                title: "Order Management",
                desc: "Kitchen staff see live orders, mark items as preparing or served, and manage the queue.",
                color: "#1a3a8f",
              },
              {
                icon: BookOpen,
                title: "Library System",
                desc: "Issue, return, and track books digitally. Parents can block genres or reserve books.",
                color: "#7c3aed",
              },
              {
                icon: DoorOpen,
                title: "Gate Tracking",
                desc: "RFID-based entry and exit logging. Parents get instant notifications on their phone.",
                color: "#2eab57",
              },
              {
                icon: Wallet,
                title: "Digital Wallet",
                desc: "Cashless payments via Razorpay. Parents top up online, students pay by card tap.",
                color: "#e74c3c",
              },
              {
                icon: Shield,
                title: "Full Analytics",
                desc: "Revenue charts, item sales, peak hours, category breakdown — all at a glance.",
                color: "#0ea5e9",
              },
            ].map((feature, i) => (
              <ScrollSection key={feature.title} delay={i * 0.08}>
                <Card className="h-full hover:shadow-md transition-shadow">
                  <CardContent className="p-5">
                    <div
                      className="rounded-lg p-2 w-fit mb-3"
                      style={{ backgroundColor: `${feature.color}15` }}
                    >
                      <feature.icon
                        className="h-5 w-5"
                        style={{ color: feature.color }}
                      />
                    </div>
                    <h3 className="font-semibold mb-1">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {feature.desc}
                    </p>
                  </CardContent>
                </Card>
              </ScrollSection>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Section ───────────────────────────────────── */}
      <section className="px-4 py-16 sm:py-24">
        <ScrollSection>
          <div className="max-w-xl mx-auto text-center space-y-6">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Ready to get started?
            </h2>
            <p className="text-muted-foreground">
              Join <CerteWordmark /> and make school meals effortless for your family.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link href="/register">
                <Button
                  size="lg"
                  className="gap-2 w-full sm:w-auto bg-[#d4891a] hover:bg-[#b87314] text-white shadow-lg shadow-[#d4891a]/20 hover:shadow-xl hover:shadow-[#d4891a]/30 transition-all"
                >
                  Create Account
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/login">
                <Button
                  size="lg"
                  variant="outline"
                  className="gap-2 w-full sm:w-auto"
                >
                  Sign In
                </Button>
              </Link>
            </div>
          </div>
        </ScrollSection>
      </section>

      {/* ── Footer ────────────────────────────────────────── */}
      <footer className="border-t px-4 py-8">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <CerteLogo size={24} />
            <CerteWordmark className="text-sm" />
          </div>
          <p>© {new Date().getFullYear()} certe</p>
        </div>
      </footer>
    </div>
  );
}
