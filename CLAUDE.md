# CLAUDE.md — Tennis Bootcamp Project Context

Standing brief for the tennisbootcamp.ca project. Any Claude session (Cowork or Claude Code) should start by reading this.

**Before doing anything else, also read** `.claude/memory/DECISIONS.md`, `.claude/memory/PROGRESS.md`, `.claude/memory/OPEN_QUESTIONS.md`, `ops/briefs/brand.md`, `ops/briefs/project.md`, `ops/briefs/competitors.md`, and `ops/briefs/design-system.md`. They contain settled decisions, current progress, open questions, brand voice, project goals, competitive context, and design tokens that this CLAUDE.md alone does not capture. Cowork does not auto-load them — you must read them explicitly.

**Active build plan:** `ops/plans/assessment-restructure.md` — assessment-first pivot (2026-07-18); execute phase by phase, one PR per phase. The `/api/intake` column contract is non-negotiable; all changes must be additive. (Previous plan `ops/plans/enrollment-and-accounts.md` fully shipped 2026-06-07.)

Last updated: 2026-07-18

---

## Project snapshot

- **Product:** tennisbootcamp.ca — a premium tennis training site. Primary conversion (2026-07-18 pivot): the $20 on-court assessment booking; intake feeds the assessment, and paid programs are admin-built private cohorts matched by level + availability.
- **Repo:** https://github.com/theOricle/tennisbootcamp (public)
- **Owner:** Sina (sina2666@gmail.com). Works with the Claude + AI stack end-to-end across design, code, ads, and ops.
- **Workflow preference:** Automate everything possible. Claude Code in the terminal is the main engineering tool; Cowork is used for planning, docs, and non-code work.

## Current state (locked decisions)

These are settled — do not re-open without explicit owner instruction.

- **Auth:** Supabase Auth (NOT Auth.js — pivoted from original plan)
- **Primary CTA label:** "Book Your Assessment" (2026-07-18 pivot; code still shows "Find My Program" until restructure Phase 2 ships)
- **Pricing (CAD):** Bootcamps $649 · Kids Camp $499/week · Group Lessons $599
- **Refund policy:** 7-day full refund window; 50% refund or full credit for 3–6 days; $25 admin fee
- **Sending domain:** `send.tennisbootcamp.ca` (Resend-verified, GoDaddy DNS records set)
- **Sender FROM:** `Tennis Bootcamp <noreply@send.tennisbootcamp.ca>`
- **Email accounts:** `info@tennisbootcamp.ca` for business APIs (Stripe, Resend, MailerLite, GA4); `sina2666@gmail.com` for dev accounts (Supabase, Vercel, GitHub)
- **Preview mode:** `NEXT_PUBLIC_PREVIEW_MODE=true` must be set in Vercel until real launch — shows preview banner site-wide via `PreviewBanner` component in root layout
- **Assessment product (2026-07-18):** 20-minute on-court assessment · $20 CAD · auto-credited to first program · self-serve slots; the coach-assigned level is the placement source of truth
- **Group model (2026-07-18):** admin-created private cohorts (Supabase-backed) matched by level + availability grids; email invites with 48h hold; minimum-to-run; cancelled sessions become make-ups appended after the final week (cap 2 weeks, then credit)
- **Club membership (2026-07-18):** venue is a government-owned non-profit community club — $100/season (to ~November), paid by players directly to the club, never through our Stripe; assessment guest provision TBD

## Phases shipped

All phases are merged to main as of 2026-06-07.

- **Phases 0–6** — Supabase Auth, enrollment wizard, Stripe checkout (test mode), dashboard, profile page, password-reset via Resend
- **Hardening pass** — RLS policies tightened, SECURITY DEFINER revokes baked into migration
- **Dashboard** — rebuilt to 3-column Figma layout
- **Testimonials** — placeholder content, flagged as pre-launch
- **5-step intake** — trimmed from 7 steps; dropped goals/programs/notes collection steps (sent as empty defaults)
- **SEO** — per-page metadata, per-page OG images, sitemap, robots.ts with targeted disallow
- **Loading + error states** — Suspense skeletons on dashboard/profile, global-error, page-level error boundary, branded 404
- **Accessibility pass** — focus rings, skip link, semantic nav landmarks, label associations, aria-hidden decoratives, contrast bump
- **Mobile responsive sweep** — hero image overflow fixed, 44px touch targets, 16px input font-size (iOS zoom prevention), TrustBar mobile padding
- **Performance** — Three.js dynamically imported (code-split), particles reduced 7k→1,750, tab-visibility pause, hero image `sizes` prop
- **GA4 conversion events** — `intake_start`, `intake_complete`, `enroll_start`, `enroll_continue_to_payment`, `enroll_complete`, `newsletter_signup`, `program_interest_signup`, `login_success`, `password_set_success`
- **Program detail CTA** — hero CTA block with next cohort date + Enroll button; sticky mobile bottom bar via IntersectionObserver
- **Email** — branded HTML templates (lime stripe, navy card, lime buttons, sign-off from Sina); recommendation email fired after intake; confirmation page personalised with participant name + numbered next-steps
- **Audit fixes** — seat count ignores `test_paid`; About placeholder hidden in prod (`NODE_ENV === "development"`); `PreviewBanner` component; Maps iframe URL fixed (`www.google.com`); TrustBar copy ("Midtown and Downtown"); CTA label consistency; 404 link text

