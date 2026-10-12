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

## Program photography (owner, 2026-10-12)

Program cards and the program page hero show **people playing**, not court diagrams (owner, 2026-10-12; supersedes D13 on those surfaces). One photograph per program, held as `Program.photo` (`src`, `width`, `height`, `alt`) in `src/content/programs.ts`.

- **Source.** Free-licence stock for now (Unsplash License only, never an Unsplash+ or premium result), swapped for Sina's own consented session photos later. `public/images/programs/CREDITS.md` names the photographer and the photo page of every file; `npm test` (`test-program-groups.ts`) fails on a file that is missing from it.
- **Subject.** Matched to the audience: young players for Youth Bootcamps, adults for Adult Bootcamps, a coach with a player for Private Lessons. No logos, venue signage or identifiable brands. Nobody in a photo is presented as our student or coach, and the site never says they are.
- **File.** A 16:10 crop, at most 1600px wide and 250 KB, WebP, made with `sharp` from `node_modules`. Served through `next/image` with `sizes` set (`PHOTO_SIZES` on the card; `(min-width: 768px) 38vw, 100vw` on the hero, with `priority`).
- **Alt text.** A real description of the scene ("A young player in a cap steps into a forehand on an outdoor hard court."), never the program name and never "photo of". The card keeps it (the photo is content, not decoration); the stretched title link stays the card's one link.
- **Over the photo:** only the status chip, on an opaque navy disc in the top-right corner. No gradient scrim, no title, no scale on hover.
- **Group cards carry no photo.** The program's photograph identifies the program; a group is the decision data under it.

## Court Plates (program art)

The **Court Plates** (owner D13, 2026-10-09; audit H1) are the site's secondary program art since 2026-10-12: one court diagram per program, drawn in code as inline SVG from `src/lib/plates/`, on the dashboard's enrollment strip, the enroll summary, the admin marks and previews, and the OG card. Cards and the program page hero show photographs (above). No text in a plate, never a person or a venue; sharp at any DPR, about 6–10 KB, deterministic, and no image request.

- **One court, one camera.** Every plate draws the same court from the same fixed broadcast camera (`src/lib/plates/geometry.ts`); programs differ only by what happens on it (`src/lib/plates/specs.ts`). Youth: cross-court reps into a target zone. Adult Bootcamps: three flights from one spot, flatter and deeper as the level rises. The High Performance and Kids' Camp plates stay in the registry (the retired High Performance entry still points at its plate for old cohort rows). Anything new starts as `plate: "court"`.
- **Grammar.** Exactly one lime signature trace per plate, travelling left to right; support traces white @0.70; ghost @0.28; echoes lime @0.30/0.55; a dashed ground shadow under every trace; a bounce mark r 0.24 m and, on the signature only, a target ring r 0.75 m; a kick after the bounce; a ground zone lime @0.10; dotted footwork; player markers as a ground ring, a hairline and a contact dot, never a figure. Coming soon = long-dashed traces and outline-only bounces.
- **Honest physics, tested.** Every flight clears the net cord by at least 0.3 m and bounces inside the doubles court, in every cohort variant (`npm test`, `test-plates.ts`). At most 4 traces, 1 zone and 2 markers.
- **Tokens** (`src/lib/plates/tokens.ts`): bg `#061427`, run-off `#081A30`, court `#0B2342`, lines white @0.55, net cord white @0.70, signature `#B4E655`. Lime and white only; **tier colours never appear in a plate**.
- **Frames**, all `preserveAspectRatio="xMidYMid slice"`: `master` (`0 0 1600 1000`, 16:10, the admin gallery), `band` (`0 100 1600 800`, 2:1, the admin gallery), `strip` (`-100 215 1800 600`, 3:1, dashboard, enroll summary, admin and the OG card). Containers set an aspect ratio, never a fixed height: `relative overflow-hidden bg-[#061427]` + `aspect-[16/10]` / `aspect-[2/1]` / `aspect-[3/1]`; corners come from the container.
- **Stroke widths** are screen pixels with `vector-effect="non-scaling-stroke"`: `compact` (≤480px wide) court 1 / net 1.25 / signature 2 / support 1.5; `hero` (detail page) 1.25 / 1.5 / 2.75 / 1.75. The OG card uses `fixed` (hero × viewBox units per pixel, no vector-effect, because Satori ignores it).
- **Cohort variants** (`src/lib/plates/variant.ts`): the side of the court is hashed from the cohort id (`v` mirrors, `u` never); the cohort's level band profiles the signature flight; `artFocusForCohort` lights the Adult class the cohort trains in. Age is never encoded in the art.
- **Components:** `ProgramPlate` (the plate; decorative unless given a `label`, then `role="img"`), `PlateMark` (a 40–64px plan-view thumbnail, always decorative), `AgeBandChips` (age as a three-step glyph plus the exact `AGE_BAND_LABELS` text, neutral white).
- **Motion:** the one-shot reveal (`animate`) is kept for any surface that shows a plate as its hero, `motion-safe:` only. Traces wipe left to right over 900ms (the signature 140ms behind), shadows fade in, bounce marks and the ring pop; keyframes `plate-wipe`, `plate-pop` and `plate-fade` live in `tailwind.config.js` and fill backwards, so the finished plate is static. No surface scales a plate.
- **Sign-off gallery:** `/admin/art` (admin-gated, noindex) shows every plate in every frame, the coming-soon state, the Adult focus, the Youth profile, both sides, the marks and the age chips.

