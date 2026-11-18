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

## Tier tokens (audit H6, owner D1; five tiers, owner 2026-10-13)

The level system has one colour ramp, slate → light slate → lime → lime → gold, held as `Tier.color` in `src/lib/tiers.ts` and read everywhere else from there. Tier colours live only in graphics (emblems, pips, connectors, the RankCard's top rule); tier names are white text. Gold is a token used nowhere but tier graphics. `npm test` (`test-tiers.ts`) asserts every colour is at least 4.5:1 on the navy and on a card, that navy on gold is at least 4.5:1, and that the five are distinct. The stored level never moved: the first four tiers hold one whole level each, High Performance holds 5.0–7.0.

| id | Tier | Levels | `color` | Hue family |
|---|---|---|---|---|
| 1 | Beginner | 1.0–1.5 | `#7D8CA3` slate | chalk |
| 2 | Novice | 2.0–2.5 | `#AEBBCD` light slate | chalk |
| 3 | Intermediate | 3.0–3.5 | `#8CC63F` (lime secondary) | lime |
| 4 | Advanced | 4.0–4.5 | `#B4E655` (lime primary) | lime |
| 5 | High Performance | 5.0–7.0 | `#E3C46F` gold | gold |

- Unlit pip: `bg-white/[0.10]`. Future-state emblem ink: `#6A727D` (flat white/40 on navy). Field tints: lime `#1E312D`, gold `#E3C46F`. Graphics only, never text.
- Class literals live in `src/lib/tierStyle.ts` (`TIER_PIP`, `TIER_PIP_OUTLINE`, `TIER_RULE`, `TIER_FRAME`, `tierStyle()`); every class is a complete literal so the JIT keeps it, and the test checks each hex against `TIERS[id].color`.
- No-gold fallback (if D1 is ever reversed): High Performance takes a solid light-slate (`#AEBBCD`) field with a navy motif and gold appears nowhere.
- Retired slugs (`love` … `grand-slam`, `elite`, `pro`, `world-class`) redirect to their live tier's emblem PNG (`LEGACY_TIER_SLUGS`, `next.config.ts`).

### Emblem frames

The motif inside each emblem is the one its rung always carried (High Performance keeps the trophy with laurel, the top of the ladder); the **frame** escalates, so the rank reads without colour (every adjacent pair differs in at least one feature; pinned by the test).

| Tier | Outer ring | Studs | Inner ring | Corners | Bevel | Field | Motif ink |
|---|---|---|---|---|---|---|---|
| 1 Beginner | 2 | – | faint white .12 | plain hex | – | navy | tier colour |
| 2 Novice | 2.5 | ✓ | faint | plain | – | navy | tier colour |
| 3 Intermediate | 2.5 | ✓ | faint | plain | – | lime tint | tier colour |
| 4 Advanced | 2.5 | ✓ | 1.5 in tier colour | plain | – | lime tint | tier colour |
| 5 High Performance | 3 | – | navy hairline .35 | notched | 1.5 | solid gold | navy |

- States: `earned` (the table), `future` (all ink `#6A727D`, outer ring only), `provisional` (dashed ring in the tier colour, motif at .6), `ghost` (dashed grey hexagon, no motif).
- Sizes: 20px minimum. 20–27px is the **mark** (outer shape only, stroke 5, no motif) and always sits beside the tier name in text. Standard sizes: 20 (chips), 28/40 (compact ladder), 32–44 (ladder), 56 (quiz result), 64/80 (RankCard), 128 (email PNG). The 16px chip glyph is retired.
- One primitive per job: `TierEmblem` (one tier), `TierLine` (`rail` and `ladder`; `level`, `span`, or `tiers` for a program's set of group levels), `RankCard` (a player's rank), `TierChip` / `TierRangeBadges` (inline tier text for players and cohorts) and `LevelTag` (a group's one level, or "All levels"; `plain` drops the chip and keeps the 20px mark and the name, for the group card's top row and the levels strip). No surface draws its own tier UI, and the line is never a horizontal scroller.
- `LevelsStrip` (`src/components/sections/LevelsStrip.tsx`; owner, 2026-11-17) is the five levels as one slim strip, the same component under the home page's program cards and under the filters on `/programs`: "Five levels. Each group trains at one." (the count from `TIER_COUNT_WORD`), the five `LevelTag plain` tags low to high (wrapping on phones, one row joined by hairlines from md), and one link, "How levels work →", to `/assessment#ladder`. It replaced the larger home band and the legend card in the `/programs` header. The tags name tiers, never groups.
- The rail's five groups are sized by their pip count (two each, five for High Performance), so every half step is the same width; inside High Performance the position mode still steps 5.0 → 7.0, and the right-hand label reads "Top of the ladder · 7.0" until the player is there.
- Words banned in tier UI: "unlock", "level up", "rank up", "next level", "journey", "Requires {tier}". Programs say who they are for; tiers above a player read as future, never locked.
- Text in tier UI follows the floor: white/55 minimum, white/60 at `text-xs`, nothing below 12px.

## Spacing

- **One Container rule** (audit H2): `Container` (`src/components/layout/Container.tsx`) is `mx-auto w-full max-w-6xl px-6`, and it is the only thing that sets a page's horizontal padding and max-width. The header, the footer, a breadcrumb and the page content all use it, so they share one left edge.
  - Pages apply it. Section components (`ProgramsGrid`, `LevelsStrip`, `HowJoiningWorks`, `WhereAndWho`, `GoodToKnow`, `JoinClosing`, `EventsList`, `EmailCapture`, `ProgramInterestForm`) never set `px-*`, `mx-auto` or `max-w-*xl` on themselves, and a page never cancels a gutter with `-mx-6`.
  - Full-bleed bands (the hero, the home page's band of three points, a page's `tb-gradient` header band, the `/programs` band that the catalog draws) paint their background edge to edge and put a `Container` inside.
  - A narrower reading measure goes on the text block (`max-w-2xl`), never on the container.
- Vertical rhythm: `py-12 md:py-16` for a page's content block (`PageStack` = Container + that rhythm + `space-y-16 md:space-y-20` between sections). The home page's sections sit closer, 40px apart on phones and 72px from md (`space-y-10 md:space-y-[72px]`).
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
Primary (lime) — the main button, "Join a bootcamp", and an open group's own "Ask to join" (owner, 2026-11-18: "Join" only once payment sits behind it; on a program booked by arrangement, "Ask about lessons"). The quiz is never a lime button:
  min-h-[44px] rounded-full bg-[#B4E655] px-6 py-3 text-sm font-semibold text-[#061427]
  hover:brightness-110 transition          (the one primary hover, audit M12)

Secondary (outline) — Book Your Assessment, Browse Programs, a by-approval group's "Ask to join" and a full group's "Notify me", newsletter and notify submits:
  min-h-[44px] rounded-full border border-white/25 px-6 py-3 text-sm font-semibold text-white/80
  hover:border-white/45 hover:text-white transition

Ghost:
  text-sm font-semibold text-white/60 hover:text-white transition
```
CTA weights (brand.md; owner, 2026-11-16; the label "Join a bootcamp", owner 2026-11-17, read once from `JOIN_CTA_LABEL` in `src/lib/mainAction.ts`): "Join a bootcamp" is the lime primary on every public page, to `/programs`; on `/programs` the header's scrolls to the group list, and on a program page the panel's and the closing's scroll to the page's own. The quiz is its side line, a lime text link with its exact label: "Not sure which group? Take the 2-minute quiz". The two are one component, `MainAction` (with `QuizSideLine` for the line alone), in `src/components/ui/MainAction.tsx`; a signed-in account with quiz answers on file reads "Your quiz answers are in." and "Open your dashboard", and everyone signed out reads the new visitor's line, whatever their browser once sent (owner, 2026-11-18). "Book Your Assessment" and "Browse Programs" are outline secondaries; the newsletter is tertiary and never lime. On phones a sticky bottom bar (`MobileJoinBar`) carries the main button once the page's own has scrolled out, and never shows on `/programs` or below it; mark any in-page main button with `data-main-cta` so the bar hides while it is on screen. Pages not rebuilt yet (About, the assessment pages) keep their own buttons until they are.

### Icons
Small pictograms are inline SVG components in `src/components/ui/icons.tsx` (the map pin is `PinIcon` in `src/components/locations/LocationLine.tsx`, the one pin on the site): `stroke="currentColor"`, `aria-hidden`, `focusable="false"`, sized and coloured by class. The line weight is 2; the rotate, point-play and stairs icons take a `strokeWidth` (the home band draws its three at 1.8, the joining steps draw theirs at 1.7). Decoration only: an icon never carries meaning the words beside it do not. No icon font and no package; a shape taken from the Lucide set says so in a comment, with its ISC licence.

### Cards
Use `Card` / `CARD_CLASS` (`src/components/ui/Card.tsx`, audit L1). No shadows on cards.
```
Standard:
  rounded-2xl border border-white/10 bg-white/[0.03] p-6
  hover (when the whole card is a link): border-white/25

Primary (wizard chrome) — rounded-3xl, the one surface with that radius:
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

## Home page (owner, 2026-11-17)

Top to bottom, one idea a section:

- **Hero** (`Hero`): the tag "Group bootcamps · Toronto", the locked headline and paragraph, the main action, the player, the arrow. Its layers are unchanged (the particle wave, the glow, the scrim, the wordmark on computers). No price, no group size and no promise in the hero.
- **The three points** (`BootcampPoints`, words in `src/content/bootcamp.ts`; owner, 2026-11-17; the third, owner 2026-11-18): what a bootcamp is, in a thin full-bleed band with a hairline above and below (`border-y border-white/10`), straight under the hero and outside it. A real list of three, each a lime icon (`aria-hidden`; the two arrows, the court with a ball, a flight of five stairs, drawn at a 1.8 stroke on the same 24-unit grid, each 18 units wide with its ink centred on the box) and one phrase with a bold lead: "**Tennis and fitness** in every class", "**Point play** to finish every class", "**Five levels** to climb" (the count from `TIER_COUNT_WORD`). On a phone: three rows of one line each, the icon 24px, the lead white 600 and the rest `text-white/75` at 15px, 12px between rows, 18px above and below. From md: three equal columns with a hairline between them (`md:border-l`, 32px of padding after it), the icon 32px, the lead on its own line at 22px (20px between md and lg, so "Tennis and fitness" keeps clear of the hairline in the 240px columns of a 768px screen; tracking -0.02em) over the rest at 16px, 26px above and below; every phrase stays on one line. No heading (the section is named for assistive tech, "What a bootcamp is"), no price, no group size, no link and no button.
- **"Our Programs"** (`ProgramsGrid`): the heading, the three programs as compact cards straight under it (no line between: the site states no general class length or classes a week), and the five levels as a strip under them (`LevelsStrip`).
- **"How joining works"** (`HowJoiningWorks`): an ordered list of three steps, each an icon in a 44px lime-tint ring (`border-[#B4E655]/40 bg-[#B4E655]/[0.08]`), a hairline joining the rings (down the left on phones, across the top from md): "Pick a group", "Pay online" ("By e-transfer.", no amount), "Start on court". No link in it.
- **Where and who** (`WhereAndWho`): two columns from md on hairlines, no boxes. "Where we train" (pin): the club's name, its area, the map link. "Coaching" (person): the coach's name and title, "About us →".
- **Closing** (`JoinClosing`): "Groups are open to join." and the main action, side by side from md. No box, no fill.

The events section still renders only with a real event, before the closing. The newsletter is the line at the top of the footer.

**No price of any kind on the home page** (owner, 2026-11-17): not on the compact cards, not in the steps, not in the page's search line. `npm test` (`test-joining-flow.ts`) renders the page and fails on a dollar sign.

### The Tennis and Fitness graphic (About)

`BootcampClass` (words in `src/content/bootcamp.ts`): until 2026-11-17 the band under the home page's hero, now on About, inside "How a cohort works", under that section's paragraph and list, across the section's column. It stands in for the paragraph that said how a class runs. Two blocks side by side from md, stacked on phones, a decorative rotate glyph between them: Tennis, the lime block (`#B4E655`, navy words, navy tiles with lime glyphs: Technique, Footwork, Tactics, Focus), and Fitness, the court-navy block (`#0B2342`, a white/16 hairline, the lime tag "Built for tennis", lime tiles with navy glyphs: Power, Speed, Stamina, Mobility). Under the blocks, two lines with lime icons: "Rotate between the two all class", "Finish with point play". Real headings and lists; every word is text.

- It is part of a page section, not a band: no heading of its own (the names are `h3`s under the section's `h2`), no hairlines, no `Container`, and no group-size line (About states the size once, in its list).
- Its scale is the page's: the blocks are `rounded-2xl` like the page's cards; the two names are bold at 28px on phones and 32px from md, with no lg step (the one place a heading is bold), so they never out-shout the page title (30px, 36px from md); the tiles are 52px with 28px glyphs.
- Shown once on the page, and on no other page.

## Program cards and group cards (audit H7, design specs §5; owner 2026-10-12; the simpler site, owner 2026-11-17)

Every program listing is one component, `ProgramCard` (`src/components/sections/ProgramCard.tsx`), rendered through `ProgramCardList`, in two densities: the **spec sheet** (the dashboard's "Suggested for you": calm labelled rows on hairlines) and the **compact card** (the home page). Neither surface draws its own. Every group listing is `ProgramGroupCard` (`src/components/sections/ProgramGroupCard.tsx`): the program pages and the `/programs` catalog.

### Program card

- **Compact (home):** the photograph (`Program.photo`, its real alt; a 116px column on the left on phones, 16:10 on top from md), the title as an `h3`, one line of who and when derived from the groups (`programWhoWhenLine()`: "Ages 7–17 · Saturdays", "16 and up · Sundays", "Any age · By arrangement"), and the decorative line "See groups →" ("See details →" for a program with no fixed class). No price (owner, 2026-11-17: none on the home page, "Rates on request" included), no description, no rows, no levels block, no chip. Three across from md. The whole card is the title's one link, to the program's page.
- **Spec sheet anatomy, top to bottom:** the photograph (`Program.photo`, 16:10, `next/image`, its real alt) with the status chip in its top-right corner (`programStatus()`: "Next cohort Oct 18" lime, "Groups forming" / "Invite only" neutral; a program with no timetable shows no chip, its eyebrow and When row already reading "By arrangement"; on an opaque navy disc, `right-3 top-3`; the only overlay allowed) · the eyebrow on a line of its own (`programEyebrow()`: "Juniors and teens · Saturdays", "Any age · By arrangement"), so three titles in a grid sit level · the title as an `h3` · a two-line description · a real `<dl>` with **Ages** (`programAgeLabel()` from the groups: "7–17", "16 and up", "Any age"), **When** (one line per group, `formatGroupStart()` and the group's level-led name: "Sat 12:00 · Beginner Junior Bootcamp"; the schedule line for a program with no fixed class), **Price** (`priceSummary`, the whole price from the constants, stacked through `priceParts()`: the cohort total in white, "for six weeks" under it in white/60, no separator; never a per-session figure) and **Next** (the public cohort's schedule, only when one exists; its four parts wrap whole) · the **Levels** block (`LevelTags`: one `LevelTag` per distinct group level in ladder order, or "All levels"; the program's own `levelNote`; no span, band or rail) · the CTA line.
- **One link, one tab stop.** The title's `Link` is stretched over the card with `after:absolute after:inset-0`; the article is `relative` and nothing between the two is positioned (the photo column is `relative` for its chip, but it is the body's sibling, never an ancestor of the link); the focus ring sits on the article (`has-[a:focus-visible]:ring-2`). The CTA line is `aria-hidden`, and no other element in the card is interactive.
- **Spec sheet layout.** Stacked on phones; from md the card lies on its side (photo left in a `2fr/3fr` grid, `object-cover` filling the column), and at lg the three-column grid stacks it again, so a tablet never shows a 2 + 1 orphan.
- **Nothing on hover.** Border white/10 → white/25 and the arrow nudges 4px, `motion-safe:`. No scale, no zoom, no shadow, and no information appears on hover.
- **Dashboard fit:** `suggestProgramsFor()` (`src/lib/programCatalog.ts`) keeps programs that fit at least one player's age band and level; the card's eyebrow becomes "Fits Maya" / "Fits you" and the caption under the level tags reads "Maya: Novice · 2.5".
- **Levels block (owner, 2026-10-13):** the spec sheet shows one `LevelTag` per distinct group level in ladder order (`programLevelTags()`: Youth Bootcamps reads Beginner · Novice · High Performance; Private Lessons reads "All levels"), then the program's plain line. No span text, no band, no rail. The program page's "Levels in this program" names the same tags and lights them on the ladder (`TierLine tiers={…}`).

### Group card

- **Anatomy (owner, 2026-10-13: one level tag, level-led title; the short card, owner 2026-11-17):** top row, the one `LevelTag plain` on the left (the tier's 20px mark and name, or "All levels"; never a span, a band or a rail) and the status chip on the right · the group's level-led name as the title ("Beginner Junior Bootcamp", "High Performance Youth Bootcamp", "Intermediate Adult Bootcamp") · three plain lines, each with a 15px icon and no label: who (`groupWhoLabel()`: "Ages 7–10", "16 and up"), when (`groupWhenParts()`: "Saturdays 12:00–1:00 pm", plus "· starts Jan 16" only when a public cohort exists; the parts wrap whole), where (the club's name) · the foot on a hairline, pinned to the bottom so sibling cards line up: the price once, stacked (the whole price, owner 2026-11-17: the cohort total at 18px semibold in white over "for six weeks" at 13px in white/60, from the constants through `priceParts()`; never a per-session figure), and one button. No eyebrow, no labelled rows, no note, no Week 1 or Join row, no photo: the rules are said once on the page, under "Good to know".
- **Four states** (`groupStatus()` and `groupAction()`, `src/lib/programCatalog.ts`): **Open to join** (the neutral chip with a solid lime dot) and a lime "Ask to join" · **{n} spots left** (the warn chip; "1 spot left") and a lime "Ask to join" · **Full** (the neutral chip) and an outline "Notify me" · **By approval** (the neutral chip with a hollow white ring) and an outline "Ask to join". "Invite only" keeps its neutral chip and reads "Ask to join". A group with no fixed class shows no chip. Every group's button reads "Ask to join" until that group can take payment (owner, 2026-11-18: `ASK_TO_JOIN_LABEL`); "Join" returns with join-and-pay.
- **Seats:** "Full" and "{n} spots left" come from the seat count the enroll page uses (`src/lib/seatCount.ts`), read once per page render for the groups' next public cohorts (`src/lib/groupSeats.ts`), on `/programs` and the program pages. The count shows at `LOW_SEATS_THRESHOLD` (3) or fewer, the enroll page's own threshold. A group marked `full` reads Full whatever the count; a failed or missing read reads "Open to join", never an error. Display only.
- **One interactive element:** the button, a link named for its group for assistive tech ("Ask to join the Beginner Junior Bootcamp"), so seven cards on `/programs` are seven distinct actions. Until join-and-pay is built, "Ask to join" opens `/intake?program={slug}` at the quiz's first step (`TrackedLink`, source `programs-group`, `program-group` or `programs-closest`), which is how a spot is asked for today. The link keeps its own words for everyone, and only where it goes follows a signed-in account with quiz answers on file: to `/dashboard`, never to the quiz's already-taken panel (`quizAware="href"`, owner 2026-11-18). "Notify me" goes to the footer's newsletter line (`#notify`), or to the page's own form where the page has one. The article carries `id={group.id}` and `scroll-mt-24`, so `/programs/youth-programs#high-performance` lands on the card.
- **Layout:** one column on phones, three across from md. In the narrow three-across cards of a tablet (md to lg) the tag and the chip stack, and the button takes its own row under the price; from lg they sit side by side. The lime and the outline button share one height (46px).
- **A group with no fixed class** (private lessons) is one row, `ArrangedGroupRow`: its name, "By arrangement · Rates on request", and an outline "Ask about lessons" (the quiz for the program).
- **No photo on a group card;** the program's photograph identifies the program.

### The catalog (`/programs`)

- **Header band** (`tb-gradient`, drawn by `ProgramCatalog` so the filters sit inside it): the `h1` "Our Programs" and one lead ("Every group is a bootcamp: tennis and fitness in every class, in six-week cohorts. Pick your group and join.", the cohort length from the constant; no class length and no classes a week), both passed in by the page. No lime button in the band: the main button is the header's, and each group has its own.
- **Three labelled dropdowns** in one row from md (the location on a row of its own on phones): **Location** first (owner, 2026-10-12: "People need to choose location first"; the locations in `src/content/locations.ts`, "Newtonbrook Tennis Club · North York"; one today, the only option and already chosen; a second adds "All locations"), **Player's age** (Any age · the three bands · the exact ages 7–17) and **Level** (Any level · the five tier names, no number bands). Under them the five levels as a strip (`LevelsStrip`), then the quiz side line. The rules are pure in `src/lib/programFilters.ts`: an age range matches a group when the ranges overlap; a tier matches a group's one level tag exactly (a group built for any level takes every tier).
- `ProgramCatalog` (`src/components/sections/ProgramCatalog.tsx`, client) lists every group at the chosen location under its program's heading row: the program's title as an `h2` that links to its page, and one derived line (`programHeadingLine()`: "Saturdays · ages 7–17", "Sundays · 16 and up", "Any age · any level"). Then its groups as cards, or the one row for private lessons. No photo and no description in the list; both stay on the program's page. The groups sit under the `groups` anchor the main button scrolls to.
- **Closest fit:** for every program whose groups fit the age and location but none of which carries the chosen level, its nearest-level groups follow (`closestGroups()`, decided per program, so a 16-and-up adult group that matches a teen exactly never hides the youth program's nearest group) with one honest line ("The nearest levels to {Level} for {age}.", then week-one placement and the move-or-refund promise), so a filter is never a dead end. A program's reach is capped at the shortest distance any tagged group in the list has to the level (one tier when something matches exactly), so a 16- or 17-year-old filtering at Beginner, whose only youth group is High Performance four tiers up, sees the exact adult match and no Closest fit at all.
- The filter lives in the URL (`?age=14&level=intermediate`, keys in that order; `?location=` is left out while it is the only, preselected one) so a list can be shared and the quiz result links to one (`quizCatalogHref()`). The selects read it through `useSearchParams` inside a Suspense boundary whose fallback is the unfiltered catalog (so the static page and a crawler see every group) and write it with `window.history.replaceState`, so a change never fetches.
- A results line (`role="status"`, `aria-live="polite"`, visually hidden: "7 groups", "3 groups for age 14 at Intermediate") announces each change to a screen reader. A section with no matching group disappears; private lessons, which takes every age and level, stays. When no group with a fixed class matches and none is near, a dashed box says what is true and what happens next: "No group matches that age and level." then the quiz link and "our coaches place you.", and one "Clear filters" text button (it keeps the location).
- **Good to know** (`GoodToKnow`, `src/components/sections/GoodToKnow.tsx`) follows the groups, and follows the groups on every program page with fixed classes: the `h2` on the left and the list on the right from md (`1fr / 1.7fr`), four rows on hairlines, each with a 22px lime icon, an `h3`, one short paragraph and, where it has one, a lime text link: "Week one, on court" (the right-group promise) · "The High Performance Youth Bootcamp is by approval" (only where that group is listed; the group named in full, never the tier) · "Want certainty first?" (the $20 mechanic, "Book Your Assessment →") · "Cancellations and make-ups" ("Program Policies →"). Two links, both text links.
- **Tokens:** card surface `rounded-2xl border border-white/10 bg-white/[0.03]`; eyebrow `text-xs font-semibold uppercase tracking-[0.12em] text-[#B4E655]`; spec label (`dt`) the same in `text-white/60`; spec value (`dd`) `text-sm text-white/90 tabular-nums`; hairline `border-t border-white/10`; selects `min-h-[44px] rounded-full border border-white/35 bg-[#061427]` with the focus ring; chips as in the colour table. Never on a card: "Book Your Assessment", an exclamation mark, "experience", "journey", a second button, or a hover-only strip.
- **Pinned by `npm test`** (`test-program-catalog.ts`, `test-program-groups.ts`, `test-five-levels.ts`, `test-joining-flow.ts`): the lineup, the helpers, the filter rules and URL (exact tag match, Closest fit), one interactive element per card and its four states, the seat rules, the level tags, the quiz's group lines, the redirects and the photographs.

### Footer

`Footer` (`src/components/layout/Footer.tsx`; owner, 2026-11-17). On top, the one newsletter line every page shares: "Be first to know when a new cohort opens.", the email field and the outline "Notify me" button on one row (`EmailCapture variant="line"`, its own `source`, the same bot check), with the id `notify` for a "Notify me" button to point at. Never two newsletter forms on one page: a page that renders its own (`EmailCapture`'s band, marked `data-page-newsletter`: a program with no public cohort, Events, Video Lessons) hides the line through a `:has()` variant. Then the columns: the logo and tagline · Site (Programs, Locations, About, Assessment) · Policies · Contact. Then the copyright and the credit line. Every row is a 44px target. The header carries Programs and About only; Locations and Assessment live here.

## Locations (owner, 2026-10-12)

The club is data (`src/content/locations.ts`: id, name, area, and a Google Maps search link; no street address, hours or court counts) and every group names it (`ProgramGroup.locationId`). One set of pieces in `src/components/locations/`, never redrawn per page:

- `LocationLine`: the pin (lime, 16px), the name in white semibold, " · " and the area in white/70, and on pages the inline "Open in Google Maps ↗" link (program page hero). `LocationBlock`: the same stacked for a narrow column, the map link a standalone 44px link (dashboard "Where we train"). `MapLink`: the link itself, `target="_blank" rel="noopener noreferrer"`, its accessible name naming the club and the new tab.
- On `/programs` the location is the first of the catalog's three dropdowns (above). On the home page it is the "Where we train" column of `WhereAndWho` (the pin, the club's name, its area, the map link), on hairlines with no box.
- `/locations` ("Our Locations", linked from the footer): a header band, then one card per club in a `5fr/7fr` grid (the club, the map link and a secondary "Browse Programs"; then "What runs here", each program a link with its groups and times on hairlines), the neutral club-membership line, and the closing (`JoinClosing`).
- The enroll summary opens with a **Location** box (label, name, area, map link) above the plate, the neutral club-membership line (`membershipNote()`) under it; the confirmation's detail list starts with Location.
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