## Folder layout (this project folder)

```
C:\Users\farib\tennisbootcamp\     ← repo root (moved from OneDrive 2026-05-04)
├── CLAUDE.md                      ← this file
├── designs\                       ← Figma exports (reference only)
│   ├── Tennis BootCamp.zip        ← 106 screens (desktop + mobile)
│   └── tennisbootcamp-figma-assets.zip  ← web-ready assets
├── .github\workflows\ci.yml       ← GitHub Actions: lint + typecheck on push
└── src\                           ← Next.js app source
```

Project was moved out of OneDrive on 2026-05-04 to eliminate file-truncation bugs from the OneDrive filesystem layer.

## Tech stack (confirmed from source)

- **Framework:** Next.js **16.1.1** (App Router, TypeScript)
- **UI:** React **19.2.3** + React DOM 19.2.3
- **Styling:** Tailwind CSS **3.4.19** + PostCSS + Autoprefixer
- **Language:** TypeScript 5
- **Lint:** ESLint 9 with `eslint-config-next`
- **Runtime integrations:**
  - `googleapis` (v171) — Google Sheets API via service account, used by `/api/intake` and `/api/newsletter`
  - `three` — particle-wave hero background (CourtBackground, dynamically imported)
  - `stripe` — Stripe checkout; currently **test-mode only** (`STRIPE_SECRET_KEY` = `sk_test_...`). Live keys not yet set.
  - `resend` — transactional email via verified subdomain `send.tennisbootcamp.ca`. Used for password-set/reset links and intake recommendation email.
  - `mailerlite-universal` — newsletter subscriber sync on intake opt-in
  - `@next/third-parties/google` — GA4 via `GoogleAnalytics` + `sendGAEvent`; fires when `NEXT_PUBLIC_GA_ID` is set
- **Dev scripts** (from `package.json`):
  - `npm run dev` — start Next dev server
  - `npm run build` — production build
  - `npm run start` — run the built app
  - `npm run lint` — ESLint
  - `npm run agent:run -- "task request"` — in-house AI agent pipeline (see "Agent pipeline" below)
- **Deployment:** Vercel, Hobby plan. Production URL: `tennisbootcamp-seven.vercel.app`. Custom domain `tennisbootcamp.ca` to be connected (DNS pending).
- **CI:** GitHub Actions (`.github/workflows/ci.yml`) — runs lint + typecheck on every push/PR to main.

## Environment variables required

### GA4
- `NEXT_PUBLIC_GA_ID` — Google Analytics 4 measurement ID (format: `G-XXXXXXXXXX`). Get from analytics.google.com → Admin → Data Streams → Web stream → Measurement ID. When set in Vercel, the `GoogleAnalytics` component in `layout.tsx` activates automatically. Leave unset in `.env.local` during dev to suppress tracking.

### Google Sheets (intake + newsletter)
Both `/api/intake` and `/api/newsletter` share the same credentials:

- `GOOGLE_SHEETS_SPREADSHEET_ID` — target Google Sheet
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` — service account email
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` — PEM private key (accepts `\n` literals, stripped `\r`, surrounding whitespace)
- `GOOGLE_SHEETS_TAB_NAME` — optional, defaults to `Sheet1` (intake tab only)

Anything missing returns HTTP 500 with a descriptive error. Keep these in `.env.local` (git-ignored by default).

**Important:** The "newsletter" tab must be created manually in the Google Sheet before the first production newsletter submission. The API will write the header row automatically on first use, but the tab itself must exist.

## Site structure

