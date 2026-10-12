---
name: level-up-design
description: The Level Up design system (dark navy + glassmorphism, Space Grotesk/Inter, strict colour meanings, 3D tilt / glow / spring motion, motivation and accessibility rules). Use this skill whenever building or changing any UI in this project: new pages, components, styles, empty states, animations or copy in client/.
---

# Level Up design system

Level Up is a personal growth tracker (DSA, projects, fitness, AI learning, career). The UI should feel
**premium, calm and motivating**: a dark glass dashboard that rewards progress and never shames.
Apply every rule below to any UI you add or change. If an existing screen breaks a rule, fix it in passing
when you are already editing that screen; don't restyle unrelated screens unasked.

Where things live:
- Tokens and base styles: `client/src/styles.css` (top `:root` block). Feature styles: `client/src/styles-*.css`.
- Effects: `client/src/components/fx.jsx` (TiltCard, GlowBorder, Stagger/StaggerItem, EmptyState, LockBadge, XpFloat),
  `client/src/lib/celebrate.js` (burst, levelUpConfetti), styles in `client/src/styles-fx.css`. Live preview: `/design`.
- Shared components: `client/src/components/ui.jsx` (ProgressBar, ProgressRing, ErrorBox, Loading…).
- Area accents: `client/src/areas.js` + `[data-area]` selectors.

---

## 1. Theme tokens (CSS variables)

Always use variables, never raw hex in components. Extend the existing `:root` block; keep the
existing names (`--bg`, `--surface`, `--text`, `--muted`, `--success`, `--streak`, `--danger`, area colours).

```css
:root {
  /* Surfaces: deep navy, never pure black */
  --bg: #0B1220;
  --bg-glow: radial-gradient(1200px 600px at 15% -10%, rgba(139, 92, 246, 0.16), transparent 60%),
             radial-gradient(900px 500px at 100% 0%, rgba(34, 211, 238, 0.08), transparent 55%);
  --glass: rgba(19, 27, 46, 0.62);          /* card fill */
  --glass-strong: rgba(28, 39, 64, 0.78);   /* nested panels, inputs, hover */
  --glass-border: rgba(255, 255, 255, 0.08);/* the faint 1px border */
  --glass-blur: 14px;
  --text: #E6EDF7;
  --muted: #94A3B8;

  /* Meaning colours: see section 3. Each is used ONLY for its meaning */
  --brand: #7C3AED;        /* violet: brand, active level, primary buttons (white text 5.7:1) */
  --brand-glow: #8B5CF6;   /* lighter violet for glows/borders only: white text on it is just 4.2:1 */
  --brand-text: #C4B5FD;   /* violet for text on dark (AA) */
  --streak: #FBBF24;       /* amber: streak + today's task only */
  --success: #34D399;      /* green: completion only */
  --focus: #22D3EE;        /* cyan: focus rings + progress bars */
  --danger: #F87171;       /* red: destructive actions / real errors only */
  --on-brand: #FFFFFF;     /* text on violet buttons */
  --on-bright: #0B1220;    /* text on amber / green / cyan fills */

  /* Depth: layered shadows (ambient + key + inner highlight) */
  --shadow-1: 0 1px 2px rgba(0,0,0,.35), 0 4px 12px rgba(0,0,0,.25);
  --shadow-2: 0 2px 4px rgba(0,0,0,.35), 0 12px 32px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.05);
  --shadow-3: 0 4px 8px rgba(0,0,0,.4), 0 24px 56px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.06);

  --radius: 16px;
  --radius-sm: 10px;
  --font-display: 'Space Grotesk', system-ui, sans-serif;
  --font-body: 'Inter Variable', 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --ease-spring: cubic-bezier(.34, 1.56, .64, 1);
}
body { background: var(--bg-glow), var(--bg); background-attachment: fixed; font-family: var(--font-body); }
```

**Area accents** (`--dsa`, `--react`, `--workout`, `--ai`…) still exist, but only for **identity**: the nav
icon, the page title tag and the area chip. They never replace the meaning colours. A primary button is violet
on every page, and a completed lesson is green on every page.

## 2. Typography

- Fonts are bundled with the app (they work offline under PM2), imported once in `client/src/main.jsx`:
  `@fontsource-variable/inter` and `@fontsource/space-grotesk` 500/600/700. Don't add Google Fonts links.
