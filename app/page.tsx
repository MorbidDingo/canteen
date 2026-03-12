import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  UtensilsCrossed,
  ShoppingCart,
  Clock,
  Wallet,
  Shield,
  BarChart3,
  ArrowRight,
  Play,
  ChevronRight,
} from "lucide-react";

export default function Home() {
  return (
    <div className="relative overflow-hidden">
      {/* ─── Hero Section ─────────────────────────────────── */}
      <section className="relative min-h-[90vh] flex items-center justify-center px-4 pt-16 pb-24">
        {/* Ambient background glow */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[800px] rounded-full bg-primary/5 blur-[120px]" />
          <div className="absolute bottom-0 left-1/4 h-[400px] w-[600px] rounded-full bg-accent/5 blur-[100px]" />
        </div>

        {/* Floating labels */}
        <div className="pointer-events-none absolute inset-0 hidden lg:block">
          <div className="absolute top-32 left-[8%] animate-fade-in stagger-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-card/80 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Meals Ready
            </span>
          </div>
          <div className="absolute top-48 right-[10%] animate-fade-in stagger-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-card/80 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              Queue Free
            </span>
          </div>
          <div className="absolute bottom-40 left-[12%] animate-fade-in stagger-4">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-card/80 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-sm">
              <Play className="h-3 w-3 text-primary" />
              Live Orders
            </span>
          </div>
          <div className="absolute bottom-32 right-[15%] animate-fade-in stagger-5">
            <span className="text-xs text-muted-foreground/60">Café Horizons</span>
          </div>
        </div>

        <div className="relative z-10 max-w-4xl text-center space-y-8">
          {/* Badge */}
          <div className="animate-fade-in-up">
            <span className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-card/60 px-4 py-2 text-sm text-muted-foreground backdrop-blur-sm">
              <Shield className="h-4 w-4 text-primary" />
              Unlock Your Café Experience →
            </span>
          </div>

          {/* Headline */}
          <h1 className="text-4xl font-bold tracking-tight sm:text-6xl lg:text-7xl animate-fade-in-up stagger-1">
            One-click for{" "}
            <span className="bg-gradient-to-r from-primary via-primary/80 to-accent-foreground bg-clip-text text-transparent">
              Meal Orders
            </span>
          </h1>

          <p className="mx-auto max-w-2xl text-base sm:text-lg text-muted-foreground animate-fade-in-up stagger-2">
            Dive into smart canteen ordering, where innovative technology meets
            seamless meal management for your school experience.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-in-up stagger-3">
            <Link href="/menu">
              <Button size="lg" className="gap-2 px-6 shadow-lg glow-primary">
                Open Menu
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/register">
              <Button
                size="lg"
                variant="outline"
                className="gap-2 px-6 border-border/50 bg-card/40 backdrop-blur-sm"
              >
                Discover More
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Partner Logos Strip ───────────────────────────── */}
      <section className="border-y border-border/30 bg-card/30 backdrop-blur-sm py-8">
        <div className="container mx-auto px-4">
          <div className="flex flex-wrap items-center justify-center gap-8 sm:gap-12 text-muted-foreground/50">
            {[
              "Venus Schools",
              "Smart Café",
              "EduPay",
              "MealTrack",
              "NutriSafe",
              "OrderFlow",
            ].map((name) => (
              <span
                key={name}
                className="text-sm font-medium tracking-wide whitespace-nowrap"
              >
                ▲ {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ─── DeFi Wallet–style Section ────────────────────── */}
      <section className="py-20 sm:py-28 px-4">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-3xl font-bold tracking-tight sm:text-5xl animate-fade-in-up">
              Café Wallet
            </h2>
            <p className="mx-auto max-w-xl text-muted-foreground">
              Exploratory mission with Café Horizon &amp; navigating through the
              vast possibilities of digital meal management.
            </p>
            <div className="pt-4">
              <Link href="/wallet">
                <Button
                  variant="outline"
                  className="rounded-full px-6 border-border/50"
                >
                  How it works?
                </Button>
              </Link>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Wallet System Card */}
            <div className="group relative rounded-2xl border border-border/40 bg-card/60 p-6 backdrop-blur-sm transition-all hover:border-border/80 hover:bg-card/80">
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  Café Wallet System
                </p>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold tracking-tight">
                    +₹3.7
                  </span>
                  <span className="text-xs text-muted-foreground">k</span>
                </div>
                <div className="space-y-3 pt-2">
                  <div className="flex items-center gap-3 rounded-lg border border-border/30 bg-background/50 p-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10">
                      <ArrowRight className="h-4 w-4 text-emerald-500 rotate-[-45deg]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium">Sent</p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        Order #4818
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-medium">₹0.004968</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 rounded-lg border border-border/30 bg-background/50 p-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                      <ArrowRight className="h-4 w-4 text-primary rotate-[135deg]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium">Received</p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        Topup #847
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-medium">₹1,038</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Step Card */}
            <div className="group relative rounded-2xl border border-border/40 bg-card/60 p-6 backdrop-blur-sm transition-all hover:border-border/80 hover:bg-card/80 flex flex-col items-center justify-center text-center">
              <div className="relative mb-6">
                <div className="h-28 w-28 rounded-full border-2 border-primary/20 flex items-center justify-center">
                  <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
                    <UtensilsCrossed className="h-8 w-8 text-primary" />
                  </div>
                </div>
                <div className="absolute -top-2 -right-2 rounded-full bg-card border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
                  Today
                </div>
              </div>
              <p className="text-muted-foreground text-sm mb-1">Done</p>
              <p className="font-semibold">Step 01</p>
            </div>

            {/* Status Card */}
            <div className="group relative rounded-2xl border border-border/40 bg-card/60 p-6 backdrop-blur-sm transition-all hover:border-border/80 hover:bg-card/80">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">Order Status</p>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-500 font-medium">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Active
                  </span>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Pending</span>
                    <span className="font-medium">3</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full w-1/3 rounded-full bg-amber-500" />
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Preparing</span>
                    <span className="font-medium">5</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full w-1/2 rounded-full bg-primary" />
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Served</span>
                    <span className="font-medium">24</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full w-4/5 rounded-full bg-emerald-500" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Tags */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-12">
            {[
              "2.7k+ Orders",
              "Success",
              "Digital Payments",
              "Smart Café",
              "Trusted by Parents",
              "Nutritious Meals",
            ].map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-border/40 bg-card/40 px-4 py-2 text-xs text-muted-foreground backdrop-blur-sm transition-colors hover:border-primary/30 hover:text-foreground"
              >
                ◆ {tag}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Insights Section ─────────────────────────────── */}
      <section className="py-20 sm:py-28 px-4 border-t border-border/30">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">
              Meet Marvellous Insights
            </h2>
            <p className="mx-auto max-w-xl text-muted-foreground">
              Save your team&apos;s precious time. The café system replaces the
              lengthy process of manual order management.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Stats Dashboard Card */}
            <div className="rounded-2xl border border-border/40 bg-card/60 p-6 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <p className="text-4xl font-bold">98.2%</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Orders · Fulfilled
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span className="text-xs text-muted-foreground">Live</span>
                </div>
              </div>

              {/* Mini bar chart */}
              <div className="flex items-end gap-1.5 h-24 mb-6">
                {[40, 65, 45, 80, 55, 70, 90, 60, 75, 85, 50, 95].map(
                  (h, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-t bg-primary/20 hover:bg-primary/40 transition-colors"
                      style={{ height: `${h}%` }}
                    />
                  )
                )}
              </div>

              {/* Tabs */}
              <div className="flex items-center gap-4 border-b border-border/30 pb-3 mb-4">
                <span className="text-xs font-medium border-b-2 border-primary pb-3 -mb-3 text-foreground">
                  Queue Stats up-date
                </span>
                <span className="text-xs text-muted-foreground">
                  Assign issue to experts
                </span>
                <span className="text-xs text-muted-foreground">
                  Assign now
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-4">
                <div className="rounded-xl border border-border/30 bg-background/50 p-4">
                  <h4 className="font-semibold text-sm">
                    Success Transactions
                  </h4>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Innovative ordering technology meets financial expertise to
                    empower your school journey.
                  </p>
                </div>
                <div className="rounded-xl border border-border/30 bg-background/50 p-4">
                  <h4 className="font-semibold text-sm">Order Labyrinth</h4>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Order Labyrinth, where each turn reveals new possibilities
                    for efficient meal delivery.
                  </p>
                </div>
              </div>
            </div>

            {/* Right column */}
            <div className="space-y-8">
              {/* Growth Cards */}
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-2xl border border-border/40 bg-card/60 p-5 backdrop-blur-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="h-3 w-0.5 bg-primary rounded-full" />
                    <span className="text-xs text-muted-foreground">
                      Financial
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">Growth</p>
                  <p className="text-3xl font-bold">19.2</p>
                  <p className="text-xs text-muted-foreground mt-1">₹2.7m</p>
                </div>
                <div className="rounded-2xl border border-border/40 bg-card/60 p-5 backdrop-blur-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="h-3 w-0.5 bg-accent-foreground rounded-full" />
                    <span className="text-xs text-muted-foreground">
                      Orders
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">Growth</p>
                  <p className="text-3xl font-bold">24</p>
                  <p className="text-xs text-muted-foreground mt-1">₹3.2m</p>
                </div>
              </div>

              {/* Opportunities Card */}
              <div className="rounded-2xl border border-border/40 bg-card/60 p-6 backdrop-blur-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold">
                      Your Palette Financial Opportunities
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Watch your assets grow in a thriving ecosystem so easy.
                    </p>
                  </div>
                </div>
              </div>

              {/* Café Space Card */}
              <div className="rounded-2xl border border-border/40 bg-card/60 p-6 backdrop-blur-sm">
                <h3 className="font-semibold">Café Space · Opportunities</h3>
                <p className="text-xs text-muted-foreground mt-2">
                  Where each order is a smart transaction and every meal is a
                  chance to build a healthier portfolio.
                </p>
                {/* Mini chart bars */}
                <div className="flex items-end gap-2 h-16 mt-4">
                  {[30, 50, 70, 45, 80, 60, 90, 40, 65, 85, 55, 75].map(
                    (h, i) => (
                      <div
                        key={i}
                        className="flex-1 rounded-t transition-colors"
                        style={{
                          height: `${h}%`,
                          backgroundColor:
                            i % 3 === 0
                              ? "var(--primary)"
                              : i % 3 === 1
                                ? "var(--accent)"
                                : "var(--muted)",
                          opacity: 0.6,
                        }}
                      />
                    )
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Features Grid ────────────────────────────────── */}
      <section className="py-20 sm:py-28 px-4 border-t border-border/30">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">
              Everything You Need
            </h2>
            <p className="mx-auto max-w-xl text-muted-foreground">
              A complete digital canteen ecosystem designed for modern schools.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: UtensilsCrossed,
                title: "Choose Meals",
                desc: "Browse snacks, meals & drinks with custom dietary instructions and preferences.",
              },
              {
                icon: ShoppingCart,
                title: "Place Order",
                desc: "Add to cart, review, and place your order — seamlessly with cash or UPI payments.",
              },
              {
                icon: Clock,
                title: "Track Status",
                desc: "Follow your order in real-time from placed → preparing → ready → served.",
              },
              {
                icon: Wallet,
                title: "Digital Wallet",
                desc: "Top up your café wallet and manage balances for quick, contactless payments.",
              },
              {
                icon: Shield,
                title: "Parental Controls",
                desc: "Set spending limits, dietary restrictions, and meal preferences for your children.",
              },
              {
                icon: BarChart3,
                title: "Smart Analytics",
                desc: "Track spending patterns, popular items, and nutritional insights at a glance.",
              },
            ].map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="group relative rounded-2xl border border-border/40 bg-card/60 p-6 backdrop-blur-sm transition-all hover:border-primary/30 hover:bg-card/80"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                  <Icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground">{desc}</p>
                <ChevronRight className="absolute top-6 right-6 h-4 w-4 text-muted-foreground/40 transition-colors group-hover:text-primary" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Footer ───────────────────────────────────────── */}
      <footer className="border-t border-border/30 py-8 px-4">
        <div className="container mx-auto max-w-6xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <Link
              href="/login"
              className="hover:text-foreground transition-colors"
            >
              Support
            </Link>
            <Link
              href="/register"
              className="hover:text-foreground transition-colors"
            >
              Register
            </Link>
          </div>
          <p className="text-xs text-muted-foreground">
            © Designed with love at Venus Café · {new Date().getFullYear()}
          </p>
        </div>
      </footer>
    </div>
  );
}
