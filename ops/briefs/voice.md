# Voice Profile — Tennis Bootcamp

Operational voice guide for every word a visitor, player, or parent reads: page copy, button labels, form helper text, validation messages, emails, and metadata. Distilled from `ops/briefs/brand.md` plus the owner's editorial corrections of 2026-08-02. Load this file before writing or rewriting any user-facing string, in any tool, with any model.

Last updated: 2026-10-12 (audit PR N: locations — Newtonbrook Tennis Club named, location first)

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
6. **No stale promises.** Copy must describe the funnel as it works today: quiz first, groups open to join. A player picks the group that fits their age and level, or takes the 2-minute quiz and our coaches place them; the quiz is how they ask for the spot, an emailed invitation holds it while they enroll, and the coach confirms the level on court in week one (see Joining flow below). High Performance is by approval: the quiz, then our coaches' approval. The 20-minute on-court assessment is optional, for anyone who wants certainty before paying, and never a step every player must take (owner 2026-10-02, 2026-10-12). Never say or imply that every player starts with, or is placed by, the assessment. A claim the product no longer delivers is a voice failure even if the sentence is pretty.
7. **Consistent product vocabulary.** "Take the 2-minute quiz" (primary CTA, opens the intake wizard; owner 2026-10-02) · "Book Your Assessment" (the optional assessment button, exact casing) · "the 2-minute quiz" (the intake wizard) · "cohort" (a scheduled program group) · "enroll" (never "enrol"/"register" in body copy) · "Browse Programs" (secondary programs CTA) · "our coaches" / "your coach" / "the coaching team" (who places, sets levels and confirms payments; see Staff wording below) · "Open to join" (a group's chip) and "By approval" (High Performance's chip and how it is joined) · "provisional" (a level from the quiz or a placement, until our coaches confirm it on court in week one). One name per thing, everywhere, including emails.
8. **Exclamation marks: effectively zero.** The tagline "Where Athletes Evolve!" is the single grandfathered exception. Nothing else gets one.

## Locked strings — never rewrite

