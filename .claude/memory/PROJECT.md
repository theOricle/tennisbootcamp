# Tennis Bootcamp — Project North Star

## What We're Building
A high-conversion marketing and intake site for Tennis Bootcamp, an elite tennis coaching program based in Toronto, Canada. The site attracts competitive athletes, showcases programs and coaches, and funnels visitors into a priority placement intake form connected to Google Sheets.

## Primary Conversion Funnel
Homepage → "Get Priority Placement" CTA → `/intake` (7-step wizard) → Google Sheets lead row

Priority scoring is automatic in the intake API:
- `elite` level → score 3 (lead_type: elite)
- Multiple programs or private lessons selected → score 2 (lead_type: high-intent)
- Everything else → score 1 (lead_type: standard)

## Business Goals (in priority order)
1. **Convert visitors to intake leads** — primary CTA is "Get Priority Placement" throughout site
2. **Showcase credibility** — coaches, programs, events, and locations build trust
3. **Grow email list** — EmailCapture section on homepage (not yet wired to a provider)
4. **Eventually support online booking** — `bookingHref` in `site.ts` is a placeholder for Calendly

## Target Audience
- Competitive tennis players (teens and adults) in Toronto metro area
- Parents of junior athletes seeking structured coaching
- Key areas: North York, Downtown Toronto, Markham / Richmond Hill

## Current Locations
- Toronto Tennis City — 185 Balliol St, Toronto, ON M4S 1C2 (+1 647-381-6464)
- Tennis Lessons Toronto — 510 King St E #809, Toronto, ON M5A 0E5 (+1 647-894-3977)

## Tech Constraints
- Static data model — no CMS, no DB (content is TypeScript files in `src/content/`)
- Google Sheets for intake — uses `googleapis` with service account credentials
- Hosted on Vercel (assumed — Next.js App Router project)
- No test infrastructure yet

## Design Maturity
**Early stage.** Color palette and layout conventions exist in practice but no formal token system or Figma file yet. All styling is Tailwind utility classes with a few values in `globals.css`. The design-to-code pipeline (Figma MCP) is being evaluated.

## North Star Metric
Intake form completion rate. Every UI decision should consider whether it helps a visitor trust the brand and complete the intake.
