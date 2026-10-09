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
| Subtle / labels / captions | `text-white/60` (the floor, see below) |
| Disabled | `disabled:text-white/30` (disabled states only) |
| Card background | `bg-white/[0.03]` (`Card`; inputs and chips keep `bg-white/5`) |
| Card border | `border-white/10` |
| Lime tint chip | `bg-[#B4E655]/10 text-[#B4E655]` |
| Neutral chip (age, forming, invite only, full) | `border border-white/15 bg-white/5 text-white/85` |
| Coming Soon chip | `border border-dashed border-white/25 bg-[#061427] text-white/85` (never the warn yellow) |
| Info chip (make-up session, completed) | `bg-sky-400/15 text-sky-200` |
| Yellow warn chip (a real warning, e.g. "2 spots left") | `bg-yellow-400/10 border-yellow-400/30 text-yellow-200` |
| Error text | `text-red-400` |
| Control border (inputs, selects, unselected cells) | `border-white/35` (about 3.1:1 on the navy) |
| Page gradient overlay | `tb-gradient` (lime and navy glow, fades out at the bottom; `globals.css`) |

### Contrast floor (audit M23)

- Text that is not disabled is `text-white/55` or brighter; at 12px (`text-xs`) and below it is `text-white/60` or brighter. In practice: `/60` for labels, captions and hints, `/70` for muted body.
- Placeholders are `placeholder:text-white/45` or brighter, and never carry information the label does not (a format example is fine; the requirement goes in the label or hint).
- The only exceptions are disabled states (written as `disabled:` variants), decorative glyphs that are `aria-hidden`, and the tier graphics and email templates, which have their own rules.
- Controls keep a 3:1 boundary (WCAG 1.4.11): inputs, selects and unselected toggle cells use `border-white/35`.
- `npm test` (`test-forms-a11y.ts`) fails on `text-white/20`–`/50`, a placeholder below `/45` or `text-[10px]`/`text-[11px]` anywhere under `src`, outside `disabled:` variants and the tier components.

## Spacing

