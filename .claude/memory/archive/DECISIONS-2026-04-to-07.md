archived 2026-09-29, superseded by CLAUDE.md and git log

# Decisions archive (2026-04 to 2026-07)

Superseded or completed decisions moved out of `.claude/memory/DECISIONS.md` in backlog #17. Kept for history only; none of these is in force.

### 2026-04-19 — Figma MCP / Claude Design evaluation deferred
**Decision**: Not installing Figma plugin yet. Evaluating Claude Design first.
**Why**: Owner wants to compare options before committing to a design pipeline.
**Alternatives considered**: Figma Dev Mode MCP — on hold pending evaluation.

### 2026-04-25 — Hero subtitle: "Peak training for serious players."
**Decision**: Subtitle below the H1 is "Peak training for serious players."
**Why**: Aspirational, qualifies the audience, doesn't claim a track record we don't have yet.
**Alternatives considered**: "Made for athletes who want to reach their full potential" — too generic; longer variants — too wordy.

### 2026-04-25 — No "View Programs" CTA in hero
**Decision**: Hero has only one CTA: "Get Priority Placement" → /intake. The "View Programs" secondary CTA was removed.
**Why**: Matches the Figma main page; reduces decision-load, focuses visual weight on the primary conversion.
**Alternatives considered**: Keeping it as outline button — rejected for cleaner hero per Figma.

### 2026-04-25 — /login button removed from Navbar
**Decision**: Removed the Login/Register button entirely. Auth is a much larger rebuild and a stub page would be misleading.
**Why**: The button linked to /login which 404'd in production. Better to remove than fake it.
**Alternatives considered**: Build a stub login page — rejected; auth.js scaffolding will come later as part of full registration build.

### 2026-05-04 — Use Claude Code as primary driver, Cowork only for browser/design
**Decision**: Code-only work (components, animations, fixes, refactors) is done via Claude Code in the terminal. Cowork is used only for browser-driven workflows (Vercel UI, Figma reference, design review).
**Why**: Cowork's browser control and file-mount overhead burns ~10–50× more tokens per turn than Claude Code for equivalent code work.
**Alternatives considered**: All-Cowork — repeatedly hit usage limits.

### 2026-05-04 — Auto-provision account + claim flow
**Decision**: After successful Stripe payment, the webhook auto-creates a User row from the enrollment data (passwordHash null, emailVerified null). User receives an email: "You're enrolled — click to set your password and access your dashboard." Clicking the one-time-token link lets them set a password and log in. Returning customers (existing User with passwordHash) get a normal confirmation email.
**Why**: Smoothest possible UX — guest checkout up front, account is just there waiting for them to claim it. Common pattern (Eventbrite, etc.). Email is the unique key — no duplicate accounts.
**Alternatives considered**: Magic-link only (no password) — simpler but less control for users who want regular logins. Strict signup at checkout — rejected.

### 2026-05-04 — Program detail pages built BEFORE auth/payment system
**Decision**: Build individual `/programs/[slug]` pages first, then the enrollment flow, then auth/payments. "Coming soon" programs get email-capture into a `program_interest` Google Sheet tab. The enrolled-in-now ("Bootcamps") gets an Enroll CTA pointed at `/intake?program=bootcamps` until the real enrollment flow ships.
**Why**: Logical dependency order. Can't build enrollment without something to enroll into. Also lets Bootcamps capture the next ~6 weeks of leads via the existing intake form while the full payment system gets built.
**Alternatives considered**: Auth-first then pages — premature; users can't engage with empty program pages.

### 2026-05-04 — Realistic enrollment build estimate (~7–10 hours, not 42)
**Decision**: With Claude Code driving, the full enrollment + auth + payments build is realistically 7–10 hours of owner wall-clock time across 3–4 sessions, not the 42-hour estimate from the original plan (that was based on a human dev working solo).
**Why**: Owner approves+tests, Claude Code writes. Real bottlenecks are Neon + Resend + Stripe account setup and the few times Auth.js v5 beta or Stripe webhooks need debugging.
**Alternatives considered**: N/A — this is a re-estimate, not a fork in the road.

### 2026-05-24 — Primary CTA label changed to "Find My Program"
**Decision**: The top-level marketing CTA (Hero button, Navbar primary button) is now "Find My Program" → `/intake`. The secondary hero CTA "Browse Programs" → `/programs` is added as an outline button at lower visual weight.
**Why**: "Find My Program" better describes the intake-as-recommendation-engine flow built in Phase 2. "Get Priority Placement" was the right label when intake was purely a waitlist; now the intake actively recommends a cohort, so the label should match the outcome.
**Alternatives considered**: Keep "Get Priority Placement" (brand.md default) — rejected because the CTA's promise no longer matches the experience; users now get a matched program recommendation, not just a spot on a list.
**Scope**: Change applies to Hero and Navbar only. All copy INSIDE the intake flow ("PRIORITY PLACEMENT INTAKE" heading, "You're on the Priority Placement List" success copy) is untouched — that language is correct in context and should stay.

### 2026-05-24 — Stub email with console.log (Resend in Phase 7)
**Decision**: Activation emails (invite + magic link) are not sent through any SMTP in Phase 6. `issueActivationLink()` calls Supabase Admin's `generateLink` API to produce a signed one-time URL, then `console.log`s it with the prefix `[STUB EMAIL — Phase 7 will replace with Resend]`.
**Why**: Supabase's built-in SMTP has limits and branding constraints. Resend is the planned email provider but not yet configured. A stub means the core auth flow is exercised end-to-end without email deliverability dependency during development.
**Alternatives considered**: Using Supabase SMTP for now — rejected because it would send real emails to test users and we'd need to undo it later. Using Resend now — not yet configured; blocked on API key setup.

### 2026-05-23 — Enroll CTA points to /programs/[slug] until Phase 4
**Decision**: Recommendation cards (and cohort cards on the detail page) link to `/programs/[slug]` for now. The `/enroll/[cohortId]` route does not exist until Phase 4. A `// TODO: link to /enroll/[cohortId] in Phase 4` comment marks every such link.
**Why**: The recommendation UI needs a working CTA today; Phase 4 hasn't been built yet. Sending users to the program detail page is a valid fallback — they see the cohort cards and can submit intent.
**Alternatives considered**: Disable the Enroll button until Phase 4 — rejected; a dead button harms conversion and user trust.