```
src/
├── app/                          ← Next App Router
│   ├── about/page.tsx
│   ├── api/intake/route.ts       ← intake → Google Sheets (tab: GOOGLE_SHEETS_TAB_NAME)
│   ├── api/newsletter/route.ts   ← newsletter signup → Google Sheets (tab: "newsletter")
│   ├── events/page.tsx
│   ├── intake/page.tsx + layout.tsx  ← primary conversion page (layout carries metadata)
│   ├── layout.tsx                ← root layout: metadataBase, title template, OG defaults
│   ├── locations/page.tsx
│   ├── opengraph-image.tsx       ← default OG image (1200×630, edge runtime)
│   ├── page.tsx                  ← homepage
│   ├── programs/page.tsx
│   ├── robots.ts                 ← dynamic robots.txt
│   ├── sitemap.ts                ← dynamic sitemap (7 routes)
│   ├── video-lessons/page.tsx
│   └── globals.css
├── components/
│   ├── layout/                   ← Navbar, Footer, PageStack
│   ├── sections/                 ← Hero, TrustBar, EmailCapture, ProgramsGrid,
│   │                                Coaches, EventsList, LocationsGrid,
│   │                                VideoLessonsTeaser
│   └── ui/                       ← Button, Card, CourtBackground
├── content/                      ← typed data (easy to edit)
│   ├── site.ts                   ← name, tagline, email, socials
│   ├── programs.ts
│   ├── coaches.ts
│   ├── events.ts                 ← placeholder entry hidden via placeholder:true flag
│   └── locations.ts
└── types/                        ← TS types for each content file
```

Homepage (`src/app/page.tsx`) composes: Hero → TrustBar → EmailCapture → ProgramsGrid (first 3) → Coaches → EventsList → LocationsGrid.

## Primary conversion flow

Per `ops/briefs/project.md`:

1. **Book Your Assessment** (primary CTA) → `/intake` wizard → tentative match → `/assessment/book` (per `ops/plans/assessment-restructure.md`; label flips in restructure Phase 2)
2. **View Programs** (secondary) → `/programs`
3. **Newsletter signup** (tertiary)

The intake form posts to `/api/intake`, which:
- Validates env vars
- Appends a row to the configured Google Sheet
- Computes `priority_score` (1–3) and `lead_type` (`elite` / `high-intent` / `standard`) from the submission
- Sets `follow_up_status = "new"`
- Columns: `timestamp, name, email, phone, who, level, goals, programs, area, notes, newsletter, priority_score, lead_type, follow_up_status`

**Non-negotiable (from project brief):** Do not break the intake flow. All changes must be tested against the intake pipeline before being called done.

## Agent pipeline (already built in the repo)

The owner has an in-house automation in `site/ops/`:

```
ops/
├── briefs/
│   ├── brand.md          ← voice, CTA hierarchy, visual direction
│   └── project.md        ← goals, non-negotiables, current focus
├── controller/
│   ├── run-task.mjs      ← plan → execute → review runner
│   └── prompts.mjs       ← planner and reviewer system prompts
├── tasks/                ← archived task descriptions (timestamped)
└── reviews/              ← archived reviews (timestamped)
```

`npm run agent:run -- "your task"` shells out to `claude -p -` (the Claude Code CLI) three times: planner produces a safe execution prompt, executor runs with `--dangerously-skip-permissions`, reviewer produces a written audit. Both brand.md and project.md are loaded as context every run.

**When making changes:** read these two briefs first — they encode the owner's standards for tone, visual direction, and what to avoid.

## Brand and design specs

**Tone (from `ops/briefs/brand.md`)**
Welcoming, serious, athletic, premium. World-class coach voice — not salesperson, not tech company. Avoid SaaS visual language, gradients-for-their-own-sake, glassmorphism, startup patterns, or productivity-app feel.

**Logo**
- Wordmark "TENNIS BOOTCAMP" + stylized tennis ball / court swoosh in lime green
- Vector at `site/public/images/brand/logo.svg`

**Colors**
- Page background (actual, from `globals.css`): `#061427`
- Logo primary lime green: `#B4E655`
- Logo gradient stop (secondary green): `#8CC63F`
- Text: `rgba(255, 255, 255, 0.92)` on dark
- `tb-gradient` utility in `globals.css` — soft radial blues/greens/white used across pages

**Typography**
- `globals.css` uses `system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif`
- Headings in the Figma look like Poppins / Inter weight — **confirm if we want to swap to Geist (mentioned in the default README) or a custom font**

**Tagline:** "Where Athletes Evolve!" (`site/src/content/site.ts`)

## Real content vs. Figma placeholders

The code has been partially populated with real info — Figma still shows old placeholder data.

**Real, already in code:**
- Tagline: "Where Athletes Evolve!"
- Email: info@tennisbootcamp.ca
- Footer: "Design and Development QUANTUMAPPS"
- Social links present but all href="#" (needs real URLs)
- Coaches: Sina Kassaian (Co-Founder, real); second coach is still a placeholder (`name: "Head Coach"`)
- Locations: two real Toronto venues — 185 Balliol St (Toronto Tennis City) and 510 King St E #809 (Tennis Lessons Toronto), with real phones and websites
- Programs: Bootcamps (available), Kid's Summer Camp (coming soon), Group Lessons (coming soon)

