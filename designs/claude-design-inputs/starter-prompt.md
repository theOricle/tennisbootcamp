# Claude Design — Starter Prompt for Tennis Bootcamp Hero

Copy everything between the lines below into Claude Design as your first message. Attach the three hero reference images (`hero-reference-desktop.png`, `hero-reference-mobile.png`, `hero-reference-hover.png`) and, if Claude Design accepts repo connections, point it at https://github.com/theOricle/tennisbootcamp.

---

## Project context

I'm redesigning the hero section of **tennisbootcamp.ca**, a premium tennis training site. The primary conversion is a lead-capture intake form at `/intake`.

**Repo:** https://github.com/theOricle/tennisbootcamp (Next.js 16.1.1, React 19, TypeScript, Tailwind 3.4). If you can read the repo, extract the design system from it.

**Existing design tokens in the codebase (match these exactly):**
- Page background: `#061427` (deep navy)
- Accent / CTA color (lime green from logo): `#B4E655`
- Secondary green: `#8CC63F`
- Body text: `rgba(255, 255, 255, 0.92)` on dark
- There's a `tb-gradient` utility in `src/app/globals.css` — soft radial blues/greens/white vignette

**Logo:** wordmark "TENNIS BOOTCAMP" stacked on two lines, with a stylized tennis ball / court swoosh mark in lime green. SVG at `public/images/brand/logo.svg` in the repo.

**Tagline:** *"Where Athletes Evolve!"*

## Brand brief (non-negotiable)

Tone: welcoming, serious, athletic, premium. The voice is a world-class coach speaking to a motivated player — not a salesperson, not a tech company.

Strictly avoid:
- SaaS visual language (floating glass cards, gratuitous gradients, glassmorphism for its own sake)
- Abstract tech motion — if there's animation, it must be tennis-related (ball physics, racket motion, court geometry), never generic particles or geometric abstracts
- Stock-photo feel, lifestyle-brand vibes
- Extra CTAs that dilute the primary conversion

## CTA hierarchy (do not change)

1. **Primary:** "Get Priority Placement" → `/intake` — this is the main conversion, most visual weight
2. **Secondary:** "View Programs" → `/programs` — outline button, less prominent
3. **Tertiary:** newsletter signup — lives just below the hero, not inside it

## Current hero in the code (for reference — this is what exists now)

- Dark `#061427` background
- Animated canvas (`CourtBackground.tsx`) drawing a perspective tennis court with a light sweep that speeds up on cursor hover
- Soft `tb-gradient` vignette overlay
- Huge translucent "TENNIS BOOTCAMP" watermark behind the foreground
- Two-column grid: headline + two CTAs on left, player photo on right
- Small arrow at the bottom hinting at scroll

## What I want you to produce

A redesigned hero section — live, clickable HTML — that:

1. Matches the Figma reference images I've attached (desktop, mobile, and hover state)
2. Looks obviously premium and tennis-native — not a SaaS landing page
3. Includes a tennis-themed interactive background animation that reacts to cursor movement (propose something specific — ball trail, court-line parallax, net physics, etc. — and implement it)
4. Keeps the CTA hierarchy exactly as described above
5. Works cleanly on desktop and mobile (the mobile reference is attached)
6. Uses the exact color tokens from the codebase

Show me 2–3 distinct directions if you're uncertain about the animation, then let me pick one. Otherwise, produce your strongest single take and I'll refine with the sliders and inline comments.

When I approve a direction, export as production-ready HTML/React code so I can port it to `src/components/sections/Hero.tsx` and `src/components/ui/CourtBackground.tsx` in the repo.