- All prices (2026-10-01, backlog #20; lineup 2026-10-12): weekend classes **$35 a session** · **$210 per six-week cohort** (every Youth Bootcamps and Adult Bootcamps group, High Performance included) · Assessment **$20** · Private Lessons **"Rates on request"** (owner, 2026-10-12; never a number). Kids' Summer Camp ($499/week) left the catalog on 2026-10-12 and is not listed anywhere. The $20 mechanic on program pages: "$35 a session, $210 for the six weeks. If you took the $20 assessment, that $20 comes off the price."
- The three programs and their names (owner, 2026-10-12): **Youth Bootcamps** (slug `youth-programs`), **Adult Bootcamps** (slug `bootcamps`), **Private Lessons** (slug `private-lessons`). "Youth Programs" is retired as a name. **High Performance** is a group inside Youth Bootcamps, never a program; the group names are the card titles in `src/content/programs.ts` ("Ages 7–10", "Ages 11–15", "High Performance", "Newer players", "Intermediate", "Advanced", "One-to-one coaching").
- The cohort length and every total that depends on it (the cohort price, the instalment, "six weeks", "six-week") come from `SESSION_PRICE` and `COHORT_WEEKS` in `src/content/programs.ts` (backlog #27). The numbers quoted in this file are today's values at `COHORT_WEEKS = 6`; if the setting changes, the site follows it and these quotes follow the site. In code, never type the length or a total — use the exported constants.
- Retired 2026-10-01: Bootcamps **$649** and Group Lessons **$599**. Do not quote either price anywhere.
- The $20 mechanic and its condition (comes off the price **when you enroll in a program afterward**) — rephrase length, never the facts.
- ~~Refund policy numbers: 7-day full refund; 50% refund or full credit at 3–6 days; $25 admin fee.~~ **SUPERSEDED 2026-09-07** by the interim Program Policies (`/legal/refund-policy`, values in `src/content/policies.ts`): 10-day no-reason cancellation with no fee inside it, counted from the later of the written agreement and the first session, so it always ends after the cohort has started. Once a cohort has started, missed sessions are not refunded and sessions we cancel are made up inside the make-up window or become account credit. The $25 fee and the 50% tier are retired (owner, 2026-10-02) and no longer locked. Locked: 10 days, $105 (2 × $105 instalments).
- The sentence **"Built for athletes who want to compete."** — verbatim, hero subhead.
- The hero line "A system that makes progress inevitable." (owner-chosen 2026-08-02 replacement for "Real reps. Real progress.").
- Preview-banner text (`PreviewBanner.tsx`).
- All legal text: `/legal/waiver`, `/legal/refund-policy` (lawyer-gated).
- Club-membership copy in `src/lib/membership.ts` (decision-gated, toggle-shipped).
- Tagline "Where Athletes Evolve!" and the seven tier names, low to high: **Beginner, Novice, Intermediate, Advanced, Elite, Pro, World Class** (owner, 2026-10-12; they replaced the tennis-score names Love → Grand Slam, which are retired and never shown). The names live once, in `src/lib/tiers.ts`; copy that names the whole ladder reads `TIER_LADDER_SPAN` ("Beginner to World Class") instead of typing it.
- The quiz's self-estimate answers: "Just starting out", "I can rally", "I play competitively", "Tournament player", "Not sure", "Prefer not to say". "Tournament player" (2026-10-12) replaced "Elite — high-performance track" so no answer reuses a tier name for a different tier.
- The coach title: **Program Coordinator / High Performance Coach** (owner, 2026-10-12; never "Head Coach"). It shows only with the coach's name, on the coach card and in the JSON-LD Person.
- Our location (owner, 2026-10-12): **Newtonbrook Tennis Club**, **North York, Toronto**. The name and area live once, in `src/content/locations.ts` (see Locations below).

## Surface-specific notes

- **Buttons**: verb-first, outcome-named. "Book Your Assessment" (the one label for every assessment button, /assessment included), "Continue to payment", "Request a time". No "Submit"-style labels on marketing surfaces (wizard-final "Submit" inside the quiz is acceptable chrome).
- **Validation & errors**: state what's wrong and the one way out. Always offer info@tennisbootcamp.ca as the human fallback on submit failures. Never blame the user.
- **Empty states**: say what's true and what happens next ("Groups are forming. Cohort dates aren't public yet." then the next step: take the 2-minute quiz, or leave your email). Never a dead end.
- **Emails**: greet by first name, one idea per paragraph, sign off "See you on the court," then "The Tennis Bootcamp coaching team" (owner, 2026-10-12), in HTML and plain text alike. Emails speak as "we", never "I". Subjects state the fact ("You're booked: {date} at {time}"), not the pitch. HTML and plain-text bodies must say the same thing.
- **Metadata / OG descriptions**: one or two sentences, geography + mechanic, no scarcity theatrics. These are the coach's handshake in a search result.

## Before → after (from this site)

Every pair below is an actual string from the codebase; the "after" is the shipped or 2026-08-02-pass rewrite. A row marked **SUPERSEDED** is no longer on the site: keep it for the "why", never copy its "after" back.

| # | Before | After | Why |
|---|--------|-------|-----|
| 1 | Real reps. Real progress. (hero subhead) | A system that makes progress inevitable. | Owner cut it: "real" is superfluous filler; the replacement says what the product does. |
| 2 | $20, credited to your first program | The assessment is $20 — enroll in a program afterward and that $20 comes off the price. | Owner required the mechanic spelled out; "credited" assumes the reader already understands the ledger. |
| 3 | Real reviews from real athletes — names changed during pre-launch. (testimonials footnote) | Names changed during pre-launch. | Double "real" is the exact filler pattern the owner cut; the disclosure is the only load-bearing part. |
| 4 | Elite tennis coaching for competitive players in Toronto. Two locations — North York and Downtown. Limited spots — complete the intake to get priority placement. (site meta) | Weekend tennis classes in Toronto for juniors, teens and adults. Take the 2-minute quiz and our coaches place you. The 20-minute assessment is optional. | "Limited spots" is manufactured scarcity; "Two locations — North York and Downtown" was factually wrong at the time (since 2026-10-12 we train at one club, in North York: see Locations); the intake-priority promise is the pre-pivot funnel. The 2026-08 rewrite ("Every player is placed by a 20-minute on-court assessment") went stale when the quiz became the funnel (2026-10-02). |
| 5 | Where are you in your tennis journey? (quiz step) | Where's your game right now? | "Journey" is lifestyle/SaaS-speak; the coach asks about your game. Also matches the booking form's identical question. |
| 6 | Athletes who complete the intake are placed first as programs form. (trust bar) | Every player is placed by level and schedule from the 2-minute quiz. The 20-minute on-court assessment is optional, if you want your level confirmed first. | Stale promise; our coaches place every player from the quiz, and the assessment is optional. The 2026-08 rewrite ("Every player hits with the coach before joining a group") described an assessment-first funnel that no longer exists. |
| 7 | Adult group lessons that actually move the needle. (program card) | Adult lessons capped at six per court — more reps, more feedback, week-over-week progression. | "Actually move the needle" is cliché plus filler intensifier; the cap and cadence are the concrete facts underneath it. |
| 8 | Next batch being finalized now (events heading) | ~~The next season's schedule is being finalized~~ **SUPERSEDED 2026-10-09** (audit L14): now "Groups are forming. Cohort dates aren't public yet." | "Batch" is factory vocabulary, not coaching vocabulary. The 2026-08 "after" went stale: program pages publish a timetable, so "being finalized" contradicted it. |
| 9 | drop your email and we'll send you the lineup before public registration opens (events body) | ~~leave your email and we'll send you the schedule before registration opens~~ **SUPERSEDED 2026-10-09** (audit L14): now "leave your email and we'll tell you when a cohort opens." | "Drop your email" is casual startup diction; the commitment stays, the slang goes. The 2026-08 "after" also used "registration", which rule 7 bans. |
| 10 | You've got a strong profile (recommendation email, no-match fallback) | Thanks for telling us about your game | Empty flattery — the coach hasn't seen you play yet, so the claim is unearned. |
| 11 | If weather cancels your slot, you rebook free — no charge lost. (assessment FAQ) | If weather cancels your slot, you rebook free — your $20 stays with your booking. | "No charge lost" is awkward and vague; the rewrite says exactly where the money sits. |
| 12 | Camps near you (dashboard column of training venues) | Where we train | The column lists venues, not camps — the label was making a claim the content doesn't. |
| 13 | You're enrolled in all available programs! (dashboard empty state) | You're enrolled in every available program. | Exclamation-mark hype on a plain fact; the period is the premium version. |
| 14 | No open times are posted right now — but that doesn't stop you. (booking empty state) | No open times are posted right now. Tell us when you play and we'll coordinate your time directly. | "Doesn't stop you" is pep-talk filler; the rewrite is the actual next step. |
| 15 | Take the 2-minute quiz and Sina places you by level and schedule. (every placement line) | Take the 2-minute quiz and our coaches place you by level and schedule. | Staff wording (owner, 2026-10-12): the site speaks for the coaching team, not one coach. |
| 16 | You're a Deuce. (assessment-complete email) | You're in the Intermediate tier. | Plain level names (2026-10-12); "a" or "an" before a tier name breaks on Intermediate, Advanced and Elite, so the sentence names the tier instead. |
| 17 | Be first to know when new sessions open. We'll reach out when programs matching your level become available. (newsletter box) | Be first to know when a new cohort opens. Leave your email and we'll tell you when one opens. | The form takes an email and no level, so it cannot match anyone to anything (QA 2026-10-10). "Sessions" also crossed the locked "cohort" vocabulary. |
| 18 | From your answers. Our coaches confirm your tier when they place you. (quiz result) | From your answers, so it stays provisional until our coaches confirm your level on court in week one. | Joining flow (2026-10-12): the level is checked on court in week one, so the quiz's tier is named provisional until then, with the moment it stops being one. |
| 19 | Want certainty first? Book Your Assessment — $20, credited to your program (joining-flow brief) | Want certainty first? The assessment is optional: 20 minutes on court for $20, and if you enroll in a program afterward that $20 comes off the price. | Rule 2: "credited" is the banned shorthand; the mechanic is spelled out, and "optional" says it is never a step. |

## Joining flow (owner, 2026-10-12)

Groups are open to join for anyone whose age and level fit, and the coach confirms the level on court in week one. The strings live once, in `src/content/programs.ts` (`RIGHT_GROUP_PROMISE`, `RIGHT_GROUP_PROMISE_SHORT`, `APPROVAL_LINE`, `ASSESSMENT_CERTAINTY_LINE`), and the section in `src/components/sections/HowJoiningWorks.tsx`; `npm test` (`test-joining-flow.ts`) pins them.

- **How joining works**, three steps, on `/programs` and every program page with fixed classes (never on Private Lessons, which has no group to pick or move between): 1. "Pick a group that fits your age and level" (not sure? the 2-minute quiz, and our coaches place you) · 2. "Reserve your spot" (the quiz is how you ask; we email an invitation with the dates and price and hold the spot while you enroll) · 3. "Your coach confirms your level" (on court, in week one, then the promise below).
- **The right-group promise.** The facts, rephrased for length but never changed: the coach confirms the level on court in week one; if another group fits better, we move the player to it at the same price; if none does, we refund in full. On a group card it is the "Week 1" row. It must never contradict the Program Policies (`src/content/policies.ts`: a full refund within 10 days, counted from the later of the written agreement and the first session, so week one is always inside that window), and it adds no legal terms: no day counts, no fees, no percentages. The policy sentence for move-or-refund goes to counsel before public launch; until then the policy text is not touched.
- **High Performance is by approval:** "By approval" on its chip; "Take the 2-minute quiz and our coaches approve each spot. No assessment needed." Every other group reads "Open to join" (or its next cohort's date).
- **Levels are provisional until week one.** The quiz result's tier and a dashboard placement say "provisional" and name the moment it ends: "until our coaches confirm … on court in week one". The dashboard says "our coaches", never "your coach" (staff wording).
- **The assessment is for certainty, not a step:** "Want certainty first?" then the $20 mechanic in full (rule 2), and the exact label "Book Your Assessment". Never "credited", and never a word that makes it a step ("required", "start with").

## Locations (owner, 2026-10-12)

"Right now we are only at Newtonbrook Tennis Club in North York"; "People need to choose location first." The club is named everywhere a player asks where: `/programs` opens with "Where do you want to train?", group cards and program pages show the club, the enroll summary and its confirmation show the Location first, the dashboard's "Where we train" card names it, the home page has an "Our location" section, and `/locations` ("Our Locations") lists what runs there. The data lives once, in `src/content/locations.ts`; `npm test` (`test-locations.ts`) pins it.

- **Say only what the owner gave:** the club's name and its area ("Newtonbrook Tennis Club" · "North York, Toronto"). No street address, hours, court counts or parking until the owner provides them. The map link is a Google Maps search for the club, labelled "Open in Google Maps", never a typed address.
- **Words:** "location" for the choice and the page ("Where do you want to train?", "Our Locations"), "club" in running text. Never "venue" or "facility" on the site.
- **One location, said plainly:** "Right now we train at one club" and "All our training is here right now: …" are true only while there is one; the code drops them when a second is added. Never promise more locations.
- **Club membership stays neutral (D19):** the locked line in `src/lib/membership.ts` (`membershipNote()`). Never say a player must, or need not, hold the club's membership.
- **Retired:** the venue stand-in ("Court details and any club requirements are confirmed in your booking email." as a *location*: it stays only as the neutral club-membership line) and the invitation's "Court details are confirmed in your enrollment email."; both places now name the club.

## Staff wording (owner, 2026-10-12)

The site speaks for the coaching team. Placement, levels and payments are "our coaches", "your coach" or "the coaching team"; emails say "we" and sign off as the coaching team. The coach's name appears only on the coach card (home and About, with the title "Program Coordinator / High Performance Coach") and where the law asks for the supplier to be named: the CASL sender line on emails and the privacy policy. Never write a coach's first name into a placement line, a dashboard state, a form label or an email body.

## Positioning ruling: all levels welcome (2026-08-04)

The brand welcomes every level. The training is serious from Beginner to World Class; our coaches place every player by level and schedule, and the $20 on-court assessment is optional; **High Performance is the explicitly competitive track** (moved from Bootcamps 2026-10-01; "track", not "tier", since 2026-10-09 so it never reads as one of the seven tiers, owner default D15) and may keep its competitive framing. Never tell a beginner to go elsewhere — the old About line "If you're not preparing to compete, there are better programs out there" is the banned pattern. The locked hero sentence "Built for athletes who want to compete." stands unchanged; it states ambition, not a gate. Sentence fragments as a style device are owner-approved — keep them.

## Jargon budget (2026-08-04)

Tournament dialect is allowed **only on High Performance surfaces** (the High Performance group card and its note, the Youth Bootcamps page's line about that group, and High Performance recommendation reasons; moved from Bootcamps 2026-10-01, a youth group since 2026-10-12). On all-levels surfaces (the other Youth Bootcamps groups, Adult Bootcamps, Private Lessons, About, intake, assessment pages) translate insider terms to plain language:

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