### No text or data baked into images

Art never carries data. No program name, number, tier span, price or date goes inside an image or a plate: level, age and price are rendered as HTML text and components *below* the art, so the words can change without the picture (audit H1). The Figma tiles with their titles baked in are deleted. A future owner photo (consented, real sessions only) lives in an "On court" strip on detail pages, never on a card, and never with text over it.

## Program cards and group cards (audit H7, design specs §5; owner 2026-10-12)

Every program listing is one component, `ProgramCard` (`src/components/sections/ProgramCard.tsx`), rendered through `ProgramCardList`: the home grid and the dashboard's "Suggested for you" never draw their own. Every group listing is `ProgramGroupCard` (`src/components/sections/ProgramGroupCard.tsx`): the program pages and the `/programs` catalog. Both are **spec sheets**: calm labelled rows on hairlines, the Level block on the rail, one link.

### Program card

- **Anatomy, top to bottom:** the photograph (`Program.photo`, 16:10, `next/image`, its real alt) with the status chip in its top-right corner (`programStatus()`: "Next cohort Oct 18" lime, "Groups forming" / "Invite only" neutral; a program with no timetable shows no chip, its eyebrow and When row already reading "By arrangement"; on an opaque navy disc, `right-3 top-3`; the only overlay allowed) · the eyebrow on a line of its own (`programEyebrow()`: "Juniors and teens · Saturdays", "Any age · By arrangement"), so three titles in a grid sit level · the title as an `h3` · a two-line description · a real `<dl>` with **Ages** (`programAgeLabel()` from the groups: "7–17", "16 and up", "Any age"), **When** (one line per group, `formatGroupStart()` and the group's name: "Sat 12:00 · Ages 7–10"; the schedule line for a program with no fixed class), **Price** (`priceSummary`, from the constants, stacked: the session figure in white, the cohort total under it in white/60, no separator) and **Next** (the public cohort's schedule, only when one exists; its four parts wrap whole) · the **Level** block (`LevelBlock`: tier span in words, the min tier's 20px mark, the numeric band, a `TierLine rail sm` in span mode, the program's own `levelNote`) · the CTA line.
- **One link, one tab stop.** The title's `Link` is stretched over the card with `after:absolute after:inset-0`; the article is `relative` and nothing between the two is positioned (the photo column is `relative` for its chip, but it is the body's sibling, never an ancestor of the link); the focus ring sits on the article (`has-[a:focus-visible]:ring-2`). The CTA line is `aria-hidden`, and no other element in the card is interactive.
- **Layout.** Stacked on phones; from md the card lies on its side (photo left in a `2fr/3fr` grid, `object-cover` filling the column), and at lg the three-column grid stacks it again, so a tablet never shows a 2 + 1 orphan.
- **Nothing on hover.** Border white/10 → white/25 and the arrow nudges 4px, `motion-safe:`. No scale, no zoom, no shadow, and no information appears on hover.
- **Dashboard fit:** `suggestProgramsFor()` (`src/lib/programCatalog.ts`) keeps programs that fit at least one player's age band and level; the card's eyebrow becomes "Fits Maya" / "Fits you", the rail carries a named marker, and the caption reads "Maya: Novice · 2.5".

### Group card

- **Anatomy:** the eyebrow (the day — "Saturdays" — or "Program · Saturdays" on `/programs` with `showProgram`) and the status chip (`groupStatus()`: "By approval" for a by-approval group (High Performance) whatever its dates, a hollow white ring; else next cohort, "Full", "Invite only", or "Open to join" with a solid lime dot; none for an arranged group) · the group's name as the title ("Ages 7–10", "High Performance", "Newer players") · a `<dl>` with **Ages** (`groupAgeLabel()`: "7–10", "16 and up", "Any age"), **Time** (`formatGroupWhen()`: "Saturdays 12:00–1:00 pm", "By arrangement"), **Where** (the club's name, its area under it in white/60; no map link, so the card keeps one link; owner 2026-10-12), **Price** (stacked, as the program card) and **Next** · the Level block with the group's band on the rail · its `note`, when it has one (the High Performance group's competitive line) · the card's foot, pinned to the bottom so sibling cards line up: a hairline `<dl>` with **Join** (by-approval groups only, `APPROVAL_LINE`) and **Week 1** (every group with a fixed class, `RIGHT_GROUP_PROMISE_SHORT`; joining flow, owner 2026-10-12), then the CTA. Private lessons carry neither row.
- **One link, one tab stop:** the CTA line *is* the link, `/intake?program={slug}` (`TrackedLink`, source `programs-group` or `program-group`), reading "Take the 2-minute quiz, for the Ages 7–10 group" to assistive tech, so seven cards on `/programs` are seven distinct actions. The article carries `id={group.id}` and `scroll-mt-24`, so `/programs/youth-programs#high-performance` lands on the card.
- **No photo on a group card;** the program's photograph identifies the program.

