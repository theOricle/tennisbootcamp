# CLAUDE.md — Tennis Bootcamp

Standing brief for the tennisbootcamp.ca product repo. This file is the only thing a session must read before its first edit, plus `ops/briefs/voice.md` when the task touches any user-facing string, and the active plan only when the task names it. Everything else is in the Key files table: read it when the row says to, not before. History lives in `git log`, not here.

Last updated: 2026-11-25 (refresh, backlog #90)

---

## Project snapshot

- **Product:** a premium tennis training site in Toronto. Every group is a group bootcamp: tennis plus fitness built for tennis in every class, and that idea leads what the site says (the words live in `src/content/bootcamp.ts`). Repo `theOricle/tennisbootcamp` (public). Owner: Sina Kassaian.
- **Funnel (owner 2026-11-14 to 2026-11-20):** the main button, the lime one on every public page, reads **"Join a bootcamp"** (`JOIN_CTA_LABEL`, `src/lib/mainAction.ts`) → `/programs`. Joining is pick a group, then pay: each open block is its own group card, and its **"Enroll"** opens the block's sign-up page, `/enroll/[cohortId]` (who plays, the agreement, payment). An open High Performance (or invite-only) block's card reads **"Ask to join"**, to the same page, where its approval step (the quiz, then our coaches) takes over. A group with no open block reads "Dates coming soon" with **"Notify me"** (to the newsletter signup). The quiz is the side path: "Not sure which group? **Take the 2-minute quiz**" → `/intake`. **"Book Your Assessment"** is the exact label of the *optional* $20 assessment button (`/assessment`, "Good to know" on `/programs` and the program pages, the quiz's result, the dashboard) → `/assessment/book`. "Browse Programs" is the outline link to `/programs` where a page keeps one. Never label the main button anything else; its retired labels are "Take the 2-minute quiz", "Join a group", "Get Priority Placement" and "Find My Program".
- **Paid programs** are blocks (cohorts) the coach builds in `/admin/cohorts` (Supabase), each with its own dates, class days, price, capacity, level and payment mode. A block shows only while it is public, inviting or confirmed and before its first class (`src/lib/cohortVisibility.ts`), each as its own group card (`src/lib/groupBlocks.ts`). Emailed invitations, matched by level and availability, still hold a spot our coaches offer.
- **Season and payments (owner 2026-11-14):** the goal is the indoor winter block. Each block is set to e-transfer, with the coach marking each payment received in `/admin/cohorts/[id]`, or to Stripe card checkout, which stays in test mode: a test payment holds no seat and sends no email. Until launch the database holds test entries only; it is emptied before real people sign up.
- **Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind 3.4, Supabase (Auth + Postgres, RLS on every table), Google Sheets via `googleapis`, Resend, MailerLite, Stripe (test), GA4. Vercel Hobby, live at `tennisbootcamp.ca` (`tennisbootcamp-seven.vercel.app` still answers). CI: GitHub Actions runs lint, typecheck, `npm test` and `npm run build`.

## Locked decisions

Settled. Do not re-open without explicit owner instruction.

- **Pricing (CAD, backlog #20):** $35 a session (`SESSION_PRICE`) · $210 per six-week cohort (every Youth Bootcamps and Adult Bootcamps group, High Performance included) · Assessment $20 · Private Lessons "Rates on request". A visitor reads the whole price (owner 2026-11-17): "$210 for 6 classes over six weeks" on a group card, and an open block shows its own price. The per-class figure is one small line on a block's sign-up page ("6 classes, $35 each", worked out from that block, PR #104). The home page shows no price. Kids' Summer Camp left the catalog. Retired: Bootcamps $649, Group Lessons $599 — never quote them.
- **One setting for cohort length and price (backlog #27):** `SESSION_PRICE` and `COHORT_WEEKS` in `src/content/programs.ts` drive every total (cohort price, instalment, admin default). Never hard-code a length or total — `npm test` (`test-cohort-length.ts`) fails if you do. Changing `COHORT_WEEKS` changes the policy text, so bump `EFFECTIVE_DATE` in `src/content/policies.ts` in the same PR.
- **Program Policies (interim, backlog #2a; replaces the refund policy):** 10-day no-reason cancellation, no fee inside it, counted from the later of receiving the written agreement and the first session (CPA 2002 s. 35(1)). After a cohort starts, missed sessions are not refunded; sessions we cancel are made up inside the cohort's make-up window (none for fall 2026), else account credit. The $25 fee and 50% tier are retired. Published at `/legal/refund-policy` ("Program Policies"); values in `src/content/policies.ts`. Pending legal review; the waiver is a placeholder and must be lawyer-reviewed before live payments.
- **Assessment:** 20 minutes on court, $20, and that $20 comes off the price when the player enrolls in a program afterward (per participant). Assessment slots are self-serve. The coach-assigned level is the placement source of truth.
- **Levels (owner 2026-10-13, PR #95):** five, low to high: Beginner, Novice, Intermediate, Advanced, High Performance (`src/lib/tiers.ts`). Each group carries one level tag, never a range, and a level-led title ("Intermediate Adult Bootcamp").
- **Cohorts:** email invites with a 48h hold; minimum-to-run; business-cancelled sessions become make-ups, then credit.
- **Households (backlog #11, #14):** one account holder, several participants. `participants` (migration 0007) is the player of record; `profiles` mirrors the holder's `'self'` participant. Each participant has its own age band (sole source of `isMinor`) and self-estimate; `recommendPrograms()` runs once per participant; availability is one shared household grid. Capacity counts participants.
- **Player data:** every level/availability read or write goes through `src/lib/players.ts`. Band hours live once in `BAND_HOURS` (`src/lib/availability.ts`); stored data stays three bands.
- **Club membership:** $100/season, paid by players to the club directly, never through our Stripe. Copy lives in `src/lib/membership.ts` behind `NEXT_PUBLIC_CLUB_GUEST_OK`. The site names our one location, Newtonbrook Tennis Club in North York (PR #92); every place that says where we train reads `src/content/locations.ts`.
- **Email:** FROM `Tennis Bootcamp <noreply@send.tennisbootcamp.ca>` (Resend). `info@tennisbootcamp.ca` owns business APIs; Sina's Gmail owns dev accounts.
- **Preview mode:** `NEXT_PUBLIC_PREVIEW_MODE=true` stays set in Vercel until launch (`PreviewBanner`, text locked). The live site shows no banner today (owner to confirm).
- **Content honesty:** no placeholder testimonials, coaches, socials or events render in production. Socials with `href: "#"` are filtered out.
- **Code conventions:** Tailwind utilities only (`.tb-gradient` is the one global class); named exports for components; `@/*` imports; Supabase service-role key only in server-only modules (`import 'server-only'`) or route handlers.
- **Shipped and merged:** by backlog item, bot protection on public forms (#25), privacy fixes (#23), lead source (#26), SEO structured data and canonicals (#7); later, by pull request: How joining works, right-group promise, High Performance by approval (#91) · Newtonbrook Tennis Club as first-class location (#92) · Five levels + one level tag per group with level-led titles (#95) · simpler site: home, programs and group card rebuilt from the approved design (#97) · the whole price only; "Join a bootcamp" (#98) · home band names Tennis and Fitness (#100) · escape typed names and notes in every email (#101) · the $20 credit, paid seats, refunds, Sheet formulas (#103) · Join on every open group, with its dates and class days (#102) · the per-class figure, shown quietly on the sign-up page (#104).

## Non-negotiables

1. **Never break `/api/intake`.** The Google Sheet row is a 29-column contract, defined in `src/lib/intakeRow.ts` and pinned by `npm test` (`test-intake-row.ts`): columns 1–22 are locked (the original 17, then the 5 household columns 18–22); columns 23–29 are lead source (#26), written as apostrophe-prefixed text. Never reorder, rename or remove a column; anything new goes after 29, and only by owner decision. Account provisioning after the append (`src/lib/intakeAccount.ts`) may log a failure but never fails the response. Test every change against the intake pipeline.
2. **Migrations are never run by a session.** A build writes the idempotent, additive migration file (`if not exists` / guarded `do $$`) and puts the full SQL in the PR body with a `-- verify:` SELECT block. It is applied by hand in the Supabase SQL editor only on Sina's per-migration word. Code that depends on it degrades sanely until then.
3. **One branch per backlog item, from fresh `origin/main`** (`claude/NN-slug`, in its own worktree). Never stack on an unmerged branch; never reuse a branch whose PR merged.
4. **Checks before review:** `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build` pass locally, GitHub Actions is green and the Vercel preview renders. PRs open as **drafts**.
5. **Sessions that build never merge.** Merges are done by the operator only on Sina's explicit word or a logged pre-approval. A green PR is not permission.
6. **No reminders or check-ins.** One scheduled run is approved: a weekly read-only health check on the owner's computer (`tbc-weekly-health`, owner 2026-11-14). No other cron, reminders or self-wakeups. Do the work, open the draft PR, report, end.
7. **Never read or commit `.env.local`** (or any real env file; `.env.local.example` is fine). Never push to `main`, never force-push.
8. **Keep the site athletic, premium and clean.** No SaaS visuals, gradients for their own sake, glassmorphism or competing CTAs. Every user-facing string follows `ops/briefs/voice.md`; its locked strings are never rewritten.

## How builds run (ops pack agents)

Work is dispatched from the separate `tennisbootcamp-ops` pack (business layer: ads, offers, backlog, dispatch prompts, review logs — never in this repo). Each item is built by one local agent in its own worktree and reviewed cold by a different agent before any merge. `npm run agent:run` still exists in `package.json` but is **deprecated** for plan phases and backlog items — do not use it; plan files that mention it are out of date on that point.

| Work | Model | Agent |
|---|---|---|
| Default build — features, copy, content, config, URLs, including string, URL, copy or config-only diffs inside sensitive files | `opus` | `tbc-builder` |
| A diff that **changes behaviour** in money amounts or flows, auth/session/permission checks, RLS or SQL, webhook handling, or the `/api/intake` contract (judged by the change, not the file); visual redesigns | `fable` | `tbc-builder-fable` |
| Cold PR review (every PR) | `opus` | `tbc-reviewer` |
| Second review for the sensitive cases above | `fable` | `tbc-reviewer-fable` |
| Bulk copy variants (ad variants, A/B headlines); pack bookkeeping | `sonnet` | `tbc-ops` |
| Chores: CI watching, renames, formatting, data entry | `haiku` | `tbc-ci-watch` |

Every writing task loads `ops/briefs/voice.md`, whatever the model.

## Key files

| Path | Read when |
|---|---|
| `ops/briefs/voice.md` | Before writing or changing any user-facing string, email or metadata. **Mandatory for those tasks.** |
| `ops/plans/assessment-restructure.md` | Only when the task names a phase or section of it |
| `ops/briefs/design-system.md` | Building or restyling UI (colour, spacing, type tokens) |
| `ops/briefs/brand.md` | Visual direction or CTA hierarchy questions |
| `ops/briefs/competitors.md` | Pricing or positioning copy |
| `.claude/memory/DECISIONS.md` | Before re-opening an architectural choice |
| `src/lib/intakeRow.ts`, `src/app/api/intake/route.ts` | Anything touching the quiz submission or the Sheet |
| `src/lib/players.ts`, `src/lib/availability.ts` | Level or availability reads/writes |
| `src/content/programs.ts`, `src/content/policies.ts` | Prices, cohort length, policy values |
| `src/content/locations.ts`, `src/lib/membership.ts` | Where we train, or club-membership copy |
| `supabase/migrations/` | Writing a migration (0001–0012 exist; each is applied by hand) |
| `.claude/memory/archive/` | Never by default — superseded history |

## Outstanding owner inputs

Sina's real bio · the indoor winter block's venue (a new location is an entry in `src/content/locations.ts`) and its dates (in `/admin/cohorts`) · coach and court photos · real social URLs (`src/content/site.ts`) · second coach · lawyer-reviewed waiver and Program Policies · real event dates (`src/content/events.ts`, `placeholder: true`) · club guest provision for assessments.

## Launch switches (owner, no code)

Stripe live keys (test the full checkout first) · remove `NEXT_PUBLIC_PREVIEW_MODE`. Done: `tennisbootcamp.ca` is connected, the Supabase Auth URL allowlist covers it, and `NEXT_PUBLIC_SITE_URL` points at it (read by `src/lib/siteUrl.ts` for metadata, robots and sitemap; the live canonical URLs read `https://tennisbootcamp.ca`).

## Local setup

`npm ci`, create `.env.local` from `.env.local.example` (Sheets, Supabase, Resend and the rest), `npm run dev` → http://localhost:3000. The Sheet's `newsletter` and `program_interest` tabs must exist before their first production write; the API writes headers but cannot create tabs.