- Headings (`h1–h3`), big stat numbers, level numbers and XP: `var(--font-display)`, weight 600–700,
  letter-spacing `-0.01em`. Body, labels, inputs and buttons: `var(--font-body)`.
- Numbers that update (counts, XP, timers): `font-variant-numeric: tabular-nums` so they don't jitter.
- Scale: h1 1.6–1.9rem · h2 1.15rem · body 15px/1.55 · small 0.85rem. Never below 12px.

## 3. Colour meanings (strict)

| Colour | Token | Use it for | Never use it for |
|---|---|---|---|
| Violet | `--brand` | Logo, the active level / current item, primary buttons, selected tab | Decoration everywhere |
| Amber | `--streak` | 🔥 streak chip, **today's** task / "Today" highlight | Warnings, generic highlights |
| Green | `--success` | Completed items, ✓ ticks, 100% states | "Good" text, links, buttons |
| Cyan | `--focus` | Keyboard focus rings, progress-bar fills, in-progress indicators | Completion |
| Red | `--danger` | Destructive confirmations (Delete), genuine system errors (save failed) | Missed days, failed tasks, low scores, overdue items, being behind |

- Missed or behind = neutral (`--muted`) plus a forward-looking message ("Pick up where you left off").
- One meaning per element: a completed *today* task is green (completion wins over today).
- Tinted backgrounds use `color-mix(in srgb, var(--x) 14%, transparent)` and keep text at `--text`.

## 4. Surfaces: glass cards

```css
.card {
  background: var(--glass);
  backdrop-filter: blur(var(--glass-blur)) saturate(140%);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(140%);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-2);
}
.card:hover { box-shadow: var(--shadow-3); }
@supports not (backdrop-filter: blur(1px)) { .card { background: #131B2E; } }
```

- Keep glass fill opacity **≥ 0.6** so text contrast never depends on what's behind the card.
- Nest at most two glass layers; inner panels use `--glass-strong` without a second blur.
- No borders thicker than 1px except the animated glow border (section 5).

## 5. Motion

Library: **Motion** (Framer Motion), installed in `client`; import `from 'motion/react'`. Confetti: `canvas-confetti`.
The app is already wrapped in `<MotionConfig reducedMotion="user">` (`main.jsx`). Reuse the fx.jsx components before writing new effects.

**Golden rules**
1. Animate **only `transform` and `opacity`** (plus `filter` on glare overlays). Never animate width, height,
   top/left, margin or box-shadow on hover; fake a shadow change with an opacity-faded pseudo-element.
2. **Always respect `prefers-reduced-motion`.** The app is wrapped once in `<MotionConfig reducedMotion="user">`; the
   global CSS guard below is in `styles.css`; in JS check `useReducedMotion()` before tilt, confetti and looping animations.
   Reduced motion means: no tilt, no confetti, no looping glow; fades of 150 ms or less are fine.