### The catalog (`/programs`)

- **Where do you want to train?** (`LocationChoice`, `src/components/locations/LocationChoice.tsx`; owner 2026-10-12: "People need to choose location first") opens the content, directly under the header: an `h2`, one line, and a card per location as a native radio (a ring that fills lime with a navy centre when chosen; the card turns `border-[#B4E655]/50 bg-[#B4E655]/[0.06]` through `has-[:checked]`): the pin and the club's name, the area, what runs there, and under a hairline the "Open in Google Maps ↗" link, outside the label so a tap on it never changes the choice. While there is one location it is preselected and the line says why. The choice is `?location=` in the same URL the filters use (left out while it is the only, preselected one), so the catalog shows the groups at the chosen club and **Clear filters** keeps it.
- **How joining works** (`HowJoiningWorks`, `src/components/sections/HowJoiningWorks.tsx`; joining flow, owner 2026-10-12) follows the location choice, above the filters, and sits between the hero and the groups on each program page with fixed classes: a standard card with an `h2`, a real `<ol role="list">` of three steps (lime numerals `01`–`03`, `aria-hidden`; an `h3` and one short paragraph each; three columns from md, numeral beside the text on phones), then a hairline foot with the High Performance line (where that group is listed) and the optional assessment ("Want certainty first?", the $20 mechanic, a lime "Book Your Assessment →" text link). Two links, both inline or text links: the lime quiz button stays the header's.
- `ProgramCatalog` (`src/components/sections/ProgramCatalog.tsx`, client) lists every group under a program header (a 96px photo thumbnail, the eyebrow, the title as a link to the program page, the description), with two labelled selects — **Player's age** (Any age · the three bands · the exact ages 7–17) and **Level** (Any level · the seven tiers with their bands) — and a **Clear filters** button. The rules are pure in `src/lib/programFilters.ts`: an age range matches a group when the ranges overlap; a tier matches when it sits inside the group's band.
- The filter lives in the URL (`?age=14&level=intermediate`, keys in that order) so a list can be shared and the quiz result links to one (`quizCatalogHref()`). The selects read it through `useSearchParams` inside a Suspense boundary whose fallback is the unfiltered catalog (so the static page and a crawler see every group) and write it with `window.history.replaceState`, so a change never fetches.
- A results line (`role="status"`, `aria-live="polite"`: "7 groups", "3 groups for age 14 at Intermediate") announces each change. A section with no matching group disappears; when nothing matches, a dashed empty state says what is true and what happens next (the quiz, or Clear filters).
- **Tokens:** card surface `rounded-2xl border border-white/10 bg-white/[0.03]`; eyebrow `text-xs font-semibold uppercase tracking-[0.12em] text-[#B4E655]`; spec label (`dt`) the same in `text-white/60`; spec value (`dd`) `text-sm text-white/90 tabular-nums`; hairline `border-t border-white/10`; selects `min-h-[44px] rounded-full border border-white/35 bg-[#061427]` with the focus ring; chips as in the colour table. Never on a card: "Book Your Assessment", an exclamation mark, "experience", "journey", a second button, or a hover-only strip.
- **Pinned by `npm test`** (`test-program-catalog.ts`, `test-program-groups.ts`): the lineup, the helpers, the filter rules and URL, one link per card, the Level block, the quiz's group lines, the redirects and the photographs.

## Locations (owner, 2026-10-12)

The club is data (`src/content/locations.ts`: id, name, area, and a Google Maps search link; no street address, hours or court counts) and every group names it (`ProgramGroup.locationId`). One set of pieces in `src/components/locations/`, never redrawn per page:

- `LocationLine`: the pin (lime, 16px), the name in white semibold, " · " and the area in white/70, and on pages the inline "Open in Google Maps ↗" link (program page hero). `LocationBlock`: the same stacked for a narrow column, the map link a standalone 44px link (dashboard "Where we train"). `MapLink`: the link itself, `target="_blank" rel="noopener noreferrer"`, its accessible name naming the club and the new tab.
- `LocationChoice`: the `/programs` chooser (above). `LocationSection`: the home page's "Our location", a standard card with the pin in a 44px lime-tint disc, the name (`h3`), the area, the one honest line, and the map link on the right from md.
- `/locations` ("Our Locations"): a header band, then one card per club in a `5fr/7fr` grid (the club, the map link, the honest line and a secondary "Browse Programs"; then "What runs here", each program a link with its groups and times on hairlines), the neutral club-membership line, and the quiz band.
- The enroll summary opens with a **Location** box (label, name, area, map link) above the plate; the confirmation's detail list starts with Location.
- Structured data: a `Place` (name, and a `PostalAddress` of locality, province and country only) in the Organization's `areaServed` and on each `CourseInstance` (`placeJsonLd()`, `src/lib/structuredData.ts`).

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
