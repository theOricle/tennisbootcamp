# Tennis Bootcamp — Growth & Optimization Stack Recommendations

_Prepared 2026-06-17 (Cowork research pass). Mapped to the current stack: Next.js 16, Supabase, Stripe, Resend, MailerLite, GA4, Google Sheets intake, Vercel. Goal: maximise intake → enrollment conversion and unlock paid + organic acquisition — without bolting on redundant tools._

## Guiding principle

You already have analytics (GA4), email (MailerLite + Resend), payments (Stripe), and auth/DB (Supabase). The real gaps are: (1) seeing **why** visitors drop off, (2) tracking conversions so paid ads are viable, (3) local **organic** visibility, and (4) a real lead pipeline instead of a spreadsheet. Add a small, high-ROI set — not fifteen tools.

---

## Tier 1 — Do first (high ROI, low effort)

### 1. Microsoft Clarity — UX/conversion insight (FREE)
- Heatmaps + session replay + rage/dead-click detection. Unlimited, free forever, native GA4 integration. (30-day replay retention.)
- **Why:** you just rebuilt the funnel — Clarity shows exactly where people abandon intake/enroll on real devices, including the mobile flows that were never walked end-to-end.
- **Integration:** one script tag in the Next.js root layout. ~30 min via Claude Code.

### 2. Ad conversion tracking — Google Ads + Meta (prerequisite to any paid spend)
- You already fire GA4 events (`intake_complete`, `enroll_complete`). Wire them as conversions: Google Ads **enhanced conversions** (hashed first-party email/phone — which you already collect) + Meta **Pixel & Conversions API**.
- **Why:** without this, paid ads are flying blind. Set it up now, turn ads on after launch.
- **Integration:** GTM (recommended) or gtag/Pixel in code; server-side CAPI later for accuracy. Medium effort.
- **Guardrail:** gate behind consent + the `NEXT_PUBLIC_PREVIEW_MODE` flag so you don't fire real conversions while in test mode.

### 3. Local SEO — structured data + Google Business Profile
- Add JSON-LD: `LocalBusiness` (per venue), `Course` (per program), `Event` (per cohort). These power rich results and feed Google + AI local search.
- Claim + optimise a **Google Business Profile** (drives "tennis lessons near me" and Maps). Free.
- **Why:** you're a local Toronto business — this is the highest-ROI *organic* channel. You already have metadata/OG/sitemap but no LocalBusiness/Course schema.
- **Integration:** JSON-LD components in Next.js (code); GBP is off-site setup. Low–medium effort.
- **Caveat:** venues are still placeholders — venue schema must wait for confirmed partnerships.

---

## Tier 2 — High value, more effort / after launch

### 4. Real CRM for the lead pipeline — HubSpot (free tier)
- Leads currently land in a Google Sheet. A CRM adds pipeline stages, follow-up automation, and lead scoring — and you already compute `priority_score`/`lead_type`, so you're halfway there.
- HubSpot free: unlimited contacts, forms, email, pipeline; has a Claude MCP connector (chat with your CRM).
- **Why:** converting captured leads → paid enrollments is the biggest untapped lever; a spreadsheet doesn't nurture.
- **Effort:** medium — pipe `/api/intake` to HubSpot alongside Sheets (or via Zapier). Decide whether it replaces or complements MailerLite.

### 5. PostHog — product analytics + experiments (if you outgrow Clarity/GA4)
- All-in-one: funnels, session replay, feature flags, A/B testing, surveys. Open-source, generous free tier, Claude MCP connector.
- **Why:** lets you A/B test the funnel changes just shipped and see step-by-step intake drop-off that GA4 doesn't show cleanly.
- **Effort:** medium. Overlaps GA4 — adopt if you want experimentation; otherwise Clarity covers the basics.

---

## Tier 3 — Situational / later (mostly Claude MCP connectors)

- **Semrush or Ahrefs** — keyword/competitor research for content & SEO. Paid. When you invest in content.
- **Local Falcon** — local map-pack rank tracking across a Toronto grid. When local SEO becomes a focus.
- **Supermetrics / Windsor.ai** — pull Google/Meta ad spend & ROAS into Claude for reporting. Once ads run.
- **Motion** — Meta ad-creative analytics + competitor ad-library research. Once running Meta ads.
- **Zapier** — glue: new enrollment → Slack alert / CRM / sheet. Connective tissue.
- **MailerLite MCP / Stripe MCP** — you already use both products; connecting their MCPs lets you manage campaigns/payments from Claude.

