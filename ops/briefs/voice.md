# Voice Profile — Tennis Bootcamp

Operational voice guide for every word a visitor, player, or parent reads: page copy, button labels, form helper text, validation messages, emails, and metadata. Distilled from `ops/briefs/brand.md` plus the owner's editorial corrections of 2026-08-02. Load this file before writing or rewriting any user-facing string, in any tool, with any model.

Last updated: 2026-08-04

---

## The voice in one line

A world-class coach speaking plainly to a motivated player.

Not a salesperson. Not a tech company. Not a hype account. The coach has nothing to prove and no reason to oversell — the training speaks, the copy just tells you what happens, what it costs, and what you leave with.

## The four traits (from brand.md)

- **Welcoming** — direct address ("you", "your game"), no gatekeeping tone, no jargon a first-time player wouldn't know.
- **Serious** — statements, not exclamations. Commitments ("we'll reach out within a day"), not vibes.
- **Athletic** — the language of training: reps, court, level, schedule, block, session. Verbs over adjectives.
- **Premium** — restraint. Short sentences. No begging for the sale, no urgency theatrics, no emoji.

## Hard rules

1. **No filler intensifiers.** "Real", "really", "truly", "actually", "very", "super" almost never earn their place. Owner precedent: he cut "Real reps. Real progress." from the hero as unclear filler — "real" is a superfluous word. If the sentence survives without the intensifier, delete the intensifier. (Exception: an intensifier that carries a factual contrast may stay, but the default is delete.)
2. **Mechanics always explicit.** Never compress a money or policy mechanic into shorthand a first-time reader could misread. Owner precedent: "credited to your first program" was banned; the required phrasing spells it out — *the assessment costs $20, and if you enroll in a program afterward that $20 comes off the price.* Short surfaces (hero microcopy, meta descriptions) may tighten it, but never below "join a program after and it comes off the price." The same rule applies to refunds, make-ups, and membership: say the number, the condition, and who pays whom.
3. **Concrete over clever.** A specific fact beats a slogan: "Six per court" beats "small groups you'll love"; "20 minutes on court with the coach" beats "a personalized evaluation experience." Cleverness is allowed only when it lands on something true and specific ("Twenty minutes decides the next season of your game" earns its place because the mechanic sits right beside it).
4. **No salesperson hype.** No manufactured scarcity ("limited spots!"), no empty flattery ("you've got a strong profile"), no "unlock", "supercharge", "elevate", "take it to the next level". A single factual scarcity line ("2 spots left", computed from data) is fine; invented urgency is not.
5. **No SaaS-speak.** No "journey", "experience" (as a noun for a product), "seamless", "solution", "platform", "empower". A player has a game and a schedule, not a journey.
6. **No stale promises.** Copy must describe the funnel as it works today (assessment-first, coach-assigned levels). A claim the product no longer delivers is a voice failure even if the sentence is pretty.
7. **Consistent product vocabulary.** "Book Your Assessment" (primary CTA, exact casing) · "the 2-minute quiz" (the intake wizard) · "cohort" (a scheduled program group) · "enroll" (never "enrol"/"register" in body copy) · "Browse Programs" (secondary programs CTA). One name per thing, everywhere, including emails.
8. **Exclamation marks: effectively zero.** The tagline "Where Athletes Evolve!" is the single grandfathered exception. Nothing else gets one.

## Locked strings — never rewrite

- All prices: Bootcamps **$649** · Kids Camp **$499/week** · Group Lessons **$599** · Assessment **$20**.
- The $20 mechanic and its condition (comes off the price **when you enroll in a program afterward**) — rephrase length, never the facts.
- Refund policy numbers: 7-day full refund; 50% refund or full credit at 3–6 days; $25 admin fee.
- The sentence **"Built for athletes who want to compete."** — verbatim, hero subhead.
- The hero line "A system that makes progress inevitable." (owner-chosen 2026-08-02 replacement for "Real reps. Real progress.").
- Preview-banner text (`PreviewBanner.tsx`).
- All legal text: `/legal/waiver`, `/legal/refund-policy` (lawyer-gated).
- Club-membership copy in `src/lib/membership.ts` (decision-gated, toggle-shipped).
- Tagline "Where Athletes Evolve!" and tier names (Love → Grand Slam).

## Surface-specific notes

- **Buttons**: verb-first, outcome-named. "Book my 20-minute assessment", "Continue to payment", "Request a time". No "Submit"-style labels on marketing surfaces (wizard-final "Submit" inside the quiz is acceptable chrome).
- **Validation & errors**: state what's wrong and the one way out. Always offer info@tennisbootcamp.ca as the human fallback on submit failures. Never blame the user.
- **Empty states**: say what's true and what happens next ("Sessions for the upcoming season are being scheduled — check back soon."). Never a dead end.
- **Emails**: greet by first name, one idea per paragraph, sign off "See you on the court, — Sina Kassaian, Head Coach". Subjects state the fact ("You're booked: {date} at {time}"), not the pitch. HTML and plain-text bodies must say the same thing.
- **Metadata / OG descriptions**: one or two sentences, geography + mechanic, no scarcity theatrics. These are the coach's handshake in a search result.

