# Task: Audit the homepage and produce one safe execution task to improve conversion without changing the intake flow
**ID:** 2026-04-11T07-55-27-audit-the-homepage-and-produce-one-safe-executio
**Date:** 2026-04-11T07:56:18.126Z

---

## Plan
---

## Task Title
Add Secondary CTA to Hero Section

## Objective
The Hero section presents a single conversion path (`Get Priority Placement`), leaving visitors with no guided next step if they are not yet ready to commit — adding a `View Programs` ghost button below the primary CTA completes the brand-specified CTA hierarchy and keeps undecided visitors in the funnel.

## Scope
- `src/components/sections/Hero.tsx` — only file to be modified

## Constraints
- Do not touch `/intake` page, `/api/intake`, or any Google Sheets / lead-scoring logic
- Do not change the primary CTA button (`Get Priority Placement`, `/intake`, emerald style)
- Do not add a third CTA, change the headline, or modify the CourtBackground animation
- The secondary button must be clearly subordinate to the primary — use a ghost / outline style, not a filled button
- No new dependencies; use only Tailwind classes already in use in the project

## Execution Prompt

You are editing a single React component in a Next.js project called TennisBootcamp.ca.

**File to edit:** `src/components/sections/Hero.tsx`

**What to do:**
Add a secondary `View Programs` CTA button directly below the existing primary CTA group (the `<a>` tag and `<p>` subtext). The button should link to `/programs`.

**Visual requirements:**
- Style it as a ghost/outline button: transparent background, a thin `border border-white/30` border, `text-white/80` text, same `rounded-full` shape and `px-7 py-3 text-sm font-semibold` sizing as the primary button
- Add a `hover:border-white/60 hover:text-white transition` hover state
- Place it immediately after the closing `</p>` of the subtext, still inside the `<div className="mt-8 flex flex-col items-start gap-2">` wrapper — so both buttons stack with the existing `gap-2` spacing

**What must not change:**
- The primary `Get Priority Placement` button and its subtext line are untouched
- No other part of the file changes
- The `CourtBackground`, ghost watermark text, player image, and down-arrow are untouched

**Verification:** After editing, confirm the JSX compiles with no TypeScript errors and that the `/intake` link on the primary button is still present and unchanged.

---

## Execution Prompt
You are editing a single React component in a Next.js project called TennisBootcamp.ca.

**File to edit:** `src/components/sections/Hero.tsx`

**What to do:**
Add a secondary `View Programs` CTA button directly below the existing primary CTA group (the `<a>` tag and `<p>` subtext). The button should link to `/programs`.

**Visual requirements:**
- Style it as a ghost/outline button: transparent background, a thin `border border-white/30` border, `text-white/80` text, same `rounded-full` shape and `px-7 py-3 text-sm font-semibold` sizing as the primary button
- Add a `hover:border-white/60 hover:text-white transition` hover state
- Place it immediately after the closing `</p>` of the subtext, still inside the `<div className="mt-8 flex flex-col items-start gap-2">` wrapper — so both buttons stack with the existing `gap-2` spacing

**What must not change:**
- The primary `Get Priority Placement` button and its subtext line are untouched
- No other part of the file changes
- The `CourtBackground`, ghost watermark text, player image, and down-arrow are untouched

**Verification:** After editing, confirm the JSX compiles with no TypeScript errors and that the `/intake` link on the primary button is still present and unchanged.

---

## Execution Output
The edit was blocked pending your approval. Please approve the file write permission for `src/components/sections/Hero.tsx` and I'll apply the change — it adds only the ghost `View Programs` button between the closing `</p>` and `</div>`, leaving everything else untouched.