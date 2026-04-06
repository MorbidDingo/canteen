Plan: Premium Mobile-First UI Overhaul
Transform the entire app into a premium, mobile-first experience inspired by Zomato District / Swiggy / Uber. Deep dark base + vibrant orange/amber accent, Satoshi font, iOS-style navigation, framer-motion animations, minimal text. All roles redesigned.

Phase 1: Foundation (Theme + Typography + Core Components)
All subsequent phases depend on this.

Install Satoshi font — Add via next/font/local or @fontsource/satoshi, replace Geist Sans in layout.tsx and globals.css
Redesign color system — Rework :root and .dark variables in globals.css. Dark mode: near-black bg, soft white text, electric orange primary. Light mode: clean white + deep foreground + vibrant orange. Add tokens for surface-elevated, surface-sunken, accent-glow. Increase --radius to 0.75rem
Add Sheet component — npx shadcn@latest add sheet for Radix-based drawer/bottom-sheet primitive
Create motion utilities — New components/ui/motion.tsx with framer-motion wrappers: MotionPage (iOS push transitions), MotionList (staggered spring), MotionCard (press scale), BottomSheet (drag-to-dismiss with snap points)
Enhance base shadcn components — Button: active:scale-95 + "premium" gradient variant. Card: glow border in dark, hover lift. Badge: "vibrant" variant. Dialog: iOS alert style (centered, rounded-3xl). Input: h-12, rounder, inner shadow
Phase 2: Navigation & Layout Shell
Depends on Phase 1.

Parent tab bar — Frosted glass, icon-only (or tiny labels), sliding pill indicator via shared layout animation, whileTap scale. In app/(parent)/layout.tsx/layout.tsx)
Parent header — Thinner (h-12), logo-only on mobile, stronger blur, elevation shadow in dark mode
Modals → Bottom sheets — Convert all parent <Dialog> to <BottomSheet>: Certe+ upsell, child management, notification bell
iOS Settings navigation — settings/page.tsx/settings/page.tsx): grouped list sections, icon + label + chevron rows, push-style sub-navigation
Other role layouts — Owner: dark sidebar dashboard. Admin: clean sidebar nav. Operator: large touch targets. Kiosk: dark fullscreen. Gate: minimal dark
Phase 3: Parent Pages (parallel with Phase 4)
Depends on Phase 2. Steps are parallelizable.

Menu — Category pills (horizontal scroll), larger image cards, minimal text, floating add button, MotionList stagger
Cart — Swipe-to-delete, sticky bottom CTA bar, spring-animated quantity stepper
Orders — Timeline-style cards, tap-to-expand accordion, pull-to-refresh
Wallet — Enhance existing 3D cards with framer-motion tilt, bottom sheet top-up, grouped transactions
Settings — iOS grouped list, dark gradient Certe+ hero card, profile section
Children — Horizontal scroll cards, push to child detail (not dialog)
Library — Book cards with cover images, overdue glow, categorized sections
Phase 4: Other Role Pages (parallel with Phase 3)
Owner dashboard — Dark metric cards + sparklines, vibrant accent highlights
Admin — Improved table typography, vibrant status badges, stats cards
Operator — Large touch buttons, color-coded status
Kiosk — Dark fullscreen, large menu cards, high-contrast
Gate — Scan feedback animations, large status indicators with glow
Phase 5: Polish & Micro-interactions
Depends on Phases 3 & 4.

Page transitions — AnimatePresence in layouts for route-change slide/fade
Loading states — Skeleton screens with shimmer (replace Loader2 spinners)
Toast redesign — Dark bg, rounded-2xl, accent colors, top-positioned on mobile
Empty states — Illustrated + animated, consistent across all pages
Responsive polish — Test 320px–428px, safe-area-inset, notched devices
Verification
Visual test every parent page in dark + light mode at 390px viewport
Framer-motion animations at 60fps (React DevTools Profiler)
WCAG AA color contrast (4.5:1 text, 3:1 UI) despite dark theme
Touch targets ≥ 44px on mobile
SSR compatibility — "use client" on all motion components
npm run build clean — no TS/ESLint errors
Lighthouse mobile ≥ 90 performance
Key Decisions
Satoshi replaces Geist Sans (keep Geist Mono for code)
Deep black + electric orange/amber in OKLCH. System dark/light preference respected, dark is "hero" design
All modals → bottom sheets in parent flows (drag-to-dismiss)
Tab bar: icon-primary with sliding pill indicator (Uber-style)
Framer Motion: page transitions, gesture sheets, list stagger, press feedback
Scope: all roles — parent deepest, others get theme + layout
Pure visual/UX — no functional changes
Further Considerations
Satoshi licensing — Satoshi by Indian Type Foundry is free for web use. Can load via @fontsource-variable/satoshi or self-host. Recommend self-host for performance.
Phased rollout — Phase 1 alone gives a dramatic visual upgrade across all pages (colors + font + component polish). Consider shipping Phase 1 first and iterating.
Dark mode image treatment — Menu item images may need brightness/contrast adjustment overlays in dark mode to avoid harsh contrast.