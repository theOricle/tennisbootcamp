# Plan — Enrollment & Accounts (end-to-end)

**Status:** Draft for execution by Claude Code
**Author:** Cowork planning session, 2026-05-22
**Owner:** Sina

This is the master spec for turning tennisbootcamp.ca from lead-capture into a full
enrollment product: intake-as-recommendation-engine → ranked program results →
enrollment → payment → consent → account → dashboard.

It is **phased**. Build one phase per PR, in order. Each phase must pass CI
(lint + typecheck) and must not break the intake pipeline. Do not start a later
phase before the earlier one is merged and verified.

---

## Non-negotiables (carry these through every phase)

1. **Never break `/api/intake`.** The 14-column Google Sheets contract
   (`timestamp, name, email, phone, who, level, goals, programs, area, notes,
   newsletter, priority_score, lead_type, follow_up_status`) and its scoring logic
   stay intact. You may only *add* fields, never remove or reorder existing columns.
   Test a real intake submission before calling any phase done.
2. **Brand voice:** welcoming, serious, athletic, premium — a world-class coach,
   not a salesperson, not a SaaS app. No glassmorphism-for-its-own-sake, no
   competing CTAs that dilute the primary path. (See `ops/briefs/brand.md`.)
3. **Colors:** background `#061427`, lime `#B4E655`, secondary green `#8CC63F`,
   text `rgba(255,255,255,0.92)`. Reuse the emerald/lime accent already used in
   `intake/page.tsx` and the detail page — do not introduce a new palette.
4. **Mobile first for new UI.** Sina works from his phone. Anything that relies on
   `:hover` must have a tap/expand equivalent on touch devices.
5. **Recommendation logic is rule-based, not an AI call.** Deterministic, instant,
   free, predictable. No LLM at runtime.

---

## Current state (verified 2026-05-22)

- **Intake** (`src/app/intake/page.tsx`): already a stepped wizard — pinned question,
  progress bar, Back/Next, step types `single | multi | text | contact`. Steps today:
  who → level → goals → programs → area → notes → contact. On submit it POSTs the whole
  form to `/api/intake` and shows a static "You're on the Priority Placement List"
  screen. **It does not recommend anything yet.**
- **Mismatch to fix:** the `programs` step offers `group, bootcamp, private, elite,
  junior, camp` and the `area` step offers `north-york, downtown,
  markham-richmondhill, flexible`. Neither maps to the 3 real programs
  (`bootcamps`, `kids-summer-camp`, `group-lessons`) or the 2 real venues
  (`balliol`, `king`). The recommendation engine depends on fixing this mapping.
- **Programs** (`src/content/programs.ts`, `src/types/program.ts`): 3 programs.
  `Program` has `slug, longDescription, schedule (free string), priceCents?,
  currency?, ageGroup?, locationId?` (single location). No "what's included"
  bullets, no structured dates/times/capacity.
- **Detail page** (`src/app/programs/[slug]/page.tsx`): renders image, badges,
  descriptions, one location, the free-text `schedule`, and a **hardcoded
  "Six-week cohort"** duration. Available → enroll CTA links to `program.ctaHref`
  (`/intake?program=...`). Coming-soon → `ProgramInterestForm` (email → Sheets).
- **Grid** (`src/components/sections/ProgramsGrid.tsx`): card grid, already has a
  `group` class (hover hooks exist) but reveals no schedule data on hover.
- **APIs:** `/api/intake` (14 cols), `/api/newsletter` (tab `newsletter`),
  `/api/program-interest` (tab `program_interest`, cols `timestamp,email,program`).
  All write to Google Sheets via a service-account JWT.
- **Planned but not started (per CLAUDE.md):** Stripe + PayPal, Auth.js v5 + Neon
  Postgres + Prisma, dashboard, transactional email.

---

## Target user flows

**Matched path (primary):**
Home → "Find My Program" → intake wizard (who, age, level, goals, availability,
preferred location) → **results screen**: ranked program cards, grouped by location,
preferred location on top, each with its next cohort + a "why this fits" line →
Enroll → registration + consent → pay → confirmation email → set credentials →
dashboard.

**Browse path (secondary):**
Home → "Browse Programs" → `/programs` → pick a program → detail page shows
**"What's included" green bullets** + cohort cards (dates, days/times, capacity,
price) grouped by location → pick a cohort → same Enroll → pay → … → dashboard.

Decision locked this session: **program-first** for the browse path (the program is
the meaningful choice; there are only two Toronto venues).

---

## Data model (Phase 0 — foundation, build first)

Everything downstream depends on a **cohort** model. A program is the offering
("Bootcamps"); a cohort is a specific runnable block: program × location × date range
× weekly sessions × capacity × price.

### New type: `src/types/cohort.ts`

