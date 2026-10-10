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

## Tier tokens (audit H6, owner D1)

The level system has one colour ramp, slate → lime → platinum → gold, held as `Tier.color` in `src/lib/tiers.ts` and read everywhere else from there. Tier colours live only in graphics (emblems, pips, connectors, the RankCard's top rule); tier names are white text. Gold is a new token used nowhere but tier graphics. `npm test` (`test-tiers.ts`) asserts every colour is at least 4.5:1 on the navy and on a card, that navy on gold is at least 4.5:1, and that the seven are distinct.

| id | Tier | `color` | Hue family |
|---|---|---|---|
| 1 | Love | `#7D8CA3` slate | chalk |
| 2 | Rally | `#AEBBCD` light slate | chalk |
| 3 | Deuce | `#8CC63F` (lime secondary) | lime |
| 4 | Break | `#B4E655` (lime primary) | lime |
| 5 | Ace | `#D2F28A` bright lime | lime |
| 6 | Match Point | `#E6EBF0` platinum | platinum |
| 7 | Grand Slam | `#E3C46F` gold | gold |

- Unlit pip: `bg-white/[0.10]`. Future-state emblem ink: `#6A727D` (flat white/40 on navy). Field tints: lime `#1E312D`, platinum `#253243`, gold `#E3C46F`. Graphics only, never text.
- Class literals live in `src/lib/tierStyle.ts` (`TIER_PIP`, `TIER_PIP_OUTLINE`, `TIER_RULE`, `TIER_FRAME`, `tierStyle()`); every class is a complete literal so the JIT keeps it, and the test checks each hex against `TIERS[id].color`.
- No-gold fallback (if D1 is ever reversed): Grand Slam takes a solid platinum field with a navy motif and gold appears nowhere.

### Emblem frames

The motif inside each emblem is unchanged; the **frame** escalates, so the rank reads without colour (every adjacent pair differs in at least one feature; pinned by the test).

| Tier | Outer ring | Studs | Inner ring | Corners | Bevel | Field | Motif ink |
|---|---|---|---|---|---|---|---|
| 1 Love | 2 | – | faint white .12 | plain hex | – | navy | tier colour |
| 2 Rally | 2.5 | ✓ | faint | plain | – | navy | tier colour |
| 3 Deuce | 2.5 | ✓ | faint | plain | – | lime tint | tier colour |
| 4 Break | 2.5 | ✓ | 1.5 in tier colour | plain | – | lime tint | tier colour |
| 5 Ace | 3 | – | 1.5 | notched | – | lime tint | tier colour |
| 6 Match Point | 3 | – | 1.5 | notched | 1.5 | platinum tint | tier colour, white details |
| 7 Grand Slam | 3 | – | navy hairline .35 | notched | 1.5 | solid gold | navy |

- States: `earned` (the table), `future` (all ink `#6A727D`, outer ring only), `provisional` (dashed ring in the tier colour, motif at .6), `ghost` (dashed grey hexagon, no motif).
- Sizes: 20px minimum. 20–27px is the **mark** (outer shape only, stroke 5, no motif) and always sits beside the tier name in text. Standard sizes: 20 (chips), 28/40 (compact ladder), 32–44 (ladder), 56 (quiz result), 64/80 (RankCard), 128 (email PNG). The 16px chip glyph is retired.
- One primitive per job: `TierEmblem` (one tier), `TierLine` (`rail` and `ladder`), `RankCard` (a player's rank), `TierChip` / `TierRangeBadges` (inline tier text). No surface draws its own tier UI, and the line is never a horizontal scroller.
- Words banned in tier UI: "unlock", "level up", "rank up", "next level", "journey", "Requires {tier}". Programs say who they are for; tiers above a player read as future, never locked.
- Text in tier UI follows the floor: white/55 minimum, white/60 at `text-xs`, nothing below 12px.

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

## Court Plates (program art)

The program graphics are **Court Plates** (owner D13, 2026-10-09; audit H1): one court diagram per program, drawn in code as inline SVG from `src/lib/plates/`. No photos, no stock, no AI imagery, and never a person or a venue. They are sharp at any DPR, about 6–10 KB, deterministic, and need no image request.

- **One court, one camera.** Every plate draws the same court from the same fixed broadcast camera (`src/lib/plates/geometry.ts`); programs differ only by what happens on it (`src/lib/plates/specs.ts`). Youth: cross-court reps into a target zone. High Performance: serve to the T, then the next shot into the open corner. Adult Bootcamps: three flights from one spot, flatter and deeper as the level rises. Kids' Camp: cones, a slalom, hoops and a short rally, drawn dashed until it opens. Anything new starts as `plate: "court"`.
- **Grammar.** Exactly one lime signature trace per plate, travelling left to right; support traces white @0.70; ghost @0.28; echoes lime @0.30/0.55; a dashed ground shadow under every trace; a bounce mark r 0.24 m and, on the signature only, a target ring r 0.75 m; a kick after the bounce; a ground zone lime @0.10; dotted footwork; player markers as a ground ring, a hairline and a contact dot, never a figure. Coming soon = long-dashed traces and outline-only bounces.
- **Honest physics, tested.** Every flight clears the net cord by at least 0.3 m and bounces inside the doubles court, in every cohort variant (`npm test`, `test-plates.ts`). At most 4 traces, 1 zone and 2 markers.
- **Tokens** (`src/lib/plates/tokens.ts`): bg `#061427`, run-off `#081A30`, court `#0B2342`, lines white @0.55, net cord white @0.70, signature `#B4E655`. Lime and white only; **tier colours never appear in a plate**.
- **Frames**, all `preserveAspectRatio="xMidYMid slice"`: `master` (`0 0 1600 1000`, 16:10, detail page), `band` (`0 100 1600 800`, 2:1, cards), `strip` (`-100 215 1800 600`, 3:1, dashboard, admin and the OG card). Containers set an aspect ratio, never a fixed height: `relative overflow-hidden bg-[#061427]` + `aspect-[16/10]` / `aspect-[2/1]` / `aspect-[3/1]`; corners come from the container.
- **Stroke widths** are screen pixels with `vector-effect="non-scaling-stroke"`: `compact` (≤480px wide) court 1 / net 1.25 / signature 2 / support 1.5; `hero` (detail page) 1.25 / 1.5 / 2.75 / 1.75. The OG card uses `fixed` (hero × viewBox units per pixel, no vector-effect, because Satori ignores it).
- **Cohort variants** (`src/lib/plates/variant.ts`): the side of the court is hashed from the cohort id (`v` mirrors, `u` never); the cohort's level band profiles the signature flight; `artFocusForCohort` lights the Adult class the cohort trains in. Age is never encoded in the art.
- **Components:** `ProgramPlate` (the plate; decorative unless given a `label`, then `role="img"`), `PlateMark` (a 40–64px plan-view thumbnail, always decorative), `AgeBandChips` (age as a three-step glyph plus the exact `AGE_BAND_LABELS` text, neutral white).
- **Motion:** detail page only, once, `motion-safe:` only. Traces wipe left to right over 900ms (the signature 140ms behind), shadows fade in, bounce marks and the ring pop; keyframes `plate-wipe`, `plate-pop` and `plate-fade` live in `tailwind.config.js` and fill backwards, so the finished plate is static. Cards get only the hover emphasis (signature +0.5px, ring to full), never a scale.
- **Sign-off gallery:** `/admin/art` (admin-gated, noindex) shows every plate in every frame, the coming-soon state, the Adult focus, the Youth profile, both sides, the marks and the age chips.

### No text or data baked into images

Art never carries data. No program name, number, tier span, price or date goes inside an image or a plate: level, age and price are rendered as HTML text and components *below* the art, so the words can change without the picture (audit H1). The Figma tiles with their titles baked in are deleted. A future owner photo (consented, real sessions only) lives in an "On court" strip on detail pages, never on a card, and never with text over it.

## Program cards (audit H7, design specs §5)

Every program listing is one component, `ProgramCard` (`src/components/sections/ProgramCard.tsx`), rendered through `ProgramCardList`: the home grid, /programs and the dashboard's "Suggested for you" never draw their own. A card is a **spec sheet**: the Court Plate on top (text-free, decorative), then calm labelled rows on hairlines.

- **Anatomy, top to bottom:** plate band (`aspect-[2/1]`, `band` frame) with the status chip in its top-right corner (`programStatus()`: "Next cohort Oct 18" lime, "Groups forming" / "Invite only" neutral, "Coming Soon" dashed; on an opaque disc of the plate's ground, `right-3 top-3`; the only overlay allowed) · the eyebrow on a line of its own (`programEyebrow()`: "Juniors and teens · Saturdays"), so three titles in a grid sit level · the title as an `h3` · a two-line description · a real `<dl>` with **Ages** (`AgeBandChips`), **When** (one line per class, `formatSlotWhen()` plus the slot qualifier), **Price** (`priceSummary`, from the constants, stacked: the session figure in white, the cohort total under it in white/60, no separator) and **Next** (the public cohort's schedule, only when one exists; its four parts wrap whole, each `whitespace-nowrap` in a flex-wrap line with the middot riding on the part before it, so a date range never splits and no line opens with "·") · the **Level** block (tier span in words, the min tier's 20px mark, the numeric band, a `TierLine rail sm` in span mode, the program's own `levelNote`), only when the span is set · the CTA line.
- **One link, one tab stop.** The title's `Link` is stretched over the card with `after:absolute after:inset-0`; the article is `relative` and nothing between the two is positioned (the art column is `relative` for its chip, but it is the body's sibling, never an ancestor of the link); the focus ring sits on the article (`has-[a:focus-visible]:ring-2`). The CTA line is `aria-hidden`, the plate is `aria-hidden`, and no other element in the card is interactive, so the card's accessible name is its title.
- **The plate is never stretched.** Side by side (`row` from md, `auto` from md to lg) the art column fills the row's height as a dark panel and centres a box that keeps the frame's own ratio (`md:aspect-[16/10]` for the `master` frame, `aspect-[2/1]` for the band). A spec sheet runs 580–680px tall; a plate sliced to that height showed a quarter of its width.
- **Nothing on hover.** Border white/10 → white/25, the plate's signature stroke +0.5px and ring to full, the arrow nudges 4px, all `motion-safe:`. No scale, no shadow, and no information appears on hover.
- **Slot qualifier** (the first rule that matches): the slot's level band as `TierRangeBadges` (Adult Bootcamps reads Love – Rally / Deuce / Break – Ace); else its age band as a neutral chip; else, with more than one class, the class label; else nothing.
- **Variants:** `compact` (stacked); `row` (/programs: art left, the `master` frame centred in its column, a two-column spec sheet right, `TierLine rail md labels="ends"`, from md); `auto` (home and dashboard: compact below md, row from md to lg, compact again in the lg three-column grid, so a tablet never shows a 2 + 1 orphan). A coming-soon program on /programs is a `ProgramComingSoonBand` (dashed border, thumbnail, one meta line, the span rail), not a card.
- **Dashboard fit:** `suggestProgramsFor()` (`src/lib/programCatalog.ts`) keeps programs that fit at least one player's age band and level; the card's eyebrow becomes "Fits Maya" / "Fits you", the rail carries a named marker, and the caption reads "Maya: Rally · 2.5".
- **Tokens:** card surface `rounded-2xl border border-white/10 bg-white/[0.03]`; eyebrow `text-xs font-semibold uppercase tracking-[0.12em] text-[#B4E655]`; spec label (`dt`) the same in `text-white/60`; spec value (`dd`) `text-sm text-white/90 tabular-nums`; hairline `border-t border-white/10`; chips as in the colour table. Never on a card: "Book Your Assessment", an exclamation mark, "experience", "journey", a second button, or a hover-only strip.
- **Pinned by `npm test`** (`test-program-catalog.ts`): the helpers, the fit rules against the recommender, one link per card, the Level block only with a span, and the surfaces.

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
