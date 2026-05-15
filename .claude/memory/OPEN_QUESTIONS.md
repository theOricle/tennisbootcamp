# Open Questions

_Unresolved questions that need answers before proceeding with certain work. Close each item by moving the answer to DECISIONS.md and removing it from here._

---

## Template

```
### [Short question title]
**Question**: What needs to be decided.
**Blocking**: What work is blocked until this is answered.
**Raised**: YYYY-MM-DD
```

---

## Open

### Design pipeline: Claude Design vs Figma MCP
**Question**: Which design-to-code pipeline should we adopt — Claude Design (current evaluation) or Figma MCP + Dev Mode?
**Blocking**: Creating a Figma file, establishing a token extraction workflow, wiring the design-reviewer agent to a live Figma source of truth.
**Raised**: 2026-04-19

### Token extraction: when and where?
**Question**: Should design tokens be extracted into `src/tokens.ts` now (centralizing `#061427`, the emerald scale, white/opacity steps) or deferred until a Figma file exists?
**Blocking**: Consistent token usage in new components; prevents hardcoded color drift over time.
**Raised**: 2026-04-19

### Testing framework
**Question**: Vitest + React Testing Library + Playwright, or something else? Who owns writing tests?
**Blocking**: Any test infrastructure work.
**Raised**: 2026-04-19

### Hosting & deployment
**Question**: Is this deployed on Vercel? Is there a production or staging URL?
**Blocking**: Browser-based QA (design-reviewer agent needs a URL to screenshot against).
**Raised**: 2026-04-19

### Social media links
**Question**: What are the real YouTube, TikTok, and Instagram URLs for Tennis Bootcamp?
**Blocking**: Footer social links (all currently `"#"` in `src/content/site.ts`).
**Raised**: 2026-04-19

### EmailCapture provider — RESOLVED
**Resolution**: Writing to "newsletter" tab in existing Google Sheet via same service account. Columns: timestamp, email, source. Shipped 2026-05-08.

### Calendly / booking integration
**Question**: What is the Calendly (or equivalent) URL for booking sessions?
**Blocking**: Setting `bookingHref` in `src/content/site.ts` to a real URL.
**Raised**: 2026-04-19

### Login/Register flow
**Question**: Is there a planned auth system (Clerk, NextAuth, custom)? The Navbar links to `/login` which has no route yet.
**Blocking**: Any member portal or booking-behind-login feature.
**Raised**: 2026-04-19

### Intake API debug log — RESOLVED
Removed 2026-05-07. Console.log block deleted from route.ts.

### Real event dates needed throughout site
**Question**: What are the actual event dates, titles, and details for upcoming Tennis Bootcamp sessions? The single entry in `src/content/events.ts` is a placeholder with an impossible date (2/22/2026 – 2/30/2026 — February 30 does not exist).
**Blocking**: Publishing accurate event information; the impossible date is a trust/credibility issue if seen by visitors.
**Raised**: 2026-04-19

---

## Resolved 2026-04-25 → 2026-05-04

### Hosting & deployment — RESOLVED
**Resolution**: Vercel Hobby plan, project `theoricles-projects/tennisbootcamp`, primary URL tennisbootcamp-seven.vercel.app. Custom domain tennisbootcamp.ca to be added later.

### Login/Register flow — DEFERRED
**Resolution**: Login button removed from Navbar for now. Full Auth.js v5 + payment flow planned (see DECISIONS.md 2026-04-21 era) but not started.

---

## Open (added 2026-05-04)

### Move Vercel env vars from other computer
**Question**: When will `.env.local` (GOOGLE_SHEETS_SPREADSHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, GOOGLE_SHEETS_TAB_NAME) be transferred from owner's other computer?
**Blocking**: Production intake form. Currently the live site fails on submit because credentials aren't in Vercel env. Local dev also blocked.
**Raised**: 2026-05-04

### Custom domain tennisbootcamp.ca
**Question**: When to switch the primary domain from tennisbootcamp-seven.vercel.app to tennisbootcamp.ca? Requires DNS access.
**Blocking**: Branded shareable URL; SEO under the real domain.
**Raised**: 2026-05-04

### GA4 measurement ID
**Question**: When will the GA4 property be created at analytics.google.com and the measurement ID (`G-XXXXXXX`) added to Vercel env vars? Code scaffolding is already in place via `NEXT_PUBLIC_GA_ID`.
**Blocking**: Real analytics on the live site. Site is deployed but tracks nothing right now.
**Raised**: 2026-05-04

### program_interest Google Sheet tab
**Question**: Has the `program_interest` tab been manually created in the Google Sheet?
**Blocking**: First production submission to `/api/program-interest` will fail if the tab doesn't exist. The API writes the header row automatically but cannot create the tab itself.
**Raised**: 2026-05-15
