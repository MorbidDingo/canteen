# Plan: Parent App UI Overhaul — Production-Grade Minimalist Redesign

## TL;DR
Strip the parent app down to a calm, confident, Uber/Swiggy/Claude-level interface. Large type contrasts (48px headlines vs 11px labels), generous whitespace, warm coral/terracotta primary (#E8614D light / #F0825E dark), ghost-style secondary actions, and motion-driven progressive disclosure via sheets and drawers — not page clutter. Every screen is detailed below with exact element positioning, interaction patterns, and typography.

---

## DESIGN SYSTEM FOUNDATION

### Color Palette (replace current amber/gold)
- **Primary**: Warm Coral `oklch(0.65 0.18 28)` — buttons, active states, links
- **Primary Hover**: Deeper terracotta `oklch(0.58 0.20 25)`
- **Primary Subtle**: `oklch(0.95 0.04 28)` — light tinted backgrounds
- **Dark mode primary**: `oklch(0.75 0.16 30)` — slightly brighter for contrast
- **Foreground**: Near-black `oklch(0.12 0.02 45)`
- **Muted text**: `oklch(0.55 0.01 60)` — subdued secondary text
- **Surface**: Pure white cards on warm off-white `oklch(0.985 0.005 85)` bg
- **Borders**: Nearly invisible `oklch(0.93 0.008 80)` — rely on spacing not lines

### Typography Scale (Satoshi primary, Cormorant for accents)
- **Display**: 32-40px / Satoshi 700 / tracking-tight — screen titles
- **Heading**: 20-24px / Satoshi 600 — section headers
- **Body**: 15-16px / Satoshi 400 — readable content
- **Caption**: 12-13px / Satoshi 500 — metadata, timestamps
- **Micro**: 10-11px / Satoshi 500 uppercase tracking-wide — badges, labels
- **Price/Numeric**: Satoshi 700 tabular-nums — prices, balances
- **Serif accent**: Cormorant Garamond 600 — book titles, elegant headings in library

### Spacing & Layout
- **Page padding**: px-5 (mobile), px-8 (tablet+)
- **Section gaps**: 32-40px between major sections
- **Card gaps**: 12-16px between list items
- **Card padding**: 16-20px internal
- **Border radius**: 16px cards, 12px buttons, 24px sheets, full-round pills
- **No visible borders on cards** — use subtle shadow `shadow-[0_1px_3px_rgba(0,0,0,0.04)]` + bg elevation

### Interactive Elements (Global)
- **Primary Button**: Coral bg, white text, rounded-xl, h-12, font-semibold text-[15px], active:scale-[0.98]
- **Ghost Button**: No bg, coral text, hover:bg-primary/5
- **Icon Button**: 40x40 circle, ghost style, subtle hover fill
- **Floating Action**: Fixed bottom, coral, rounded-full, shadow-lg
- **Bottom Sheets**: `rounded-t-3xl`, drag handle pill (40x4px centered), spring animation (stiffness:300, damping:28)
- **Dialogs**: Centered, max-w-sm, rounded-2xl, backdrop blur-sm + black/20
- **Toasts (Sonner)**: Bottom-center, rounded-xl, 3s auto-dismiss

---

## PHASE 1: SHELL & NAVIGATION

### 1.1 — Parent Layout (`app/(parent)/layout.tsx`)

**CURRENT**: Sticky amber header with logo, icon cluster, mode tabs, bottom pill nav
**NEW**: Minimal transparent header + clean bottom tab bar

#### Header (top, sticky, h-14)
```
┌─────────────────────────────────────────────┐
│  [Context Title]              [●] [🔔] [👤] │
│                                              │
└─────────────────────────────────────────────┘
```
- **Left**: Context-sensitive title in 20px Satoshi 600 (e.g., "Menu", "Library", "Notes")
  - On scroll >60px: fade in from 0. On top: show greeting "Hi, {firstName}" in 13px muted
- **Right**: 3 icon buttons only (40x40 ghost circles)
  - Cart (dot badge, coral) — canteen mode only
  - Notification bell (dot badge if unread)
  - Profile avatar (initials, 32x32 circle, coral/10 bg)
- **Background**: `bg-background/80 backdrop-blur-xl` — content scrolls underneath
- **Remove**: Certe logo from header, sign-out button (move to settings), wallet/payment icons (move to profile sheet)
- **Remove**: Mode tabs strip entirely (replaced by bottom nav)

#### Bottom Navigation (fixed, bottom safe-area)
```
┌─────────────────────────────────────────────┐
│                                              │
│   🍽️        📖        📝        ⚙️         │
│  Food     Library    Notes    Settings       │
│                                              │
└─────────────────────────────────────────────┘
```
- **Structure**: Full-width bar, bg-background/90 backdrop-blur-xl, border-t border-border/30
- **4 persistent tabs**: Food, Library, Notes, Settings
  - Replaces the current 3-mode-dependent tabs + separate mode switcher
- **Active indicator**: Coral dot (6px) under active icon, NOT a pill highlight
- **Icons**: 22px, Satoshi 10px labels below, 500 weight
  - Active: coral color + label visible
  - Inactive: muted-foreground, label still visible but lighter
- **No floating pill shape** — flat, edge-to-edge like iOS tab bar
- **Profile avatar moved to Settings tab** — no separate floating circle
- **Height**: h-16 + safe-area-inset-bottom
- **Remove**: Glass morphism pill, separated profile button, mode-dependent tab switching

#### Profile Sheet (replaces settings page as entry)
- Triggered by: Settings tab OR profile avatar tap
- **Type**: Bottom Sheet, snap to 60% then 90%
- **Content at 60%**:
  ```
  ┌───────────────────────────────┐
  │         ── (drag handle) ──   │
  │                               │
  │   👤 Parent Name              │
  │   parent@email.com            │
  │                               │
  │   ┌─────────┐ ┌─────────┐    │
  │   │ Wallet  │ │ Children│    │
  │   │  ₹1,200 │ │  2 kids │    │
  │   └─────────┘ └─────────┘    │
  │                               │
  │   Controls                  → │
  │   Notifications             → │
  │   Payments                  → │
  │   Messaging                 → │
  │   Theme                   🌙  │
  │   Sign Out                    │
  └───────────────────────────────┘
  ```
- **Wallet/Children**: Two cards side-by-side, rounded-2xl, tap to navigate
- **Menu items**: Simple list, 52px row height, right chevron, no icons (text only)
- **Sign Out**: At bottom, coral text, no bg, separated by 24px gap

---

## PHASE 2: FOOD ORDERING

### 2.1 — Menu Page (`app/(parent)/menu/page.tsx`)

**CURRENT**: Search + category chips + AI suggestions + discount banner + grid cards with image right
**NEW**: Full-bleed visual grid, category pills, search overlay

#### Screen Layout (top to bottom)
```
┌─────────────────────────────────────────────┐
│  Menu                        🛒(2)  🔔  👤 │  ← header
├─────────────────────────────────────────────┤
│  [🔍 Search food...]                        │  ← search bar
├─────────────────────────────────────────────┤
│  (All) (Snacks) (Meals) (Drinks) (Packed) → │  ← horizontal scroll pills
├─────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐                 │
│  │ ░░░░░░░░ │  │ ░░░░░░░░ │                 │  ← 2-col grid
│  │ ░░IMAGE░ │  │ ░░IMAGE░ │                 │
│  │ ░░░░░░░░ │  │ ░░░░░░░░ │                 │
│  │          │  │          │                 │
│  │ Paneer   │  │ Masala   │                 │
│  │ ₹120  [+]│  │ ₹80   [+]│                 │
│  └──────────┘  └──────────┘                 │
│  ┌──────────┐  ┌──────────┐                 │
│  │  ...     │  │  ...     │                 │
│  └──────────┘  └──────────┘                 │
├─────────────────────────────────────────────┤
│   🛒 2 items                    ₹200    →   │  ← floating cart bar
└─────────────────────────────────────────────┘
```

#### Search Bar
- **Position**: Below header, sticky
- **Style**: h-11, rounded-full, bg-muted/40, no border, pl-11 (icon space)
- **Icon**: Search 18px muted left-aligned
- **Placeholder**: Static "Search food..." (remove rotating placeholders — too busy)
- **Interaction**: Tap → input focuses, keyboard opens. Results filter inline (no overlay)
- **Clear**: X button appears when text entered

#### Category Pills
- **Position**: Below search, horizontal scroll, sticky with search
- **Style**: h-9, rounded-full, px-4, text-[13px] font-medium
- **Active**: coral bg, white text
- **Inactive**: bg-muted/50, foreground text
- **No count numbers** — remove "(12)" from pills. Just "Snacks", "Meals", etc.
- **No filter icon button** — remove SlidersHorizontal

#### Menu Item Cards
- **Grid**: 2 columns mobile, 3 tablet, 4 desktop. gap-3
- **Card structure**: Image on TOP (not right), content below
  - **Image**: aspect-[4/3], rounded-2xl, object-cover, full width
    - Sold out: 40% opacity + "Sold Out" centered overlay text (11px, uppercase, tracking-wide)
    - No image: bg-muted with utensil icon centered
  - **Below image** (p-3):
    - **Name**: 14px Satoshi 600, single line truncate
    - **Price**: 16px Satoshi 700
      - If discounted: coral strikethrough original + bold new price
    - **Add button**: Positioned absolute bottom-right of image area
      - Initial: 36x36 coral circle with white "+" icon
      - With qty: pill shape "− 2 +" in coral, white text
- **No descriptions** on cards. No category icons.
- **Animations**: Fade-in-up staggered 30ms, subtle

#### AI Suggestions (Certe+ only)
- **Remove the entire expandable section**
- Replace with: Single horizontal rail at top of grid (before main items) titled "For You" in 13px coral uppercase tracking-wide
- Show 4-5 items in same card format, horizontal scroll

#### Discount Banner
- **Remove entirely**. Instead, show a small coral tag icon on discounted item cards (top-left of image, 8px padding)

#### Floating Cart Bar (bottom, above tab bar)
- **Position**: fixed, bottom-20 (above tab bar), mx-5
- **Style**: coral bg, rounded-2xl, h-14, shadow-xl, px-5
- **Left**: "2 items" in 14px white
- **Right**: "₹200 →" in 16px white font-bold
- **Animation**: Spring slide-up from bottom
- **Tap**: Navigate to /cart

#### Item Detail (Lightbox replacement)
- **Type**: Bottom Sheet, snap 75%
- **Content**:
  ```
  ┌───────────────────────────────┐
  │         ── (drag handle) ──   │
  │  ┌───────────────────────┐    │
  │  │     LARGE IMAGE       │    │
  │  │     aspect-[16/10]    │    │
  │  │   (carousel dots)     │    │
  │  └───────────────────────┘    │
  │                               │
  │  Paneer Tikka Wrap            │  ← 22px Satoshi 700
  │  Grilled paneer with mint     │  ← 14px muted (description here only)
  │  chutney in a wheat wrap      │
  │                               │
  │  ₹120                         │  ← 24px Satoshi 700
  │                               │
  │  ┌─────────────────────────┐  │
  │  │    Add to Cart    🛒    │  │  ← h-14 full-width coral button
  │  └─────────────────────────┘  │
  └───────────────────────────────┘
  ```

---

### 2.2 — Cart Page (`app/(parent)/cart/page.tsx`)

**CURRENT**: Two-column layout with items left, summary right, payment method cards
**NEW**: Single column, distraction-free checkout

#### Screen Layout
```
┌─────────────────────────────────────────────┐
│  ← Cart                                     │  ← header with back arrow
├─────────────────────────────────────────────┤
│  Ordering from Canteen A                    │  ← 12px muted, MapPin icon
├─────────────────────────────────────────────┤
│                                              │
│  Paneer Wrap               ₹120             │
│  [−] 2 [+]            ₹240                  │
│  Split: Arjun 1 · Priya 1                  │  ← 11px muted, tap to edit
│  ─────────────────────────────              │
│  Masala Dosa                ₹80             │
│  [−] 1 [+]             ₹80                 │
│  Arjun                                      │
│  ─────────────────────────────              │
│                                              │
│  Special instructions?              →       │  ← ghost button, opens sheet
│                                              │
├─────────────────────────────────────────────┤
│  Subtotal                          ₹320     │  ← 14px
│  Platform fee                        ₹6     │  ← 12px muted
│  ────────────────────────────────────       │
│  Total                             ₹326     │  ← 20px Satoshi 700
│                                              │
│  ┌─────────────────────────────────────┐    │
│  │      Pay ₹326 · Razorpay     →     │    │  ← h-14 coral, rounded-2xl
│  └─────────────────────────────────────┘    │
│  or pay with Wallet                         │  ← 13px ghost link centered
└─────────────────────────────────────────────┘
```

#### Cart Items
- **No card borders** — separated by thin 1px dividers
- **Each item row**: flex between, name+unit-price left, line-total right
- **Qty controls**: Below name, compact pill "− N +" (h-8, rounded-full, border)
- **Child split**: 11px muted below qty. Tap opens Child Allocation Sheet
- **Swipe left to delete** (framer-motion drag, reveal coral trash icon) — replaces trash icon button

#### Child Allocation Sheet
- **Type**: Bottom Sheet, 50%
- Per-child rows with name + "−/+" controls

#### Special Instructions Sheet
- **Type**: Bottom Sheet, 40%
- Quick picks as pills (rounded-full, toggle on/off)
- Free text input below

#### Summary
- **Position**: Sticky bottom on mobile (above tab bar)
- **Payment toggle**: "Pay ₹326 · Razorpay" primary button OR "or pay with Wallet" ghost link
- **Remove**: Payment method selection cards entirely. Default to Razorpay. Wallet is the text link alternative.

#### Empty State
- Centered: Cart icon (48px, muted/20), "Nothing here yet" (20px), "Browse the menu" ghost link

---

### 2.3 — Orders Page (`app/(parent)/orders/page.tsx`)

**CURRENT**: Search bar, weekly spend card, order cards with full details
**NEW**: Clean chronological list, minimal cards

#### Screen Layout
```
┌─────────────────────────────────────────────┐
│  Orders                              🔄     │
├─────────────────────────────────────────────┤
│                                              │
│  Today                                      │  ← 11px uppercase tracking-wide muted
│  ┌─────────────────────────────────────┐    │
│  │  Paneer Wrap × 2, Dosa × 1         │    │  ← 15px Satoshi 600
│  │  ₹326 · Preparing                  │    │  ← 13px, status in coral/green/muted
│  │  Canteen A · 12:30 PM              │    │  ← 12px muted
│  └─────────────────────────────────────┘    │
│                                              │
│  Yesterday                                  │
│  ┌─────────────────────────────────────┐    │
│  │  Sandwich × 1                       │    │
│  │  ₹80 · Served ✓                    │    │
│  │  Canteen B · 1:15 PM               │    │
│  └─────────────────────────────────────┘    │
│  ...                                        │
└─────────────────────────────────────────────┘
```

- **Group by date**: "Today", "Yesterday", "Mon, Mar 30" — 11px uppercase muted section headers
- **Order cards**: No borders, bg-card, rounded-2xl, p-4, shadow-sm
  - Line 1: Concatenated item names "Item × qty, Item × qty" — 15px Satoshi 600, truncate
  - Line 2: "₹Total · Status" — 13px, status color-coded (coral=Preparing, green=Served, muted=Cancelled)
  - Line 3: "Canteen Name · Time" — 12px muted
  - Tap → open Order Detail Sheet
- **Remove**: Search bar (rarely needed), weekly spend card (move to insights/wallet)
- **Remove**: Inline status badges, payment status badges, action buttons. All in detail sheet.

#### Order Detail Sheet
- **Type**: Bottom Sheet, snap 70% then 92%
- **Content at 70%**:
  ```
  ┌───────────────────────────────┐
  │         ── (drag handle) ──   │
  │                               │
  │  Order #A1B2C3D4              │  ← 11px mono, muted
  │  Canteen A · Today, 12:30 PM │  ← 13px muted
  │                               │
  │  ● Preparing                  │  ← 16px, coral dot + status text
  │                               │
  │  Paneer Wrap × 2        ₹240 │
  │    Arjun 1 · Priya 1         │  ← 12px muted
  │  Masala Dosa × 1          ₹80│
  │    Arjun                      │
  │  ────────────────────────     │
  │  Subtotal               ₹320 │
  │  Fee                      ₹6 │
  │  Total                  ₹326 │  ← 18px bold
  │                               │
  │  ┌─────────────────────────┐  │
  │  │    Cancel Order         │  │  ← Only if PLACED. Ghost, red text
  │  └─────────────────────────┘  │
  │  ┌─────────────────────────┐  │
  │  │    Rate this order ★    │  │  ← Only if SERVED & unrated
  │  └─────────────────────────┘  │
  └───────────────────────────────┘
  ```

#### Cancel Reason Sheet (nested)
- **Type**: Bottom Sheet replacing order detail content (no separate overlay)
- 6 reason pills (rounded-full, tap to select, coral border when selected)
- "Other" expands textarea
- "Cancel" button (coral bg, destructive)

#### Rating Sheet (nested)
- **Type**: Replaces content in order detail sheet
- 3 star rows (Food, Packaging, Service) — 5 stars each, 28px, amber fill
- Optional text area
- "Submit" button (coral)

---

### 2.4 — Pre-Orders / Certe Pass (`app/(parent)/pre-orders/page.tsx`)

**CURRENT**: Complex form with dropdowns, menu search, allocation cards, cost summary
**NEW**: Step-by-step wizard in a sheet

#### Screen Layout (main page — just shows active passes)
```
┌─────────────────────────────────────────────┐
│  Certe Pass                                 │
├─────────────────────────────────────────────┤
│                                              │
│  Active                                     │  ← 11px uppercase muted
│  ┌─────────────────────────────────────┐    │
│  │  Arjun · Lunch Break               │    │  ← 15px bold
│  │  Paneer Wrap × 1, Dosa × 1         │    │  ← 13px muted
│  │  Apr 1 → Apr 30 · 18 days left     │    │  ← 12px muted
│  │                          [Edit]     │    │  ← ghost button
│  └─────────────────────────────────────┘    │
│                                              │
│  ┌─────────────────────────────────────┐    │
│  │       + New Pass                    │    │  ← dashed border card, coral text
│  └─────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

#### New Pass Wizard (Bottom Sheet, full 92%)
- **Step 1**: Select child + break slot (two large tap targets, not dropdowns)
- **Step 2**: Pick items from menu grid (same card style as menu page, with "+" buttons)
- **Step 3**: Review summary + cost breakdown + "Slide to Pay" slider

#### Payment Confirmation
- Same slide-to-confirm interaction as current, but styled with coral gradient instead of dark theme

---

## PHASE 3: DIGITAL LIBRARY

### 3.1 — Library Showcase (`app/(parent)/library-showcase/page.tsx`)

**CURRENT**: Multiple horizontal rails with book cards, category icons, AI recommendations
**NEW**: Netflix-style immersive browse

#### Screen Layout
```
┌─────────────────────────────────────────────┐
│  Library                      🔔  👤        │
├─────────────────────────────────────────────┤
│  [🔍 Search books...]                       │  ← rounded-full, bg-muted/40
├─────────────────────────────────────────────┤
│                                              │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐  →   │  ← "For You" rail
│  │cover │ │cover │ │cover │ │cover │       │     book covers, no text
│  │      │ │      │ │      │ │      │       │
│  └──────┘ └──────┘ └──────┘ └──────┘       │
│  For You                                    │  ← 11px uppercase, below covers
│                                              │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐  →   │  ← "Trending" rail
│  │cover │ │cover │ │cover │ │cover │       │
│  └──────┘ └──────┘ └──────┘ └──────┘       │
│  Trending                                   │
│                                              │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐  →   │  ← "New Arrivals"
│  │cover │ │cover │ │cover │ │cover │       │
│  └──────┘ └──────┘ └──────┘ └──────┘       │
│  New Arrivals                               │
│                                              │
└─────────────────────────────────────────────┘
```

#### Book Cover Cards
- **Dimensions**: w-[120px] aspect-[2/3] (portrait book ratio)
- **Image**: rounded-xl, object-cover, full bleed
- **No text overlay on card** — title/author visible only on tap
- **Badges**: Top-left corner only
  - Coral dot: pending request
  - Emerald dot: available
  - No text labels on the card surface
- **Favorite**: Heart icon, top-right, only visible on hover/long-press
- **Tap**: Opens Book Detail Sheet

#### Book Detail Sheet
- **Type**: Bottom Sheet, snap 65% then 90%
- **Content**:
  ```
  ┌───────────────────────────────┐
  │         ── (drag handle) ──   │
  │                               │
  │  ┌───────────┐               │
  │  │           │  Title         │  ← 20px Cormorant 700 (serif!)
  │  │   COVER   │  Author Name  │  ← 14px muted
  │  │  120×180  │  Fiction ·     │  ← 12px muted
  │  │           │  Available: 3  │  ← 12px emerald
  │  └───────────┘               │
  │                               │
  │  ┌─────────────────────────┐  │
  │  │   Request for Arjun  ▼ │  │  ← h-12, coral button, child selector
  │  └─────────────────────────┘  │
  │                               │
  │  About this book              │  ← 13px uppercase muted
  │  A gripping tale of...        │  ← 15px body text, expandable
  │                               │
  │  AI Summary (Certe+)          │  ← 13px uppercase muted
  │  Clean markdown rendering     │
  └───────────────────────────────┘
  ```

#### Rail Headers
- **Label below covers** (not above): "For You", "Trending", etc.
- **Style**: 11px uppercase, tracking-[0.08em], muted-foreground
- **No count badges** — remove "(12 books)"
- **No icons** next to section headers (remove Sparkles, TrendingUp, etc.)

#### Search
- **Same as menu**: rounded-full, muted bg, inline filter
- Results replace the rails with a flat grid (3-col covers)

---

### 3.2 — Book Reader (`app/(parent)/library-reader/page.tsx` + `components/reader/book-reader.tsx`)

#### Reader Home (session list)
**CURRENT**: Search, currently reading cards, trending grid, discover grid, pagination
**NEW**: Clean, focused reading dashboard

```
┌─────────────────────────────────────────────┐
│  Reader                          🔔  👤     │
├─────────────────────────────────────────────┤
│  [🔍 Search public domain books...]        │
├─────────────────────────────────────────────┤
│                                              │
│  Continue Reading                           │  ← 11px uppercase muted
│  ┌─────────────────────────────────────┐    │
│  │ ┌──────┐  The Great Gatsby          │    │  ← 16px Cormorant 600
│  │ │cover │  F. Scott Fitzgerald       │    │  ← 13px muted
│  │ │56×80 │  ████████░░ 72%           │    │  ← progress bar, coral fill
│  │ └──────┘  [Continue →]              │    │  ← ghost button, coral text
│  └─────────────────────────────────────┘    │
│  ┌─────────────────────────────────────┐    │
│  │ ┌──────┐  Pride & Prejudice         │    │
│  │ │cover │  Jane Austen               │    │
│  │ │      │  ███░░░░░░░ 28%           │    │
│  │ └──────┘  [Continue →]              │    │
│  └─────────────────────────────────────┘    │
│                                              │
│  Discover                                   │  ← 11px uppercase muted
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐  →   │
│  │cover │ │cover │ │cover │ │cover │       │
│  │      │ │      │ │      │ │      │       │
│  └──────┘ └──────┘ └──────┘ └──────┘       │
│  More →                                     │  ← paginated via "More" ghost link
└─────────────────────────────────────────────┘
```

- **Continue Reading cards**: Horizontal flex, cover left (56×80), content right
  - Title in Cormorant 600 (serif accent), author 13px muted
  - Progress bar: h-1.5, rounded-full, coral fill
  - "Continue →" ghost text button
  - Swipe card left → "Remove" action (red bg reveal)
- **Discover**: Same cover-only rail as library showcase. "More →" loads next page (no pagination dots)
- **Remove**: Trending section (merge into Discover), "In Library" badge complexity

#### Book Reader (immersive reading view)
**CURRENT**: Top bar + content + bottom bar + settings/chapters/annotations panels
**NEW**: True full-screen reading, controls auto-hide, minimal chrome

**Default state (controls visible)**:
```
┌─────────────────────────────────────────────┐
│  ←  The Great Gatsby    Ch.3    ⚙️  ≡  ⛶   │  ← top bar, 48px, translucent
├─────────────────────────────────────────────┤
│                                              │
│   (centered reading content, max-w-640)     │
│   Georgia / serif / 16-22px / 1.7-2.0 lh   │
│                                              │
│   "In my younger and more vulnerable years  │
│   my father gave me some advice that I've   │
│   been turning over in my mind ever since." │
│                                              │
│                                              │
├────────── progress bar (2px, coral) ────────┤
│  ◀    🔖  🖍️  🌙  🔊    ▶     pg 12/89    │  ← bottom bar, 48px, translucent
└─────────────────────────────────────────────┘
```

- **Auto-hide**: Controls fade out after 3s of no interaction
- **Tap center**: Toggle controls visibility
- **Swipe left/right**: Next/prev page (smooth spring transition)
- **Top bar**: Back arrow, truncated title (13px), chapter label (11px muted), settings gear + chapters list + fullscreen
- **Bottom bar**: Prev/Next arrows (edges), center cluster of icon buttons (bookmark, highlight, reading mode, TTS), page counter right (11px muted mono)
- **Progress**: Full-width 2px bar between content and bottom bar, coral fill

#### Settings Panel
- **Type**: Bottom Sheet, 45%
- **Content**: Clean grid
  - Reading mode: 4 circles (Light/Dark/Warm/Grey) — tap to select, coral ring on active
  - Font size: "−" [ 18px ] "+" — simple stepper
  - Line height: 3 pill options (Compact / Normal / Relaxed)
  - Page width: 3 pill options (Narrow / Medium / Wide)

#### Chapters Panel
- **Type**: Bottom Sheet, 60%
- Simple numbered list, active chapter has coral dot, tap to jump

#### Highlight Toolbar (floating)
- **Position**: Appears above selected text
- **Style**: Pill shape, bg-card, shadow-lg, rounded-full, h-10
- 5 color circles (20px each) + cancel text
- One-tap to confirm highlight

---

### 3.3 — Library History (`app/(parent)/library-history/page.tsx`)

**CURRENT**: Filter bar + issued cards + history list with badges
**NEW**: Timeline-style minimal list

```
┌─────────────────────────────────────────────┐
│  History                         🔔  👤     │
├─────────────────────────────────────────────┤
│                                              │
│  Currently Issued                           │  ← 11px uppercase muted
│  ┌─────────────────────────────────────┐    │
│  │ ┌──────┐ Harry Potter               │    │
│  │ │cover │ J.K. Rowling               │    │
│  │ │44×64 │ Due Apr 15 · 11 days       │    │  ← emerald text
│  │ └──────┘                            │    │
│  └─────────────────────────────────────┘    │
│  ┌─────────────────────────────────────┐    │
│  │ ┌──────┐ 1984                       │    │
│  │ │cover │ George Orwell              │    │
│  │ │      │ Overdue 3 days    ●        │    │  ← red text + red dot
│  │ └──────┘                            │    │
│  └─────────────────────────────────────┘    │
│                                              │
│  Returned                                   │  ← 11px uppercase muted
│  ┌─────────────────────────────────────┐    │
│  │  The Alchemist · Paulo Coelho       │    │  ← 14px, no cover image
│  │  Returned Mar 20                    │    │  ← 12px muted
│  └─────────────────────────────────────┘    │
│  ┌─────────────────────────────────────┐    │
│  │  Sapiens · Yuval Harari            │    │
│  │  Returned Mar 5                    │    │
│  └─────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

- **Issued books**: Cover thumbnail + title/author/due date. Red dot indicator for overdue (not a full badge)
- **Returned books**: Text-only rows (no cover thumbnail needed), more compact
- **Remove**: Search/filter bar, category dropdown, child selector from top. Add child filter only if 2+ children as a pill toggle
- **Remove**: Status text badges — convey via color only (red = overdue, emerald = fine)
- **Section dividers**: 11px uppercase section headers, not card headers with icons

---

## PHASE 4: ACADEMIC HUB

### 4.1 — Assignments/Notes Feed (`app/(parent)/assignments/page.tsx`)

**CURRENT**: Tab navigation + tag filter + card list with type icons, author, date, badges
**NEW**: Clean feed like a messaging app

```
┌─────────────────────────────────────────────┐
│  Notes                           🔔  👤     │
├─────────────────────────────────────────────┤
│  (Assignments) (Notes)                      │  ← 2 pills, coral active
├─────────────────────────────────────────────┤
│                                              │
│  Today                                      │
│  ┌─────────────────────────────────────┐    │
│  │  Math Homework Ch. 5               │    │  ← 16px Satoshi 600
│  │  Complete exercises 5.1 to 5.4...  │    │  ← 13px muted, 1-line truncate
│  │  Due Apr 7 · Mrs. Sharma           │    │  ← 12px, due in coral if soon
│  └─────────────────────────────────────┘    │
│  ┌─────────────────────────────────────┐    │
│  │  Science Lab Safety Rules          │    │
│  │  Please read the attached PDF...   │    │
│  │  📎 2 files · Mr. Patel            │    │  ← paperclip + count
│  └─────────────────────────────────────┘    │
│                                              │
│  Yesterday                                  │
│  ┌─────────────────────────────────────┐    │
│  │  English Essay Guidelines          │    │
│  │  Write a 500-word essay on...      │    │
│  │  Due Apr 10 · Ms. Gupta           │    │
│  └─────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

- **Tab pills**: "Assignments" / "Notes" — rounded-full, coral active, gray inactive
- **Cards**: No borders, bg-card, rounded-2xl, p-4
  - Title: 16px Satoshi 600
  - Preview: 13px muted, 1 line
  - Meta line: 12px. Due date (coral if ≤48h, red if overdue) + separator + author name
  - Attachments: "📎 2" inline on meta line (not separate badges)
- **Remove**: Type icon boxes, tag badges on cards, ChevronRight, attachment type breakdown
- **Group by date** (same as orders)
- **Tag filter**: Only if tags exist — small "Filter" ghost button top-right, opens bottom sheet with tag pills
- **Tap card**: Navigate to detail page

### 4.2 — Assignment/Note Detail (`app/(parent)/assignments/[id]`)

**CURRENT**: Back link + metadata section + body + attachments + submission section
**NEW**: Clean reading view, Medium-style

```
┌─────────────────────────────────────────────┐
│  ←                                           │  ← back arrow only
├─────────────────────────────────────────────┤
│                                              │
│  Math Homework                              │  ← 28px Satoshi 700
│  Chapter 5 Exercises                        │
│                                              │
│  Mrs. Sharma · Due Apr 7                    │  ← 13px muted
│  #math #homework                            │  ← 12px coral tag pills
│                                              │
│  Complete exercises 5.1 through 5.4         │  ← 16px body text, generous line-height
│  from the textbook. Show all working.       │
│  Focus on quadratic equations.              │
│                                              │
│  Attachments                                │  ← 11px uppercase muted
│  ┌─────────────────────────────────────┐    │
│  │  📄 Worksheet.pdf · 2.1 MB    ↓    │    │  ← file row, download icon
│  └─────────────────────────────────────┘    │
│                                              │
│  ┌─────────────────────────────────────┐    │
│  │       Submit Assignment       ↑     │    │  ← h-14 coral button (if assignment)
│  └─────────────────────────────────────┘    │
│                                              │
└─────────────────────────────────────────────┘
```

#### Submission Sheet
- **Type**: Bottom Sheet, 70%
- Textarea for text submission
- File upload dropzone (dashed border, tap to browse)
- "Submit" coral button
- If already submitted: Show status, grade, feedback inline on page (not in sheet)

---

### 4.3 — Calendar (`app/(parent)/calendar/page.tsx`)

- Keep current monthly grid structure but simplify
- **Remove**: Legend section (convey type by dot color only)
- **Date cells**: Larger tap targets (48x48 min), today has coral ring
- **Event dots**: Max 3 dots under date, colors match type
- **Selected date panel**: Bottom Sheet snap 40% showing events for that day
  - Each event: single line "Math Homework · Due" or "Holiday · Diwali"
  - Tap event → navigate to detail

---

## PHASE 5: SETTINGS & SUPPORT SCREENS

### 5.1 — Wallet Page (`app/(parent)/wallet/page.tsx`)
- Keep the premium card stack design (it's already good)
- Simplify transaction list: remove icons, just show "+₹500 Top-up · Apr 1" or "−₹326 Canteen · Apr 1" with color (green/red)
- Top-up sheet: Keep quick amounts + manual input, style buttons as rounded-full pills

### 5.2 — Children Page (`app/(parent)/children/page.tsx`)
- Simple list of child cards (avatar circle + name + class)
- "Add Child" as a ghost "+" button in header
- Add child form: Bottom Sheet with inputs

### 5.3 — Controls Page (`app/(parent)/controls/page.tsx`)
- Keep dual-mode (canteen/library) as 2 pills
- Simplify each control to a single card per category
- Toggle switches instead of grid of toggle buttons for blocked categories
- Clean input fields for limits

### 5.4 — Notifications
- **Drawer** (from header bell, not a page): Already good approach
- Simplify notification items: single line title + timestamp, no icons per type
- Unread: coral left border accent (2px)
- "Mark all read" as ghost text link top-right

---

## PHASE 6: DRAWERS & SHEETS (Consolidated)

All drawers/sheets use consistent structure:
- **Rounded-t-3xl** top corners
- **Drag handle**: 40×4px pill, centered, bg-muted/40, mt-2
- **Spring animation**: stiffness 300, damping 28
- **Backdrop**: bg-black/15 backdrop-blur-[2px]
- **Desktop**: Right-side panel (max-w-md) instead of bottom sheet

| Sheet | Trigger | Snap Points | Content Summary |
|-------|---------|-------------|-----------------|
| Cart Preview | Cart icon (header) | 50% | Item list + "Open Cart" button |
| Wallet Preview | Wallet card in profile | 50% | Balances + "Top Up" |
| Notifications | Bell icon (header) | 60%, 90% | Grouped notifications |
| Payments | "Payments" in profile | 60%, 90% | Event list + detail |
| Item Detail | Menu card tap | 65% | Image + name + price + "Add" |
| Order Detail | Order card tap | 70%, 92% | Full order breakdown |
| Cancel Reason | "Cancel" in order detail | 45% | Reason pills + confirm |
| Rating | "Rate" in order detail | 50% | Stars + textarea |
| Child Allocation | "Split" tap in cart | 50% | Per-child +/- controls |
| Special Instructions | "Instructions" in cart | 40% | Quick pills + textarea |
| Book Detail | Book cover tap | 65%, 90% | Cover + metadata + "Request" |
| Reader Settings | Gear in reader | 45% | Mode, font size, spacing |
| Reader Chapters | List icon in reader | 60% | Chapter list |
| Reader Annotations | Highlighter icon | 60% | Bookmarks + highlights tabs |
| Tag Filter | "Filter" button in feed | 35% | Tag pills |
| Calendar Events | Date tap in calendar | 40% | Events for selected date |
| New Pass Wizard | "+ New Pass" tap | 92% | 3-step wizard flow |
| Top-Up | "+" on wallet card | 50% | Amount selection + pay |
| Add Child | "+" in children | 55% | Form with name, GR, class |
| Submission | "Submit" on assignment | 70% | Text + file upload |

---

## FILES TO MODIFY

### Global Foundation
- `app/globals.css` — New color tokens, typography scale
- `app/layout.tsx` — Font imports (verify Satoshi loading)
- `app/(parent)/layout.tsx` — Complete rewrite: minimal header + 4-tab bottom nav

### Food Ordering
- `app/(parent)/menu/page.tsx` — Image-top cards, 2-col grid, category pills
- `components/add-to-cart-button.tsx` — Circular "+" initial state
- `components/menu-client.tsx` — Simplified card layout
- `app/(parent)/cart/page.tsx` — Single-column, swipe-to-delete
- `app/(parent)/orders/page.tsx` — Date-grouped minimal list + detail sheet
- `components/cancel-reason-sheet.tsx` — Restyle with pill reasons
- `components/order-feedback-sheet.tsx` — Simplify star picker
- `app/(parent)/pre-orders/page.tsx` — Pass list + wizard sheet

### Library
- `app/(parent)/library-showcase/page.tsx` — Cover-only rails, detail sheet
- `app/(parent)/library-reader/page.tsx` — Clean session list + discover rail
- `components/reader/book-reader.tsx` — Auto-hide controls, minimal chrome
- `app/(parent)/library-history/page.tsx` — Timeline list, red dot overdue

### Academic
- `app/(parent)/assignments/page.tsx` — Date-grouped feed, pill tabs
- `app/(parent)/content/page.tsx` — Minimal post management (if parent is also teacher)
- `app/(parent)/calendar/page.tsx` — Simplified grid + event sheet

### Settings & Support
- `app/(parent)/wallet/page.tsx` — Simplified transactions
- `app/(parent)/children/page.tsx` — Simple list + add sheet
- `app/(parent)/controls/page.tsx` — Toggle switches
- `app/(parent)/settings/page.tsx` — Replaced by profile sheet in layout

### Shared Components
- `components/canteen-selector.tsx` — Minimal inline pill
- `components/library-selector.tsx` — Same
- `components/parent-notification-bell.tsx` — Dot badge instead of count

---

## VERIFICATION

1. Walk through 4 critical flows on mobile viewport (375px): Order food → Checkout → View orders → Rate
2. Walk through: Browse library → Request book → Open reader → Read
3. Walk through: View assignments → Open detail → Submit → Check calendar
4. Verify all coral/terracotta primary tokens pass WCAG AA contrast (≥4.5:1) against white foreground
5. Verify bottom sheet drag interactions work smoothly (test on touch device)
6. Verify auto-hiding reader controls re-appear on tap
7. Run existing tests to ensure no functional regressions
8. Check dark mode renders correctly across all new components

---

## DECISIONS

- **4 persistent bottom tabs** (Food/Library/Notes/Settings) replace the mode-switching paradigm. Simpler mental model.
- **Bottom sheets over full pages** for detail views (orders, books, settings). Keeps context. User stays oriented.
- **Cover-first, text-second** for all visual content (food images, book covers). Let imagery communicate.
- **Date-grouped lists** for orders and assignments. Time is the most natural axis.
- **Cormorant Garamond for book titles** — serif accent adds literary elegance to library sections without needing a new font.
- **No search on orders/history pages** — these are low-frequency, low-volume lists. Search adds clutter for minimal benefit.
- **Settings page replaced by profile sheet** — reduces navigation depth. Everything is 1 tap.
