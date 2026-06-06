# Design System — Tennis Bootcamp

Concrete tokens and patterns. Apply these before inventing new styles.

## Color tokens

| Role | Value / Class |
|---|---|
| Page background | `#061427` (deep navy) |
| Lime primary — CTAs, accents | `#B4E655` |
| Lime secondary — gradient stops | `#8CC63F` |
| Body text on dark | `rgba(255,255,255,0.92)` / `text-white/90` |
| Muted body | `text-white/70` |
| Subtle / labels | `text-white/50` |
| Disabled | `text-white/30` |
| Card background | `bg-white/5` |
| Card border | `border-white/10` |
| Lime tint chip | `bg-[#B4E655]/10 text-[#B4E655]` |
| Yellow warn chip | `bg-yellow-400/10 border-yellow-400/30 text-yellow-200` |
| Error text | `text-red-400` |
| Page gradient overlay | `tb-gradient` utility (defined in `globals.css`) |

## Spacing

- Section vertical padding: `py-12` mobile, `py-16` or `py-20` desktop
- Max content width: `max-w-5xl` (detail pages) or `max-w-6xl` (marketing)
- Standard horizontal padding: `px-6`
- Card padding: `p-6` (compact) or `p-8` (primary cards)

## Typography

| Element | Classes |
|---|---|
| `h1` | `text-3xl font-semibold md:text-4xl` |
| `h2` | `text-2xl font-semibold` |
| `h3` | `text-xl font-semibold` |
| Body (main) | `text-base text-white/75` |
| Body (smaller surfaces) | `text-sm text-white/70` |
| Form labels | `text-sm text-white/70` |
| Captions / micro | `text-xs text-white/50` |

## Component patterns

### Buttons
```
Primary (lime):
  rounded-full bg-[#B4E655] px-6 py-3 text-sm font-semibold text-[#061427]
  hover:brightness-110 transition

Secondary (outline):
  rounded-full border border-white/25 px-6 py-3 text-sm font-semibold text-white/80
  hover:border-white/45 hover:text-white transition

Ghost:
  text-sm font-semibold text-white/60 hover:text-white transition
```

### Cards
```
Standard:
  rounded-2xl border border-white/10 bg-white/5 p-6

Primary (wizard chrome):
  rounded-3xl border border-white/10 bg-white/5 p-6 md:p-8
  shadow-[0_24px_80px_rgba(0,0,0,0.4)]

Lime-tinted highlight:
  rounded-2xl border border-[#B4E655]/20 bg-[#B4E655]/5 p-5
```

### Form inputs
```
rounded-2xl border border-white/10 bg-white/5 px-4 py-3
text-base text-white placeholder:text-white/30
focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50
focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427]
md:text-sm
```
Note: use `text-base` on mobile to prevent iOS auto-zoom; `md:text-sm` for desktop.

### Focus states (all interactive elements)
```
focus:outline-none
focus-visible:ring-2 focus-visible:ring-[#B4E655]/50
focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427]
```

### Section accent rule (dashboard / profile style)
```
border-l-2 border-[#B4E655] pl-4
```

### Chips / badges
```
rounded-full px-2 py-0.5 text-[10px] font-medium
(apply color tokens from table above)
```

### Coming-soon / alert blocks
```
rounded-2xl border border-[#B4E655]/20 bg-[#B4E655]/5 px-6 py-6
```

## Anti-patterns — do NOT use

- Glassmorphism (heavy `backdrop-blur` on cards)
- SaaS-style multi-stop or rainbow gradients
- Floating drop-shadows on dark cards
- Generic stock photo overlays
- Text drop shadows
- Neon glows or "tech startup" curved tags
- Gradients for their own sake (use flat lime + navy)

## Brand voice in UI copy

- Write as a world-class coach speaking directly to a motivated player
- Confident, athletic, premium — not salesy, casual, or exclamation-heavy
- Refer to `ops/briefs/brand.md` for full voice guidelines before writing any public-facing copy
