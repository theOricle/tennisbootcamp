# Task: Audit the homepage and produce one safe execution task to improve conversion without changing the intake flow
**ID:** 2026-04-11T08-00-06-audit-the-homepage-and-produce-one-safe-executio
**Date:** 2026-04-11T08:01:09.251Z

---

## Plan
---

## Task Title
Add Secondary "View Programs" CTA to Hero Section

## Objective
The hero drives the primary CTA successfully, but offers no path for visitors who aren't ready to commit — adding the secondary CTA gives undecided visitors a clear next step, reducing bounce and warming them toward conversion.

## Scope
- `src/components/sections/Hero.tsx` — only this file

## Constraints
- Do not touch the intake form, `/intake` page, API route, Google Sheets integration, or lead scoring logic
- Do not change the primary CTA ("Get Priority Placement") text, href, or styling
- Do not add a third CTA or remove the supporting micro-copy beneath the primary button
- Do not alter the background, layout grid, image, or any other section of the hero
- The secondary CTA must be visually subordinate to the primary — never competing

## Execution Prompt

You are editing `src/components/sections/Hero.tsx` in a Next.js project called TennisBootcamp.ca.

**Current state of the CTA block (inside the left column `<div>`):**

```tsx
<div className="mt-8 flex flex-col items-start gap-2">
  <a
    href="/intake"
    className="inline-flex items-center justify-center rounded-full bg-emerald-300 px-7 py-3 text-sm font-semibold text-[#061427] transition hover:bg-emerald-200"
  >
    Get Priority Placement
  </a>
  <p className="text-xs text-white/50">
    Priority placements go to athletes who complete the intake.
  </p>
</div>
```

**What to change:**

Wrap the primary CTA anchor and its supporting `<p>` in an inner `<div>` (no style change). Then add a second anchor — the secondary CTA — as a sibling after that inner div. The overall container should become a row on wider screens.

Replace the entire `mt-8` div with this:

```tsx
<div className="mt-8 flex flex-wrap items-center gap-4">
  <div className="flex flex-col items-start gap-2">
    <a
      href="/intake"
      className="inline-flex items-center justify-center rounded-full bg-emerald-300 px-7 py-3 text-sm font-semibold text-[#061427] transition hover:bg-emerald-200"
    >
      Get Priority Placement
    </a>
    <p className="text-xs text-white/50">
      Priority placements go to athletes who complete the intake.
    </p>
  </div>

  <a
    href="/programs"
    className="inline-flex items-center justify-center rounded-full border border-white/20 px-7 py-3 text-sm font-semibold text-white/80 transition hover:border-white/40 hover:text-white"
  >
    View Programs
  </a>
</div>
```

**Verification checklist before finishing:**
1. The primary CTA ("Get Priority Placement") still links to `/intake` with unchanged styling
2. The secondary CTA ("View Programs") links to `/programs` and is visually subordinate (ghost/outline style, no fill)
3. No other section of `Hero.tsx` is modified
4. The intake form and API route are untouched — do not open those files

---

## Execution Prompt
You are editing `src/components/sections/Hero.tsx` in a Next.js project called TennisBootcamp.ca.

**Current state of the CTA block (inside the left column `<div>`):**

```tsx
<div className="mt-8 flex flex-col items-start gap-2">
  <a
    href="/intake"
    className="inline-flex items-center justify-center rounded-full bg-emerald-300 px-7 py-3 text-sm font-semibold text-[#061427] transition hover:bg-emerald-200"
  >
    Get Priority Placement
  </a>
  <p className="text-xs text-white/50">
    Priority placements go to athletes who complete the intake.
  </p>
</div>
```

**What to change:**

Wrap the primary CTA anchor and its supporting `<p>` in an inner `<div>` (no style change). Then add a second anchor — the secondary CTA — as a sibling after that inner div. The overall container should become a row on wider screens.

Replace the entire `mt-8` div with this:

```tsx
<div className="mt-8 flex flex-wrap items-center gap-4">
  <div className="flex flex-col items-start gap-2">
    <a
      href="/intake"
      className="inline-flex items-center justify-center rounded-full bg-emerald-300 px-7 py-3 text-sm font-semibold text-[#061427] transition hover:bg-emerald-200"
    >
      Get Priority Placement
    </a>
    <p className="text-xs text-white/50">
      Priority placements go to athletes who complete the intake.
    </p>
  </div>

  <a
    href="/programs"
    className="inline-flex items-center justify-center rounded-full border border-white/20 px-7 py-3 text-sm font-semibold text-white/80 transition hover:border-white/40 hover:text-white"
  >
    View Programs
  </a>
</div>
```

**Verification checklist before finishing:**
1. The primary CTA ("Get Priority Placement") still links to `/intake` with unchanged styling
2. The secondary CTA ("View Programs") links to `/programs` and is visually subordinate (ghost/outline style, no fill)
3. No other section of `Hero.tsx` is modified
4. The intake form and API route are untouched — do not open those files

---

## Execution Output
Done. The CTA block now has:

- Primary CTA ("Get Priority Placement" → `/intake`) with its supporting subtext, wrapped in an inner `<div>` — styling unchanged
- Secondary CTA ("View Programs" → `/programs`) as a sibling, ghost/outline style with no fill
- Outer container is `flex flex-wrap items-center gap-4` so they sit in a row on wider screens and stack naturally on mobile

No other part of `Hero.tsx` was touched.