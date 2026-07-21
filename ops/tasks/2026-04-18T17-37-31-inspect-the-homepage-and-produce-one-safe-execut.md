# Task: Inspect the homepage and produce one safe execution task to improve the hero section’s visual quality without changing the intake flow
**ID:** 2026-04-18T17-37-31-inspect-the-homepage-and-produce-one-safe-execut
**Date:** 2026-04-18T17:39:10.541Z

---

## Plan
Now I have enough context to produce the task.

---

## Task Title
Add Subheadline and Social Proof Line to Hero Copy Block

## Objective
The hero left column currently has only an H1 and two CTAs with no supporting copy — adding a one-sentence subheadline and a compact social proof line below the headline will strengthen visual hierarchy, communicate the value proposition, and increase conversion credibility without altering any interactive system.

## Scope
- `src/components/sections/Hero.tsx` — the only file that may be touched

## Constraints
- Do not modify `CourtBackground.tsx`, `page.tsx`, or any route/API file
- Do not alter the CTA buttons (`/intake` link, `/programs` link) or their classes in any way
- Do not add a third CTA — the existing two-button layout must stay exactly as-is
- Do not touch the player image block or its sizing
- Do not introduce new dependencies, components, or imports
- The intake form pipeline must remain completely unaffected

## Execution Prompt
You are editing `src/components/sections/Hero.tsx` in a Next.js project called TennisBootcamp.ca.

**Current state of the hero copy block (left column, inside `<div>`):**
```tsx
<div>
  <h1 className="text-4xl font-semibold tracking-tight text-white md:text-6xl">
    Where Athletes Evolve!
  </h1>
  <div className="mt-8 flex flex-wrap items-center gap-4">
    {/* CTA buttons — do not touch */}
  </div>
</div>
```

**What to add:**

1. Immediately after the closing `</h1>` tag, insert a `<p>` subheadline:
   - Text: `"Elite tennis coaching built for competitive players who want measurable results."`
   - Classes: `mt-4 text-base text-white/70 md:text-lg`

2. Immediately after the `</p>` subheadline (before the CTA `<div>`), insert a social proof line:
   - Text: `"500+ athletes trained · 15+ years coaching experience"`
   - Use an `<ul>` of two `<li>` elements separated visually — or a simple `<p>` with a mid-dot separator character `·`
   - Classes: `mt-3 text-xs font-medium uppercase tracking-widest text-emerald-400/70`

**Do not change anything else.** The CTA buttons, player image, `CourtBackground`, vignette layers, watermark text, and scroll indicator must remain exactly as they are. After editing, verify the file compiles cleanly (`next build` or `tsc --noEmit`) and confirm the `/intake` href on the primary CTA is still present and unchanged.

---

## Execution Prompt
You are editing `src/components/sections/Hero.tsx` in a Next.js project called TennisBootcamp.ca.

**Current state of the hero copy block (left column, inside `<div>`):**
```tsx
<div>
  <h1 className="text-4xl font-semibold tracking-tight text-white md:text-6xl">
    Where Athletes Evolve!
  </h1>
  <div className="mt-8 flex flex-wrap items-center gap-4">
    {/* CTA buttons — do not touch */}
  </div>
</div>
```

**What to add:**

1. Immediately after the closing `</h1>` tag, insert a `<p>` subheadline:
   - Text: `"Elite tennis coaching built for competitive players who want measurable results."`
   - Classes: `mt-4 text-base text-white/70 md:text-lg`

2. Immediately after the `</p>` subheadline (before the CTA `<div>`), insert a social proof line:
   - Text: `"500+ athletes trained · 15+ years coaching experience"`
   - Use an `<ul>` of two `<li>` elements separated visually — or a simple `<p>` with a mid-dot separator character `·`
   - Classes: `mt-3 text-xs font-medium uppercase tracking-widest text-emerald-400/70`

**Do not change anything else.** The CTA buttons, player image, `CourtBackground`, vignette layers, watermark text, and scroll indicator must remain exactly as they are. After editing, verify the file compiles cleanly (`next build` or `tsc --noEmit`) and confirm the `/intake` href on the primary CTA is still present and unchanged.

---

## Execution Output
All TypeScript errors are pre-existing in `CourtBackground.tsx` — none are in `Hero.tsx`. The `/intake` href is confirmed present and unchanged on line 29.

The two additions are in place:
- `<p className="mt-4 text-base text-white/70 md:text-lg">` — subheadline after `</h1>`
- `<p className="mt-3 text-xs font-medium uppercase tracking-widest text-emerald-400/70">` — social proof line after the subheadline

No other markup was touched.