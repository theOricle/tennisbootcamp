# Progress — Living Status

_Update this at the start or end of each working session._

---

## Current State (2026-04-19)

### What Exists
- [x] Homepage with Hero, ProgramsGrid (3 programs), Coaches (2), EventsList, LocationsGrid (2), EmailCapture
- [x] Intake wizard — 7 steps, full form state, POST to `/api/intake`
- [x] `/api/intake` route → Google Sheets via service account JWT (auto-headers, priority scoring)
- [x] Static sub-pages: Programs, Events, Locations, Video Lessons, About (shells only)
- [x] Navbar (sticky, logo, 3 CTAs + hamburger icon) + Footer
- [x] `Button` UI primitive — 3 variants (primary / secondary / ghost), extends `Link`
- [x] `Card` UI primitive
- [x] `CourtBackground` SVG/canvas component for Hero
- [x] Dark theme: navy `#061427`, emerald accents, `.tb-gradient` global class
- [x] `site.ts` config: name, tagline, email, socials (placeholder), bookingHref (placeholder)
- [x] `.claude/` structure: memory + agents + sessions dirs
- [x] CLAUDE.md at repo root (updated 2026-04-19)
- [x] `agent:run` npm script wired to `ops/controller/run-task.mjs`

### In Progress
- [ ] Figma MCP / design pipeline evaluation

### Not Started
- [ ] Figma design file
- [ ] Design token extraction (`src/tokens.ts`)
- [ ] Testing infrastructure (Vitest + React Testing Library + Playwright)
- [ ] Social media links (YouTube, TikTok, Instagram — all `#` in site.ts)
- [ ] Calendly booking integration (bookingHref currently `/programs`)
- [ ] EmailCapture wired to Mailchimp/ConvertKit/Tally (currently alert() stub)
- [ ] Video lessons content
- [ ] Blog / articles section
- [ ] Login/Register flow (Navbar has button but no route)
- [ ] Remove debug `console.log` from `src/app/api/intake/route.ts` (lines 26–33)
- [ ] Head Coach profile filled in (name, bio, website in coaches.ts)
- [ ] Real event data in events.ts (current entry is placeholder)

---

## Session Log

### 2026-04-19 (session 2)
- Re-inspected full codebase: confirmed Next.js version is 16.1.1 (not 15 as previously noted)
- Found `console.log` debug block in intake API route (lines 26–33) — flagged as known debt
- Found `EmailCapture` form uses `alert()` stub — flagged as not started
- Rewrote CLAUDE.md with accurate versions, known tech debt, full intake form description
- Updated PROJECT.md with real intake priority scoring logic and location details
- Updated all memory + agent files with real codebase observations

### 2026-04-19 (session 1)
- Installed MCP servers: chrome-devtools, playwright, github (all pre-existing in user config)
- Created `.claude/agents/` and `.claude/memory/sessions/` folders
- Generated initial CLAUDE.md, PROJECT.md, PROGRESS.md, DECISIONS.md, OPEN_QUESTIONS.md
- Generated agent prompts: session-keeper, component-builder, design-reviewer

### 2026-04-25 (session 3 — hero rebuild + Vercel deploy)
- Hero rewritten end-to-end: new copy, lime accent on "Evolve!", subtitle, Spring Intake pulsing badge
- CourtBackground.tsx replaced with faithful Three.js particle-wave port (deathfang/WxNVoq)
- Camera elevated y=350, vertical lock, half-strength horizontal follow, per-particle cursor bounce
- Player image enlarged + pulled toward page center
- Removed /login Navbar button (no auth page exists)
- Footer filters "#" social URLs
- Removed placeholder "Head Coach" coach #2
- Project deployed to Vercel: tennisbootcamp-seven.vercel.app
- Vercel build issues fixed: added `three` runtime dep + src/types/three.d.ts fallback; replaced THREE.BufferAttribute type casts with structural casts; rebased CLAUDE.md commit onto origin/main

### 2026-05-04 (session 4 — workflow cleanup)
- Project moved out of OneDrive to `C:\Users\farib\tennisbootcamp\` (eliminated truncation bugs)
- Comprehensive CLAUDE.md from OneDrive copied to repo root + committed
- Memory enabled in Cowork settings
- Workflow decision: Claude Code for code-only work, Cowork for design/browser tasks only
- Created automation Layer 2 plan (slash commands /ship /audit /checkpoint, GitHub Actions CI, pre-commit hooks) — to be set up via Claude Code

## Updated Current State (2026-05-04)

### Shipped & Live
- [x] Hero with particle-wave background, brand-correct copy/CTAs, deployed to Vercel
- [x] All previous homepage sections (ProgramsGrid, Coaches, EventsList, LocationsGrid, EmailCapture)
- [x] /api/intake → Google Sheets (working in dev; production needs .env.local from other computer)
- [x] Static sub-pages: Programs, Events, Locations, Video Lessons, About
- [x] Vercel auto-deploy on main push

### Not Yet Started / Next Up
- [ ] .env.local credentials in Vercel env vars (waiting on transfer from other computer)
- [ ] Custom domain tennisbootcamp.ca added to Vercel
- [ ] Layer 2 automation: slash commands, GitHub Actions, pre-commit hooks
- [ ] EmailCapture wired to a real backend (newsletter or 2nd Google Sheet tab)
- [ ] Real event dates in events.ts (placeholder hidden until real dates land)
- [ ] Calendly URL for bookingHref
- [ ] Full Programs/Coaches/Registration polish to match Figma
- [ ] Eventually: full Auth.js v5 + Neon Postgres + Prisma + Stripe Checkout build

### Session Log

### 2026-05-05
- Added TrustBar section (3 trust signals between Hero and EmailCapture)
- EmailCapture: brand lime button, updated copy, submitted confirmation state

### 2026-05-07
- SEO: robots.ts, sitemap.ts, opengraph-image.tsx, metadataBase + title template in layout, per-page metadata on all 7 routes, intake/layout.tsx for client page
- Removed private key debug console.log from /api/intake (security — leaked key material to server logs)

### 2026-05-08
- EventsList: added `placeholder` flag to Event type; marked current entry placeholder; renders clean empty state instead of impossible Feb 30 date
- Navbar: replaced `<img>` with `<Image />` (next/image) for logo — fixes LCP warning, zero visual change
- GitHub Actions CI: `.github/workflows/ci.yml` — runs lint + typecheck on every push/PR to main
- EmailCapture: wired to `/api/newsletter` → writes timestamp, email, source to "newsletter" tab in existing Google Sheet; loading + error states handled; works in dev, awaiting Vercel env vars for production
- VideoLessonsTeaser: removed 6 identical fake placeholder tiles; clean "coming soon" copy remains
- CLAUDE.md: updated paths, deployment, CI, newsletter, outstanding work, open questions — now accurate as of 2026-05-08
- LocationsGrid: added "Get directions →" Google Maps links from address; swapped emoji phone for plain text; website links now brand lime
- Brand color consistency: Button.tsx primary → #B4E655 (was emerald-300); ProgramsGrid + Coaches link text aligned to brand lime; Navbar CTA now correct color on every page