---

## Deliberately NOT recommended (avoid redundancy/bloat)

- A second email tool — MailerLite + Resend already cover newsletter + transactional.
- A second payment processor — Stripe is set.
- Heavy enterprise analytics (Mixpanel/Pendo/Amplitude) — overkill now vs Clarity/PostHog.
- A website builder/CMS — your Next.js + typed content model is fine.

---

## Integration map (for the phase-2 audit)

- **Code — Claude Code PRs into the Next.js app:** Clarity script · GA4 → Google Ads/Meta conversion wiring · JSON-LD schema · (PostHog script).
- **Claude MCP connectors — one-click connect:** HubSpot · PostHog · Semrush/Ahrefs · Supermetrics · Local Falcon · MailerLite · Stripe.
- **Off-platform setup — you:** Google Business Profile · Google Ads & Meta Business accounts · CRM account.

## Suggested sequence

1. **This week (cheap, organic + insight):** Microsoft Clarity + JSON-LD schema + Google Business Profile.
2. **Before any ad spend:** wire conversion tracking (Google Ads enhanced conversions + Meta CAPI).
3. **Lead nurture:** stand up the HubSpot pipeline, feed it from intake.
4. **After launch:** turn on ads, add PostHog experiments, connect ad-reporting MCPs.

> Hold real ad conversions and ad spend until the site is actually live — Stripe live keys in, preview banner off, waiver sorted.

---

## Re: GoHighLevel & Meta Ads (researched 2026-06-17)

**Neither has a Claude/MCP connector** — both registry searches returned nothing. So neither is a "plug into Claude" tool; they run in their own dashboards.

### Meta Ads — yes as a channel, no as a plugin
- For local lead-gen, Google Ads (search intent + Google Local Services Ads, pay-per-lead) tends to give higher-quality leads; Meta (IG/FB) is interest/awareness-driven and strong for a visual sport and parents. Best practice: run both — Google to capture high-intent, Meta for awareness + retargeting.
- "Integrating" Meta on your side = install the **Meta Pixel + Conversions API** (code) so ads optimise, and optionally pull Meta data into Claude via Supermetrics/Windsor.ai/Motion. You run the ads in Meta Ads Manager, not via a plugin.

### GoHighLevel — powerful, but probably not for you
- What it is: all-in-one for local service businesses/agencies — CRM, pipelines, funnels/landing pages, booking, email + two-way SMS, missed-call text-back, reputation/review automation, unified inbox. Flat ~$97–297/mo.
- The catch: GHL's value is replacing a patchwork of 5+ tools. You've already built a bespoke Next.js + Supabase + Stripe enrollment funnel + MailerLite. Adopting GHL means duplicating/retiring that custom work, or bolting it on just for CRM/SMS/reviews. Consensus: GHL wins for agencies / SMS-first / consolidators; HubSpot's free CRM fits a single business that just needs a clean CRM layer on an existing custom site.
- It does fill three real gaps you lack: two-way SMS follow-up, missed-call text-back, automated review requests.
- **Verdict:** keep the custom site; don't move the funnel into GHL. Add HubSpot (free CRM) + a focused SMS/review tool (e.g., Twilio) for the gaps. Choose GHL only if you'd rather consolidate ALL marketing/comms/booking into one platform and cut DIY maintenance — a strategic platform bet, with no Claude integration.

## Claude skills/plugins to install (knowledge-work-plugins marketplace)

- **searchfit-seo** (free) — schema-markup, seo-audit, technical-seo, on-page-seo, keyword-clustering, content-strategy, ai-visibility. Directly powers the Tier-1 local-SEO work — generate your LocalBusiness/Course/Event JSON-LD with this.
- **marketing** — campaign-plan, content-creation, draft-content, email-sequence, performance-report, brand-review, competitive-brief. For ad copy, email sequences, content.
- **small-business** — lead-triage, call-list (ranks top leads + talking points), run-campaign, canva-creator (brief → social posts), customer-pulse (review/sentiment monitoring), crm-maintenance, weekly brief. The solo-founder ops layer — turns intake leads into a daily action list before you even commit to a CRM.