## Before → after (from this site)

Every pair below is an actual string from the codebase; the "after" is the shipped or 2026-08-02-pass rewrite.

| # | Before | After | Why |
|---|--------|-------|-----|
| 1 | Real reps. Real progress. (hero subhead) | A system that makes progress inevitable. | Owner cut it: "real" is superfluous filler; the replacement says what the product does. |
| 2 | $20, credited to your first program | The assessment is $20 — enroll in a program afterward and that $20 comes off the price. | Owner required the mechanic spelled out; "credited" assumes the reader already understands the ledger. |
| 3 | Real reviews from real athletes — names changed during pre-launch. (testimonials footnote) | Names changed during pre-launch. | Double "real" is the exact filler pattern the owner cut; the disclosure is the only load-bearing part. |
| 4 | Elite tennis coaching for competitive players in Toronto. Two locations — North York and Downtown. Limited spots — complete the intake to get priority placement. (site meta) | Tennis training in Toronto for players who want to compete — Midtown and Downtown. Every player is placed by a 20-minute on-court assessment: $20, and it comes off the price when you enroll in a program. | "Limited spots" is manufactured scarcity; "North York" was factually wrong; the intake-priority promise is the pre-pivot funnel. |
| 5 | Where are you in your tennis journey? (quiz step) | Where's your game right now? | "Journey" is lifestyle/SaaS-speak; the coach asks about your game. Also matches the booking form's identical question. |
| 6 | Athletes who complete the intake are placed first as programs form. (trust bar) | Every player hits with the coach before joining a group — levels are assigned on court, not self-reported. | Stale pre-pivot promise; placement now comes from the assessment, and the rewrite states that mechanic. |
| 7 | Adult group lessons that actually move the needle. (program card) | Adult lessons capped at six per court — more reps, more feedback, week-over-week progression. | "Actually move the needle" is cliché plus filler intensifier; the cap and cadence are the concrete facts underneath it. |
| 8 | Next batch being finalized now (events heading) | The next season's schedule is being finalized | "Batch" is factory vocabulary, not coaching vocabulary. |
| 9 | drop your email and we'll send you the lineup before public registration opens (events body) | leave your email and we'll send you the schedule before registration opens | "Drop your email" is casual startup diction; the commitment stays, the slang goes. |
| 10 | You've got a strong profile (recommendation email, no-match fallback) | Thanks for telling us about your game | Empty flattery — the coach hasn't seen you play yet, so the claim is unearned. |
| 11 | If weather cancels your slot, you rebook free — no charge lost. (assessment FAQ) | If weather cancels your slot, you rebook free — your $20 stays with your booking. | "No charge lost" is awkward and vague; the rewrite says exactly where the money sits. |
| 12 | Camps near you (dashboard column of training venues) | Where we train | The column lists venues, not camps — the label was making a claim the content doesn't. |
| 13 | You're enrolled in all available programs! (dashboard empty state) | You're enrolled in every available program. | Exclamation-mark hype on a plain fact; the period is the premium version. |
| 14 | No open times are posted right now — but that doesn't stop you. (booking empty state) | No open times are posted right now. Tell us when you play and we'll coordinate your time directly. | "Doesn't stop you" is pep-talk filler; the rewrite is the actual next step. |

## Positioning ruling: all levels welcome (2026-08-04)

The brand welcomes every level. The training is serious from the Love tier to Grand Slam; everyone starts with the same $20 on-court assessment; **Bootcamps is the explicitly competitive tier** and may keep its competitive framing. Never tell a beginner to go elsewhere — the old About line "If you're not preparing to compete, there are better programs out there" is the banned pattern. The locked hero sentence "Built for athletes who want to compete." stands unchanged; it states ambition, not a gate. Sentence fragments as a style device are owner-approved — keep them.

## Jargon budget (2026-08-04)

Tournament dialect is allowed **only on Bootcamps-specific surfaces** (the Bootcamps card, its detail page content, and Bootcamps-targeted recommendation reasons). On all-levels surfaces (Group Lessons, Kids' Camp, About, intake, assessment pages) translate insider terms to plain language:

| Insider term | Plain replacement |
|---|---|
| live-ball patterns | realistic rally play |
| serve+1 | serve plus the next shot |
| shot tolerance | staying steady through long points |
| point construction | building points on purpose |
| S&C block | strength-and-conditioning session |
| physical-literacy & agility games | movement and agility games |
| benchmarked | measured at the start and end |

"Cohort" is locked vocabulary and stays everywhere — but where it first appears on an all-levels page, add a one-line plain definition: *a fixed group that trains together for six weeks* (canonical placement: the About hero).

## Checklist before shipping any string

1. Would a world-class coach say this out loud to a player? If it sounds like a landing page, rewrite.
2. Is every money/policy mechanic explicit — number, condition, direction?
3. Any intensifier that dies without changing meaning? Delete it.
4. Does it describe the funnel as it works **today**?
5. Same vocabulary as the rest of the site (enroll / cohort / assessment / 2-minute quiz)?
6. Locked strings untouched?