```ts
export type SessionSlot = {
  day: "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
  start: string; // "17:00"
  end: string;   // "18:00"
};

export type CohortStatus = "open" | "waitlist" | "full" | "upcoming";

export type Cohort = {
  id: string;            // e.g. "bootcamps-balliol-2026-summer"
  programId: string;     // FK → Program.id
  locationId: string;    // FK → Location.id
  label: string;         // "Summer Cohort"
  startDate: string;     // ISO "2026-06-07"
  endDate: string;       // ISO "2026-07-12"
  weeks: number;         // 6
  sessions: SessionSlot[];
  capacityMin: number;   // 6
  capacityMax: number;   // 8
  priceCents: number;    // PLACEHOLDER until real prices set — see "Owner inputs"
  currency: "CAD";
  status: CohortStatus;
};
```

### Extend `src/types/program.ts`

Add (additive only):

```ts
includes?: string[];   // green "what's included" bullets
```

Keep `schedule`, `priceCents`, `locationId` for backward compatibility, but cohorts
become the source of truth for dates/times/capacity/price. `locationId` on Program
is now just a default hint; programs may run at multiple locations via cohorts.

### New content file: `src/content/cohorts.ts`

Use **placeholder dates** modeled on the Figma prototype (real data comes later — see
"Owner inputs"). Seed one cohort per available program per location. Example:

```ts
import type { Cohort } from "@/types/cohort";

export const cohorts: Cohort[] = [
  {
    id: "bootcamps-balliol-summer-2026",
    programId: "bootcamps",
    locationId: "balliol",
    label: "Summer Cohort",
    startDate: "2026-06-07",
    endDate: "2026-07-12",
    weeks: 6,
    sessions: [
      { day: "Wed", start: "17:00", end: "18:00" },
      { day: "Fri", start: "17:00", end: "18:00" },
    ],
    capacityMin: 6,
    capacityMax: 8,
    priceCents: 0, // PLACEHOLDER
    currency: "CAD",
    status: "open",
  },
  // + bootcamps-king-summer-2026, and upcoming cohorts for the two
  //   coming-soon programs (status: "upcoming") so cards have data to show.
];
```

Add a helper `src/lib/cohorts.ts`:
- `cohortsForProgram(programId): Cohort[]`
- `nextCohortForProgram(programId): Cohort | undefined` (earliest `open`/`upcoming` by startDate)
- `formatCohortSchedule(c): string` → e.g. `"6-week program · Jun 7 – Jul 12 · Wed & Fri 5–6pm · 6–8 players"`

### "What's included" bullets to seed into `programs.ts` (`includes`)

Coach-voice, lime-rendered on the detail page:

- **Bootcamps:** Live-ball pattern play (cross-court, inside-out, serve+1) ·
  Explosive first-step & change-of-direction footwork · Second-serve reliability
  under pressure · Point construction & shot tolerance · Match-play simulation with
  score pressure · Dedicated strength & conditioning block · Benchmarked progress
  each cohort
- **Kid's Summer Camp:** Stroke fundamentals (forehand, backhand, serve, volley) ·
  Physical-literacy & agility games · Daily match play grouped by ability · Hand-eye
  & movement drills · Teamwork challenges and on-court games · Daily skill tracking ·
  Lunch & snacks included
- **Group Lessons:** Capped at 6 per court — more reps, less standing around ·
  Structured progressions across every stroke · Live-ball rally tolerance · Tactical
  patterns (serve / return / approach / net) · Real-time correction every session

**Phase 0 acceptance:** types compile, content files load, helpers unit-tested with a
tiny script; no UI or API change yet; intake untouched.

---

## Phase 1 — Program detail bullets + cohort cards + grid hover

Frontend only. No backend, no env, no risk to intake.

1. **Detail page** (`programs/[slug]/page.tsx`): add a **"What's included"** section
   that renders `program.includes` as a checkmark/dot list in lime `#B4E655`. Replace
   the hardcoded "Six-week cohort" + single `schedule` block with **cohort cards**
   driven by `cohortsForProgram(program.id)`, grouped by location. Each card shows:
   date range, days + times, weeks, capacity range, price (or "Pricing TBA" if
   `priceCents === 0`), and an **Enroll** button → `/enroll/[cohortId]` (Phase 4).
   If no open cohorts, fall back to the existing coming-soon `ProgramInterestForm`.
2. **Grid card** (`ProgramsGrid.tsx`): on the existing `group` hover (desktop),
   reveal a compact strip from `nextCohortForProgram(p.id)` — `formatCohortSchedule`.
   On touch/mobile, render that same strip inline beneath the description (no hover).
   Use a `sm:` breakpoint pattern: inline on small screens, hover-reveal on `md+`.