**Still placeholder in code (intentional — replace when real info is available):**
- `src/content/events.ts` has a placeholder entry with `placeholder: true` — EventsList hides it and shows "sessions being scheduled" copy. Replace with real events by removing the flag and filling real data.
- `coaches` array has only Sina Kassaian — second coach removed until real info available
- Social hrefs all `"#"` in `site.ts` — Footer already filters these out automatically
- `bookingHref` is `/programs` as a placeholder; swap to Calendly URL when available
- Footer copyright year / footer note may need updating when year rolls over

**Figma still shows (but code has moved past):**
- Placeholder "Novak Djokovic" coach names
- Lorem ipsum bios
- 2/22/2023 – 2/30/2023 dates
- "Critical Reserve" program card
- Payment flow with Stripe/PayPal — NOT YET in code. Current site is lead-capture only.

## Outstanding (owner inputs needed)

These are blockers or content gaps — nothing code can fill without real data from Sina.

- **Sina's real bio** — years coaching, playing background, certifications, notable achievements. Placeholder is in `src/app/about/page.tsx`, hidden in production (`NODE_ENV === "development"`) but needs real content before the banner is removed.
- **Real venue partnerships** — `src/content/locations.ts` lists Toronto Tennis City (Balliol) and Tennis Lessons Toronto (King St E) as placeholders. These are not confirmed training partners yet. Flagged in `ops/briefs/competitors.md`. Do not present them as confirmed venues in copy until partnerships are signed.
- **Real cohort dates and capacities** — `src/content/cohorts.ts` has placeholder/sample dates and seat counts. Update before any live enrollment opens.
- **Photos** — coach headshot (Sina), court/training photos for program pages, athlete testimonial photos (currently placeholder silhouettes).
- **Real social URLs** — all `site.socials` hrefs are `"#"`. Footer already filters them out; update `src/content/site.ts` when accounts are live.
- **Second coach** — either add a real second coach to `src/content/coaches.ts`, or change the section heading to "More coaches joining soon" treatment.
- **Lawyer-reviewed waiver** — current waiver at `src/app/legal/waiver/page.tsx` is a placeholder with a visible "not reviewed by legal counsel" banner. Must be replaced before live payments are collected.
- **Real event dates** — `src/content/events.ts` has a `placeholder: true` entry; EventsList hides it and shows "sessions being scheduled" copy. Replace when real dates are confirmed.

## What's left to launch

In priority order:

1. **Source owner content above** — bio, cohort dates, photos, venue confirmation, waiver
2. **Switch Stripe to live keys** — replace `sk_test_...` with `sk_live_...` in Vercel env vars; test the full checkout flow end-to-end before flipping
3. **Remove preview banner** — delete `NEXT_PUBLIC_PREVIEW_MODE` from Vercel env vars (or set it to anything other than `"true"`)
4. **Connect tennisbootcamp.ca domain** — at GoDaddy → Vercel; then update `Supabase Auth URL allowlist` and `NEXT_PUBLIC_SITE_URL`; confirm email links resolve to the real domain
5. **Update BASE_URL** — change `tennisbootcamp-seven.vercel.app` to `tennisbootcamp.ca` in `src/app/sitemap.ts` and `src/app/robots.ts`

## Local setup checklist

On a fresh machine, from `C:\Users\farib\tennisbootcamp\`:

```powershell
npm install
# create .env.local with the 4 GOOGLE_* vars above
npm run dev    # http://localhost:3000
```

If OneDrive gets signed into this machine later, exclude `node_modules` and `.next` from sync (right-click OneDrive taskbar → Settings → Sync and backup → Advanced settings → Exclude files).

## Automation and tooling preferences

- All engineering via Claude Code CLI from `C:\Users\farib\tennisbootcamp\` (picks up this CLAUDE.md and in-repo briefs)
- Claude Code handles commits and pushes directly (no Co-Authored-By)
- `npm run agent:run -- "..."` is the owner's preferred way to run planned, reviewed changes
- Cowork is used for browser-driven tasks only (Vercel UI, Figma reference, design review) — Claude Code for all code work
- GitHub Actions CI runs lint + typecheck on every push — don't skip it
- Keep this `CLAUDE.md` as the single source of truth for project context across sessions

## How to use this file

- Treat as authoritative. When in doubt, re-read first.
- When facts change (new stack choice, new program, shipped feature), edit the relevant section and bump "Last updated."
- Cross-reference `site/ops/briefs/brand.md` and `site/ops/briefs/project.md` before making creative or structural decisions — they're the owner's non-negotiables.
