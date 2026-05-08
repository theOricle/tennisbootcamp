# CLAUDE.md — Tennis Bootcamp Project Context

Standing brief for the tennisbootcamp.ca project. Any Claude session (Cowork or Claude Code) should start by reading this.

Last updated: 2026-05-08

---

## Project snapshot

- **Product:** tennisbootcamp.ca — a premium tennis training site with intake-driven lead capture. Primary conversion is the intake form, not e-commerce.
- **Repo:** https://github.com/theOricle/tennisbootcamp (public)
- **Owner:** Sina (sina2666@gmail.com). Works with the Claude + AI stack end-to-end across design, code, ads, and ops.
- **Workflow preference:** Automate everything possible. Claude Code in the terminal is the main engineering tool; Cowork is used for planning, docs, and non-code work.

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
- **Runtime integrations:** `googleapis` (v171) — Google Sheets API via service account, used by `/api/intake` and `/api/newsletter`; `three` — particle-wave hero background (CourtBackground)
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

Per `site/ops/briefs/project.md`:

1. **Get Priority Placement** (primary CTA) → `/intake`
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

## Outstanding work / gaps

**Waiting on owner input**
- Real social media URLs → `src/content/site.ts` (Footer auto-shows them when set)
- Calendly (or equivalent) booking URL → `bookingHref` in `src/content/site.ts`
- Real second coach name, bio, photo → `src/content/coaches.ts`
- Real event dates → `src/content/events.ts` (remove `placeholder: true`, fill real data)
- Vercel env vars transfer from other computer (blocks production intake + newsletter)
- Custom domain `tennisbootcamp.ca` → connect in Vercel dashboard (also update `BASE_URL` in `src/app/robots.ts` and `src/app/sitemap.ts`)

**Not yet built (Figma shows, code doesn't have)**
- Full registration + payment flow (Figma shows Stripe + PayPal; repo is lead-capture-only today)
- Authentication (Auth.js v5 + Neon Postgres + Prisma — planned, not started)
- Dashboard, Profile, Our Team detail pages
- Video lessons gated access (currently a clean "coming soon" teaser)
- Maps embedded on locations page
- Analytics: GA4 wired via `@next/third-parties/google` — fires when `NEXT_PUBLIC_GA_ID` is set in Vercel
- Font: Geist via `next/font/google` — shipped, no further action needed

**Design edits owner flagged**
- Figma itself needs heavy editing — specific priority screens TBD with owner.

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

## Open questions (confirm when re-visiting)

1. Do we want to introduce Stripe + PayPal + accounts now, or keep the lead-capture model for the current season?
2. Which Figma screens are priority for the "heavy edits" pass?
3. Real second coach name, bio, photo?
4. Real social media URLs?
5. Real second coach name, bio, photo?

## How to use this file

- Treat as authoritative. When in doubt, re-read first.
- When facts change (new stack choice, new program, shipped feature), edit the relevant section and bump "Last updated."
- Cross-reference `site/ops/briefs/brand.md` and `site/ops/briefs/project.md` before making creative or structural decisions — they're the owner's non-negotiables.