- **One Container rule** (audit H2): `Container` (`src/components/layout/Container.tsx`) is `mx-auto w-full max-w-6xl px-6`, and it is the only thing that sets a page's horizontal padding and max-width. The header, the footer, a breadcrumb and the page content all use it, so they share one left edge.
  - Pages apply it. Section components (`ProgramsGrid`, `Coaches`, `EventsList`, `EmailCapture`, `QuizBand`, `ProgramInterestForm`) never set `px-*`, `mx-auto` or `max-w-*xl` on themselves, and a page never cancels a gutter with `-mx-6`.
  - Full-bleed bands (the hero, the trust bar, a page's `tb-gradient` header band) paint their background edge to edge and put a `Container` inside.
  - A narrower reading measure goes on the text block (`max-w-2xl`), never on the container.
- Vertical rhythm: `py-12 md:py-16` for a page's content block (`PageStack` = Container + that rhythm + `space-y-16 md:space-y-20` between sections)
- Card padding: `p-6` (compact) or `p-8` (primary cards)
- No horizontal scroll at 360, 390, 768, 1024 or 1440 (`scrollWidth === clientWidth`). Check a preview with `BASE_URL=<url> npm run check:overflow`. Every text flex child that can shrink gets `min-w-0`.

## Typography

Use the `Heading` primitive (`src/components/ui/Heading.tsx`, audit L1): the tag sets the outline, the size sets the look. All semibold with tight tracking; the home hero H1 is the one exception.

| Element | Classes |
|---|---|
| `h1` (`size="page"`) | `text-3xl font-semibold tracking-tight md:text-4xl` |
| `h2` (`size="section"`) | `text-2xl font-semibold tracking-tight md:text-3xl` |
| `h3` (`size="card"`) | `text-lg font-semibold tracking-tight` |
| Body (main) | `text-base text-white/75` |
| Body (smaller surfaces) | `text-sm text-white/70` |
| Form labels | `text-sm text-white/70` |
| Captions / micro | `text-xs text-white/50` |

## Component patterns

### Buttons
Use `Button` (a link) or `buttonClass(variant)` (a native `<button>`) from `src/components/ui/Button.tsx`. Every button is 44px tall or more.
```
Primary (lime) — the quiz, and only the quiz, on marketing pages:
  min-h-[44px] rounded-full bg-[#B4E655] px-6 py-3 text-sm font-semibold text-[#061427]
  hover:brightness-110 transition          (the one primary hover, audit M12)

Secondary (outline) — Browse Programs, Book Your Assessment, newsletter and notify submits:
  min-h-[44px] rounded-full border border-white/25 px-6 py-3 text-sm font-semibold text-white/80
  hover:border-white/45 hover:text-white transition

Ghost:
  text-sm font-semibold text-white/60 hover:text-white transition
```
CTA weights (brand.md): the quiz is the lime primary; "Browse Programs" and "Book Your Assessment" are outline secondaries; the newsletter is tertiary and never lime. On phones a sticky bottom bar (`MobileQuizBar`) carries the quiz once the page's own quiz CTA has scrolled out; mark any in-page primary quiz CTA with `data-quiz-cta` so the bar hides while it is on screen.

### Cards
Use `Card` / `CARD_CLASS` (`src/components/ui/Card.tsx`, audit L1). No shadows on cards.
```
Standard:
  rounded-2xl border border-white/10 bg-white/[0.03] p-6
  hover (when the whole card is a link): border-white/25

Primary (wizard chrome) — the only rounded-3xl surface:
  rounded-3xl border border-white/10 bg-white/5 p-6 md:p-8

Lime-tinted highlight:
  rounded-2xl border border-[#B4E655]/20 bg-[#B4E655]/5 p-5
```

### Form inputs
Use `INPUT_CLASS`, `LABEL_CLASS` and `HINT_CLASS` from `src/components/ui/Input.tsx` (audit L1, M19, M23):
```
rounded-2xl border border-white/35 bg-white/5 px-4 py-3
text-base text-white placeholder:text-white/45 hover:border-white/50
aria-[invalid=true]:border-red-400
focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50
focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427]
md:text-sm
```
Note: use `text-base` on mobile to prevent iOS auto-zoom; `md:text-sm` for desktop.

### Forms: validation and announcements (audit M18, M19)
- Every field has a real `<label htmlFor>`. A group of fields about one player is a `<fieldset>` with a `<legend>` naming them; a Remove button names who it removes ("Remove Player 2").
- The primary button stays enabled. Pressing it checks the form: each problem shows under its field (`FieldError`, wired with `fieldA11y(id, { error })` for `aria-invalid` and `aria-describedby`), focus moves to the first problem, and a wizard lists what is missing under its button. A filled field is also checked when it loses focus; nothing turns red while a person types.
- The words come from `src/lib/formValidation.ts`: what is wrong and the one way out. A submit failure is a `FormAlert` (`role="alert"`) and always ends with info@tennisbootcamp.ca (`withHumanFallback`).
- Loading, saved and copied states are announced through `LiveStatus` (`role="status"`); a success that replaces the form takes focus.
- A multi-step wizard moves focus to the new step's `h1` (`tabIndex={-1}`, `useFocusOnChange`), and its progress bar is a `role="progressbar"`.
- A radio choice that is not a native radio (the booking slot picker) is `role="radiogroup"`/`role="radio"` with `aria-checked`, arrow keys and a ✓ as well as colour.

### Standalone links
Use `TextLink` or `TEXT_LINK_MUTED` / `TEXT_LINK_LIME` (`src/components/ui/TextLink.tsx`, audit L4): `inline-flex min-h-[44px] items-center` with the focus ring. Links inside running text stay inline.

### Focus states (all interactive elements)
`FOCUS_RING` from `src/components/ui/focus.ts` (audit L7):
```
focus:outline-none
focus-visible:ring-2 focus-visible:ring-[#B4E655]/50
focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427]
```
Never `focus:outline-none` without the ring, a read-only field included.

### Section accent rule (dashboard / profile style)
```
border-l-2 border-[#B4E655] pl-4
```

### Chips / badges
```
inline-flex min-h-6 items-center rounded-full px-2.5 py-1 text-xs font-medium
(apply color tokens from table above; 12px is the floor, never text-[10px] or text-[11px])
```

### Coming-soon / alert blocks
```
rounded-2xl border border-[#B4E655]/20 bg-[#B4E655]/5 px-6 py-6
```

### Page header band
```
<div className="tb-gradient"><Container className="py-14 md:py-16">…</Container></div>
```
`tb-gradient` is a lime-and-navy glow painted on `::before` and mask-faded to transparent at the bottom, so the band never ends in a hard seam (audit L2).

### Motion
- Every looping or decorative animation is `motion-safe:` (`motion-safe:animate-bounce`); `globals.css` also stops animation and transition for `prefers-reduced-motion: reduce`.
- The hero particle wave loads after the page is idle, pauses off screen and in hidden tabs, and draws one still frame under reduced motion.

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