**Phase 1 acceptance:** detail and grid render real cohort data; mobile shows
schedule without hover; lint + typecheck pass.

---

## Phase 2 — Intake becomes a recommendation engine

Extend the existing wizard; **keep `/api/intake` logging exactly as is** (still POST
the full form, still write all 14 columns, still compute priority_score/lead_type).
Add the recommendation as a *new* post-submit screen.

### 2a. Fix the intake question mapping

- **`programs` step:** keep it but make it *optional* (a soft signal, not the
  decision). Reframe options to the real catalog plus a "Not sure — recommend for me"
  choice. The engine recommends regardless of what they pick here.
- **`area` step → `location` step:** replace `north-york / downtown /
  markham-richmondhill / flexible` with the **two real venues** (`balliol` =
  "Toronto Tennis City · 185 Balliol St", `king` = "Tennis Lessons Toronto · 510
  King St E") plus "Either / flexible". Store as `preferredLocationIds: string[]`.
- **New `availability` step** (multi): weekday-evening / weekday-daytime /
  weekend-morning / weekend-afternoon. Used to rank cohorts whose `sessions` match.
- Map these new fields into the existing `/api/intake` body without breaking the
  column contract: fold `preferredLocationIds` into the existing `area` column
  (comma-joined) or append new trailing columns **after** `follow_up_status`
  (additive only). Prefer appending new columns: `preferred_locations`,
  `availability`, `recommended_program`. Update `HEADERS` in
  `src/app/api/intake/route.ts` accordingly (append only).

### 2b. Recommendation engine — `src/lib/recommend.ts`

Pure, deterministic, rule-based:

```ts
type Recommendation = {
  program: Program;
  score: number;       // 0–100 alignment
  reason: string;      // "Best fit for competitive juniors who want match reps"
  cohorts: Cohort[];   // ranked: preferred locations first, then by startDate
};
export function recommendPrograms(form: IntakeForm): Recommendation[];
```

Scoring rubric (tune later):
- **Age/who gate (hard filter):** child 7–13 → Kid's Summer Camp; 14+ competitive →
  Bootcamps; adult 18+ → Group Lessons. Age outside a program's `ageGroup` removes it.
- **Level:** `elite/competitive` boosts Bootcamps; `new/rally` boosts Group Lessons /
  Camp.
- **Goals:** `competition`/`tactics`/`match` boost Bootcamps; `technique`/
  `consistency` boost Group Lessons; youth fun/fundamentals boost Camp.
- **Programs step:** small boost to anything explicitly selected.
- **Availability + location:** does not change which programs rank, but orders the
  **cohorts** within each recommendation — cohorts at a preferred location and whose
  session days match availability float to the top.

### 2c. Results screen (replaces the static success screen)

After submit succeeds, show ranked recommendation cards (highest score first). Within
each card, cohorts grouped by location with **preferred location(s) on top**. Each
card carries the "why this fits" reason and an **Enroll** CTA → `/enroll/[cohortId]`.
Keep the priority-placement reassurance copy and the newsletter opt-in. If no program
passes the age gate (edge case), fall back to the current "priority list" screen.

**Phase 2 acceptance:** real intake submission still writes all original columns;
recommendations render and rank sensibly across a few test personas (kid, adult
beginner, competitive teen); intake still works with JS disabled paths gracefully.

---

## Phase 3 — Homepage two-CTA + browse polish

- **Hero CTAs:** primary **"Find My Program"** → `/intake` (carries the
  priority-placement promise in the intake intro, which it already does); secondary
  **"Browse Programs"** → `/programs`. This matches the existing brand CTA hierarchy
  (primary = intake, secondary = programs) — it's a rename + a second button, not a
  third competing CTA. **Decided 2026-05-22: the primary CTA is "Find My Program."**
  Priority placement stays communicated *inside* the intake flow (headings, subtitles,
  success copy), not on the button — this supersedes `brand.md`'s "Get Priority
  Placement" for the hero button only.
- **Browse path:** ensure `/programs` → detail → cohort selection is clean and
  program-first. No location picker up front.

**Phase 3 acceptance:** two CTAs, no dilution of the primary path; brand voice intact.

---

## Phase 4 — Enrollment + consent (no charge yet)

New route `src/app/enroll/[cohortId]/page.tsx`. Resolve the cohort from `cohorts.ts`;
404 if missing or `status === "full"`.

Steps (reuse the wizard styling):
1. **Order summary:** program, location, dates, days/times, price.
2. **Registrant details:** participant name + DOB. If DOB < 18 → require a
   **parent/guardian** name, email, phone (the guardian becomes the account holder).
3. **Consent & waiver:** an explicit **"I have read and agree to the Terms &
   Liability Waiver"** checkbox **plus a typed-name signature** field. Store
   `{ signedName, agreedAt (ISO), ipAddress, waiverVersion }`. For minors the
   guardian signs. Block "Continue to payment" until both are completed.
   - Waiver text lives in `src/content/legal/waiver.md` (placeholder until lawyer
     review — see Owner inputs). Link it from the checkbox.
4. Persist a **pending enrollment** (Phase 5 wires the real store; until then, POST to
   a new `/api/enroll` that logs to a Google Sheets tab `enrollments` mirroring the
   existing Sheets pattern, so the flow is testable without a database).

**Phase 4 acceptance:** can walk program → cohort → enroll → consent → "continue to
payment" placeholder; minor flow forces guardian; consent record captured.

---

## Phase 5 — Payment (Stripe Checkout, PayPal via Stripe)

**Needs env:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`. Decision already standing: **Stripe** (PayPal
enabled as a payment method inside the Stripe dashboard, not a separate integration).

1. `POST /api/checkout` → create a Stripe Checkout Session for the cohort
   (`priceCents`, `currency`, cohort metadata, success/cancel URLs). Redirect the
   client to the session URL.
2. `POST /api/webhooks/stripe` (raw body, signature-verified) → on
   `checkout.session.completed`: mark the enrollment paid, decrement the cohort's
   available seats, trigger the confirmation email (Phase 6 infra) with the
   **account-activation link**.
3. **Seat/capacity:** introduce a real seat count per cohort so a sold-out cohort
   flips to `waitlist`/`full`. (Until the DB exists in Phase 6, track seats in the
   `enrollments` sheet and compute remaining = capacityMax − paid rows.)
4. **Refund/cancellation policy** copy required before go-live (Owner input).

**Phase 5 acceptance:** test-mode Stripe checkout completes; webhook updates
enrollment; overbooking prevented; intake untouched.

---

## Phase 6 — Accounts, activation email, dashboard

**Needs env/infra:** Neon Postgres URL, Auth.js secret, Resend (or Postmark) API key.

Guest-checkout-then-activate flow (locked this session — lower friction):
1. **DB:** Neon Postgres + Prisma. Models: `User` (guardian/account holder),
   `Enrollment` (user → cohort, status, paidAt), `ConsentRecord` (signedName,
   agreedAt, ip, waiverVersion), `Payment` (stripe ids, amount). Migrate the
   `enrollments` sheet rows in if any real ones exist.
2. **Email (Resend):** on successful payment send a confirmation + an
   **activation magic link** to set username / password / real name. Templates in
   `src/emails/`.
3. **Auth.js v5:** credentials + the activation link. Protected `/dashboard`.
4. **Dashboard** (`src/app/dashboard/page.tsx`): the user's enrolled programs +
   cohorts, schedule, payment status, consent status. Read from Prisma.

**Phase 6 acceptance:** pay → receive activation email → set credentials → log in →
see enrollment in dashboard; protected routes enforce auth.

---

## Environment / infra by phase (so nothing blocks silently)

| Phase | New env / infra | Blocker? |
|------|------------------|----------|
| 0–3 | none | ships immediately |
| 4 | new Sheets tab `enrollments` (create manually) | low |
| 5 | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | yes |
| 6 | Neon Postgres URL, `AUTH_SECRET`, `RESEND_API_KEY` | yes |

Reminder: Vercel env vars for the existing Google Sheets pipeline are still pending
transfer from Sina's other machine (per CLAUDE.md) — that blocks *production* intake
and any Sheets-backed phase, though local dev with `.env.local` works.

---

## Owner inputs needed (placeholders until provided)

1. **Real cohort dates/times/capacity** per program per location (placeholders seeded).
2. **Real prices** (`priceCents`) — required before Phase 5 can take live payments.
3. **Waiver / Terms text** — lawyer-reviewed before Phase 4/5 go live. *(Not legal
   advice; get it reviewed by a professional.)*
4. **Refund / cancellation policy** copy — referenced in consent + checkout.
5. **Primary CTA label** — DECIDED 2026-05-22: "Find My Program." Priority placement
   is communicated on the intake screen, not on the button.
6. **Email sender domain** for Resend (e.g. `noreply@tennisbootcamp.ca`) + DNS records.

---

## Suggested PR sequence

1. `feat/cohort-data-model` (Phase 0)
2. `feat/program-detail-cohorts` (Phase 1)
3. `feat/intake-recommendations` (Phase 2)
4. `feat/home-two-cta` (Phase 3)
5. `feat/enrollment-consent` (Phase 4)
6. `feat/stripe-checkout` (Phase 5)
7. `feat/accounts-dashboard` (Phase 6)

Each PR: small, reviewed, CI-green, intake re-tested. Phases 0–4 carry no payment or
auth risk and can move fast; 5–6 wait on the env/infra above.
