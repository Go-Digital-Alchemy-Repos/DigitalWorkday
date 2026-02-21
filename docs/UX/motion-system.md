# Performance-Safe Animation System

## Principles

1. **GPU-only properties** — Every animation uses `transform` and/or `opacity`. Never animate `height`, `width`, `top`, `left`, `margin`, or `padding`.
2. **Reduced motion** — A global `@media (prefers-reduced-motion: reduce)` rule disables all transitions and animations automatically.
3. **No list animations** — Never apply entrance animations to lists with 50+ items (task boards, chat timelines).
4. **Token-driven** — All durations and easings reference CSS custom properties so the entire app feels consistent.

---

## Motion Tokens

Defined in `client/src/styles/motion.css` and extended in `tailwind.config.ts`.

| Token | Value | Use |
|---|---|---|
| `--motion-fast` | 120 ms | Press feedback, micro-interactions |
| `--motion-base` | 180 ms | Default panel/menu entrance |
| `--motion-slow` | 240 ms | Larger surface enter (sheet) |
| `--ease-out-premium` | `cubic-bezier(0.22, 1, 0.36, 1)` | Default entrance ease |
| `--ease-springy` | `cubic-bezier(0.16, 1, 0.3, 1)` | Snappy pop-in |
| `--ease-in-out-smooth` | `cubic-bezier(0.4, 0, 0.2, 1)` | Symmetric ease |

The existing tokens in `tokens.css` (`--duration-fast`, `--ease-standard`, etc.) remain available for legacy use.

---

## CSS Utility Classes

### Transition helpers

| Class | Effect |
|---|---|
| `transition-safe` | `transition-property: transform, opacity` with base duration and premium ease |
| `transition-premium` | Transitions color, bg, border, shadow, transform, and opacity (existing) |
| `duration-motion-fast` | `--motion-fast` duration |
| `duration-motion-base` | `--motion-base` duration |
| `duration-motion-slow` | `--motion-slow` duration |
| `ease-out-premium` | Premium ease-out timing function |
| `ease-springy` | Snappy springy timing function |

### Animation helpers

| Class | Animation |
|---|---|
| `animate-motion-fade-in` | Opacity 0 → 1 |
| `animate-motion-slide-down` | translateY(-4px) + fade |
| `animate-motion-slide-up` | translateY(4px) + fade |
| `animate-motion-slide-in-right` | translateX(8px) + fade |
| `animate-motion-slide-in-left` | translateX(-8px) + fade |
| `animate-motion-pop-in` | scale(0.96) + fade |
| `animate-motion-pop-out` | scale(1) → scale(0.96) + fade out |

### Tailwind animation utilities (via config)

Available with Tailwind prefixes like `data-[state=open]:`:

- `animate-motion-fade-in`
- `animate-motion-slide-down`
- `animate-motion-slide-up`
- `animate-motion-pop-in`

---

## Motion Primitives (JS)

Import from `client/src/lib/motion.ts`:

```ts
import { Motion, motionClass, prefersReducedMotion } from "@/lib/motion";

// Use a named motion
<div className={Motion.panelEnter}>...</div>

// Conditionally apply motion (respects reduced-motion)
<div className={motionClass("base-class", Motion.fadeIn)}>...</div>
```

### Available primitives

| Key | Classes | Use |
|---|---|---|
| `Motion.panelEnter` | `animate-motion-slide-down` | Dropdown/popover entrance |
| `Motion.fadeIn` | `animate-motion-fade-in` | Generic fade |
| `Motion.slideUp` | `animate-motion-slide-up` | Bottom-anchored content |
| `Motion.popIn` | `animate-motion-pop-in` | Tooltip/badge pop |
| `Motion.hoverLift` | transition-safe + hover:-translate-y-0.5 | Card hover lift |
| `Motion.press` | active:scale-[0.98] + transition-safe | Button press |
| `Motion.cardHover` | transition-safe + hover:-translate-y-0.5 + hover:shadow-soft | Interactive card |

---

## Where Motion Is Applied

### Buttons
- `active:scale-[0.98]` press feedback on all buttons via `buttonVariants`
- Uses `transition-premium` for color/shadow transitions

### Dialogs / Sheets
- Overlay: fade-in/out with token-aligned durations (180ms open, 120ms close)
- Content: zoom + slide with token-aligned durations
- Sheet panel: slide from edge with 240ms open, 120ms close

### Dropdowns / Popovers / Select
- Already use `tailwindcss-animate` classes (fade, zoom, slide-in-from)
- Transform origin set via `origin-[--radix-*-content-transform-origin]`

### Task Cards
- Use `transition-premium` (not `transition-all`) for hover state transitions
- Elevation system (`hover-elevate`) handles brightness overlay

---

## Adding Motion to a New Component

1. Pick the right transition class:
   - Interactive hover/press → `transition-premium` or `transition-safe`
   - Entrance animation → `animate-motion-*` classes
2. Use token durations, not magic numbers
3. Never animate layout properties
4. For lists with many items, skip entrance animations
5. Test with `prefers-reduced-motion: reduce` enabled

### Example: Adding hover lift to a card

```tsx
<div className="transition-safe duration-motion-base ease-out-premium hover:-translate-y-0.5 hover:shadow-soft">
  Card content
</div>
```

Or use the primitive:

```tsx
import { Motion } from "@/lib/motion";
<div className={Motion.cardHover}>Card content</div>
```

---

## Avoid

- `transition-all` on interactive elements (use `transition-premium` or `transition-safe`)
- Animating `height`, `width`, `margin`, `padding`, `top`, `left`
- Heavy `backdrop-filter` or large `box-shadow` animations
- Entrance animations on 50+ item lists
- Continuous/infinite animations (except loading spinners)

`transition-all` is acceptable for progress bars and chart bars that need width animation.

---

## Reduced Motion

The global rule in `motion.css` forces all animation/transition durations to near-zero when the user has `prefers-reduced-motion: reduce` enabled. No per-component opt-in is needed.

For JS-driven animations, use `prefersReducedMotion()` from `@/lib/motion` to skip programmatic motion.

---

## QA Checklist

- [ ] `prefers-reduced-motion: reduce` disables all transitions
- [ ] Menus/panels animate smoothly on open/close
- [ ] No layout jank in task list or chat timeline
- [ ] Mobile interactions feel snappy
- [ ] No `transition-all` on frequently rendered interactive elements
