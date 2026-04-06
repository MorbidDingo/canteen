
### Rules
- **WCAG AA minimum**: 4.5:1 contrast for text, 3:1 for UI components
- Never use pure `#000000` or `#ffffff` — use `zinc-950` / `zinc-50` for softer contrast
- Dark mode: don't just invert — redesign. Dark backgrounds should be `zinc-900/950`, not black
- **Avoid full-saturation colors** for backgrounds — muted, tinted neutrals only
- Color carries meaning — use semantic colors consistently, never decoratively
- Test every palette for color blindness (deuteranopia, protanopia, tritanopia)

### Recommended Neutral Scales
- `slate` — cool, blue-tinted, great for tech/SaaS
- `zinc` — balanced, neutral, most versatile
- `stone` — warm, earthy, editorial/lifestyle

---

## Spacing & Layout

- **4px base grid** — all spacing is a multiple of 4: `4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96`
- **Proximity**: related elements closer together, unrelated further apart (Gestalt)
- **Padding > borders** for separating sections — let space do the work
- **Max content width**: `65ch` for reading, `1280px` for app layouts
- **Sections breathe**: generous vertical padding — minimum `64px` top/bottom on desktop, `40px` on mobile

### Layout Patterns by Screen
| Pattern | Mobile | Desktop |
|---|---|---|
| Navigation | Bottom bar or Sheet drawer | Sidebar or top nav |
| Cards | Single column, full-width | 2–3 column grid |
| Forms | Stacked, full-width fields | Contained, max 560px |
| CTAs | Full-width, sticky bottom | Inline or contained |
| Tables | Card-per-row or horizontal scroll | Full table |

---

## Iconography

- Use one icon library consistently — don't mix styles
- Recommended: **Lucide** (default with shadcn), **Radix Icons**, **Phosphor Icons**
- Icon size: `16px` inline, `20px` standalone, `24px` for navigation
- Always pair icons with labels on mobile — icon-only on mobile is an anti-pattern
- Stroke width should match font weight — light type = light stroke icons
- Never use icons purely decoratively if they add visual noise without meaning

---

## Motion & Micro-interactions

- Motion communicates **state change**, not decoration
- **Duration**: `100–150ms` for micro (hover, focus), `200–300ms` for transitions, `300–500ms` for page-level
- **Easing**: ease-in-out for most, ease-out for elements entering, ease-in for exiting
- **Avoid**: bouncing, spinning, flashing, looping animations in UI
- Respect `prefers-reduced-motion` — always provide a no-motion fallback
- Transitions that feel right: opacity fade, subtle translate (4–8px), scale (0.95→1)

---

## Design Critique Framework

When reviewing a design, evaluate in this order:

1. **Clarity** — Is the purpose immediately obvious? What is the user supposed to do?
2. **Hierarchy** — Does the eye travel in the right order? Is the CTA the most prominent element?
3. **Consistency** — Are spacing, color, and type decisions consistent throughout?
4. **Accessibility** — Does it meet contrast requirements? Is it usable without color?
5. **Responsiveness** — Does it work at 320px? Is mobile a first-class experience?
6. **Minimalism** — What can be removed? What is decorative but not functional?
7. **Emotion** — Does the design feel appropriate for the brand and audience?

---

## References

### Design Fundamentals
- [Refactoring UI](https://www.refactoringui.com) — the definitive design-for-developers resource
- [Laws of UX](https://lawsofux.com) — psychology principles applied to UI design
- [Nielsen Norman Group](https://www.nngroup.com/articles/) — research-backed UX articles
- [Butterick's Practical Typography](https://practicaltypography.com) — typography done right

### Visual Inspiration & Patterns
- [Mobbin](https://mobbin.com) — real mobile & web UI pattern library
- [Screenlane](https://screenlane.com) — mobile UI inspiration
- [Page Flows](https://pageflows.com) — user flow patterns from real products
- [Dark Patterns Hall of Shame](https://www.deceptive.design) — what NOT to do

### Color & Accessibility
- [Reasonable Colors](https://www.reasonable.work/colors/) — accessible color system
- [Radix Colors](https://www.radix-ui.com/colors) — semantic, accessible color scales
- [Colorbox by Lyft](https://www.colorbox.io) — palette builder with contrast checks
- [Who Can Use](https://www.whocanuse.com) — test color combos against disability types
- [WCAG 2.1 Quick Reference](https://www.w3.org/WAI/WCAG21/quickref/)

### Typography
- [Google Fonts](https://fonts.google.com) — free web fonts
- [Fontpair](https://www.fontpair.co) — curated font pairings
- [Type Scale](https://typescale.com) — visual type scale generator

### Mobile & Responsive Design
- [web.dev/learn/design](https://web.dev/learn/design) — responsive design fundamentals
- [Human Interface Guidelines (Apple)](https://developer.apple.com/design/human-interface-guidelines/) — mobile design standards
- [Material Design](https://m3.material.io) — Google's design system, great for component patterns
- [Inclusive Components](https://inclusive-components.design) — accessible pattern library