3. Durations: micro 120–180 ms, entrances spring, nothing over 600 ms except celebrations.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important;
    transition-duration: .01ms !important; scroll-behavior: auto !important; }
}
```

**3D hover tilt + glare** (cards that are clickable or important, not every card):
- Max **8°** on each axis, `perspective: 900px`, spring back to 0 on leave (`stiffness 300, damping 20`).
- Glare: an absolutely positioned overlay with
  `radial-gradient(circle at var(--gx) var(--gy), rgba(255,255,255,.14), transparent 45%)`,
  opacity 0 → 1 on hover, `pointer-events: none`.
- Pointer-only: skip on touch (`(hover: hover) and (pointer: fine)`) and under reduced motion.
- Use `<TiltCard>` from `components/fx.jsx`; never re-implement it per page.

**Animated conic glow border:** only on the **single current/active item** (the next lesson, the active level, today's block).
```css
@property --angle { syntax: '<angle>'; initial-value: 0deg; inherits: false; }
.glow-active { position: relative; isolation: isolate; }
.glow-active::before {
  content: ''; position: absolute; inset: -1px; border-radius: inherit; padding: 1px; z-index: -1;
  background: conic-gradient(from var(--angle), var(--brand), var(--focus), var(--brand) 40%, transparent 60%, var(--brand));
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor; mask-composite: exclude;
  animation: glow-spin 4s linear infinite;
}
@keyframes glow-spin { to { --angle: 360deg; } }
@media (prefers-reduced-motion: reduce) { .glow-active::before { animation: none; } }
```

**Staggered spring entrances** (lists, card grids, roadmap levels):
```jsx
const list = { show: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } } };
const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 24 } } };
<motion.ul variants={list} initial="hidden" animate="show">{rows.map((r) => <motion.li key={r.id} variants={item}>…</motion.li>)}</motion.ul>
```
Stagger at most about 12 items; after that, show the rest at once.

**Completion celebration** (lesson, problem or workout marked done):
- `canvas-confetti` burst from the button's position (about 80 particles, brand/cyan/green/amber colours,
  `disableForReducedMotion: true`).
- A floating **"+XP"** label: display font, `--brand-text`, rising `y: 0 → -36` with `opacity 1 → 0` over about 900 ms.
- The item's tick turns green with a small scale pop (`1 → 1.15 → 1`).
- Under reduced motion: no confetti; show "+XP" as a static toast for 2 s.
- Only for real completions the user just did, never on page load.

## 6. Motivation rules

- **Never show a bare zero.** Replace `0`, `0/69`, `0 day streak` or empty charts with an encouraging state that
  points to the first step:
  - streak 0 → "Start your streak today" (amber chip, outlined)
  - 0 lessons → "Your first lesson takes ~60 min →" plus the button
  - an empty list → a friendly one-liner and one primary action
  Zeros inside a larger number are fine (e.g. "10/69").
- **Locked content:** opacity 0.7 (lower fails 3:1 on glass; never dim a parent and child both), `filter: saturate(.4)`, a 🔒 icon (or SVG) and a one-line reason
  ("Finish Level 3 to unlock"). Keep it readable (text contrast ≥ 3:1 even when dimmed) and focusable, and
  announce it with `aria-disabled="true"`. Never hide future content entirely; seeing it motivates.
- **The next action is always obvious:** every screen has exactly one primary (violet) button for the most
  useful next step, placed above the fold, often inside the glow-bordered current item. Secondary actions are
  ghost/outlined buttons.
- **Tone:** forward-looking and specific ("2 lessons to finish Level 1"), never guilt ("You missed 3 days").
  Behind schedule shows a catch-up plan, not a red count.
- Show progress as rings and bars (cyan fill, green at 100%) with the remaining step, not just a percentage.

## 7. Accessibility (non-negotiable)

- Contrast: body text ≥ 4.5:1 and large text / UI parts ≥ 3:1 against the **effective** glass colour. Use
  `--brand-text`, not `--brand`, for violet text on dark.
- Focus: every interactive element shows a visible ring:
  `:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; border-radius: inherit; }`.
  Never `outline: none` without a replacement.
- Keyboard: everything clickable is a `<button>` or `<a>` (no click handlers on divs). Tabs use arrow keys plus
  `aria-selected`; expandables use `aria-expanded`; dialogs trap focus and close on Esc; tilt and hover effects
  have no keyboard-only content.
- Never use colour as the only signal: pair it with an icon or text (✓ done, 🔒 locked, 🔥 streak).
- Decorative layers (glow, glare, confetti canvas) are `aria-hidden` and `pointer-events: none`.
- Touch targets ≥ 40×40 px; layout works at 360 px wide (the app has a bottom tab bar on phones).

## 8. Checklist before finishing any UI change

- [ ] Only tokens used; meaning colours used only for their meaning; no red for missed or failed.
- [ ] Headings in the display font, body in Inter, tabular numbers where values change.
- [ ] Cards are glass with a 1px faint border and layered shadow; glass opacity ≥ 0.6.
- [ ] Only transform/opacity animated; reduced motion checked (CSS guard, `MotionConfig`, `useReducedMotion`).
- [ ] Glow border is on one current item only; tilt ≤ 8° and pointer-only.
- [ ] No bare zeros; empty states encourage; locked items dimmed with a lock and reason; one obvious primary action.
- [ ] Keyboard path works, focus rings visible, contrast checked.
- [ ] Checked on the live app (`npm run app:update`, then http://localhost:4000) at desktop and phone width.
