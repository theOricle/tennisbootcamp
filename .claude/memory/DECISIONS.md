# Decisions Log

_Record architectural, design, and product decisions here. Include context and the reasoning so future sessions don't re-litigate settled questions._

---

## Template

```
### YYYY-MM-DD — [Short title]
**Decision**: What was decided.
**Why**: The constraint or reasoning.
**Alternatives considered**: What was ruled out and why.
```

---

## Decisions

### 2026-04-19 — Static data model (TypeScript files, no CMS)
**Decision**: Content (programs, coaches, events, locations) lives as typed TypeScript objects in `src/content/`.
**Why**: Low content-change frequency; avoids CMS dependency and build-time fetch complexity for an early-stage site.
**Alternatives considered**: Contentful, Sanity — overhead not justified yet.

### 2026-04-19 — Tailwind CSS only (no CSS Modules)
**Decision**: All styling via Tailwind utility classes. No CSS Modules, no styled-components, no inline `style` props. One exception: `.tb-gradient` is a global CSS class in `globals.css` because Tailwind's JIT cannot express multi-stop radial gradients cleanly.
**Why**: Project was started with Tailwind; consistency requires sticking with one system.
**Alternatives considered**: CSS Modules for complex components — rejected to keep a single styling mental model.

### 2026-04-19 — Google Sheets for intake (no database)
**Decision**: Intake form submissions POST to `/api/intake` which writes to a Google Sheet via `googleapis` using a service account JWT.
**Why**: Simple ops; gives the business owner a familiar spreadsheet interface without running a database.
**Alternatives considered**: Airtable, Supabase — more setup than needed for MVP.

### 2026-04-19 — Automatic priority scoring in intake API
**Decision**: The API route computes `priority_score` (1–3) and `lead_type` (standard / high-intent / elite) server-side before appending to Google Sheets.
**Why**: Avoids manual triage in the spreadsheet; makes high-value leads immediately visible.
**Alternatives considered**: Doing scoring in a spreadsheet formula — fragile if columns shift.

### 2026-04-19 — Button component extends Next.js Link (not <button>)
**Decision**: `src/components/ui/Button.tsx` wraps `next/link`. For non-navigation click handlers, copy Tailwind class strings onto a native `<button>` element instead of extending Button.
**Why**: Most buttons in the site navigate to a route; wrapping Link avoids duplicating href logic.
**Alternatives considered**: Polymorphic `as` prop — added complexity not needed at this stage.

### 2026-04-19 — Named exports only for components
**Decision**: All components use named exports. No default exports.
**Why**: Consistent import style; prevents import name drift across the codebase.
**Alternatives considered**: Default exports — common in Next.js pages (`app/` pages are the exception and still use default exports as required by the framework).

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

### 2026-04-25 — Lime accent on "Evolve!" in headline + Spring Intake badge
**Decision**: Headline reads "Where Athletes [Evolve!]" with #B4E655 lime accent on "Evolve!". A small pulsing-dot pill ("Spring Intake is Live") sits above the headline.
**Why**: Adds brand-correct color to the hero without overusing lime; the badge creates immediacy.
**Alternatives considered**: Whole headline in lime — too loud.

### 2026-04-25 — Three.js particle wave hero background (deathfang/WxNVoq port)
**Decision**: `CourtBackground.tsx` is now a faithful port of the CodePen deathfang/WxNVoq particle-wave demo, using modern Three.js (BufferGeometry + Points + custom shader).
**Why**: Owner specifically requested this animation as the visual reference. Tennis-court-receding-into-distance feel without literal court lines.
**Alternatives considered**: Original canvas-2D court sweep — replaced; flat (non-perspective) wave — owner wanted the depth.

### 2026-04-25 — Hero animation: camera elevated, vertical lock, half-strength rotation, per-particle cursor bounce
**Decision**: Camera at y=350 looking down at wave plane. Vertical axis locked (no Y mouse follow). Horizontal mouse follow at 0.5× amplitude, easing 0.06. Particles within ~300 world units of cursor get a gaussian-falloff bounce.
**Why**: Owner found full-strength rotation too aggressive and wanted localized particle interaction in addition to camera pan.
**Alternatives considered**: Higher amplitude rotation — too dizzying; no bounce — felt unresponsive.

### 2026-04-25 — Hero player centered (not right-aligned), enlarged
**Decision**: Player image at 640px tablet / 720px desktop, justified to start of right column with negative left margin (md:-ml-16 lg:-ml-24) to pull toward page center.
**Why**: Matches Figma; the right-column layout felt too "SaaS hero" and the player's court base needed more visual weight.
**Alternatives considered**: Fully centered overlapping wordmark — too dramatic for current state.

### 2026-04-25 — /login button removed from Navbar
**Decision**: Removed the Login/Register button entirely. Auth is a much larger rebuild and a stub page would be misleading.
**Why**: The button linked to /login which 404'd in production. Better to remove than fake it.
**Alternatives considered**: Build a stub login page — rejected; auth.js scaffolding will come later as part of full registration build.

### 2026-04-25 — Footer hides "#" social URLs
**Decision**: Footer.tsx filters site.socials and only renders entries where href !== "#". When real URLs are added, they appear automatically.
**Why**: Don't fake social links; don't render dead links either.
**Alternatives considered**: Inventing placeholder URLs — rejected.

### 2026-04-25 — Removed placeholder "Head Coach" coach #2
**Decision**: coaches.ts now has just Sina Kassaian until a real second coach is filled in.
**Why**: Don't display fake bios. Honest > complete.
**Alternatives considered**: "Coming soon" placeholder — rejected for cleanliness.

### 2026-04-25 — Vercel hobby tier, default URL tennisbootcamp-seven.vercel.app
**Decision**: Project deployed on Vercel via theoricle's projects (Hobby plan). Production URL is `tennisbootcamp-seven.vercel.app` (bare `tennisbootcamp.vercel.app` was already taken). Custom domain tennisbootcamp.ca to be added later.
**Why**: Vercel auto-deploys on push to main; PR previews come for free.
**Alternatives considered**: Other hosts — Vercel is the natural choice for Next.js.

### 2026-04-25 — three package + three.d.ts fallback (no @types/three yet)
**Decision**: Three.js is installed as a runtime dependency. Type declarations come from `src/types/three.d.ts` which declares the module as `any` — the Vercel strict build couldn't resolve three's bundled types.
**Why**: Quick unblock for Vercel build. Animation only uses a small surface of three.js.
**Alternatives considered**: Adding @types/three properly — possible later when richer type usage is needed.

### 2026-05-04 — Project moved out of OneDrive
**Decision**: Project moved from `C:\Users\farib\OneDrive\Documents\Claude\Projects\Tennnis Bootcamp\site\` to `C:\Users\farib\tennisbootcamp\`. OneDrive folder no longer in active use.
**Why**: OneDrive's filesystem behavior was causing intermittent file-truncation and null-byte corruption when files were written from the agent sandbox.
**Alternatives considered**: Excluding the project folder from OneDrive sync — owner is not signed into OneDrive anyway, the path itself was the issue.

### 2026-05-04 — Use Claude Code as primary driver, Cowork only for browser/design
**Decision**: Code-only work (components, animations, fixes, refactors) is done via Claude Code in the terminal. Cowork is used only for browser-driven workflows (Vercel UI, Figma reference, design review).
**Why**: Cowork's browser control and file-mount overhead burns ~10–50× more tokens per turn than Claude Code for equivalent code work.
**Alternatives considered**: All-Cowork — repeatedly hit usage limits.
