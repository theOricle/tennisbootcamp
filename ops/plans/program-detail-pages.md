# Program Detail Pages — Implementation Spec

Generated: 2026-05-14
Status: ready to implement
Driver: Claude Code in terminal (use `/voice` to dictate)

Goal: build `/programs/[slug]` so each of the three programs has its own page. For "available" programs (Bootcamps), the page leads to enrollment via the existing intake flow. For "coming soon" programs (Kid's Summer Camp, Group Lessons), the page captures interested emails into a new Google Sheets tab.

This is the standing decision from `.claude/memory/DECISIONS.md` (2026-05-04) — must happen before auth/payment work.

---

## 1. Scope

**In scope**
- New dynamic route: `src/app/programs/[slug]/page.tsx`
- Updated `Program` type with `slug`, `longDescription`, `schedule`, `priceCents`, `currency`, `ageGroup`, `location`
- Updated content in `src/content/programs.ts` with real-ish data per program
- New API route: `src/app/api/program-interest/route.ts` → writes to `program_interest` Google Sheet tab
- New section component: `src/components/sections/ProgramInterestForm.tsx` (email capture for coming-soon programs)
- Updated `ProgramsGrid` so each card's "Learn more / Book Now" links to its slug page
- Updated intake page to read `?program=<slug>` and pre-select the program in the form
- Per-program SEO metadata via `generateMetadata`

**Out of scope (deferred)**
- Auth / signup / Stripe Checkout (that's the next planned track)
- Stripe-priced enrollment (Bootcamps still routes through `/intake?program=bootcamps` until enrollment ships)
- Image gallery, testimonials, video sections (Phase 2)

**Non-negotiable**
- Do NOT modify `/api/intake` — only add a new sibling endpoint.
- Do NOT change `.env*`, `.github/workflows/`, `.claude/memory/`.

---

## 2. URL & data model

### Routes

| Slug | Path | State |
|---|---|---|
| `bootcamps` | `/programs/bootcamps` | available — enrollment CTA |
| `kids-summer-camp` | `/programs/kids-summer-camp` | coming soon — email capture |
| `group-lessons` | `/programs/group-lessons` | coming soon — email capture |

The slug must match the existing `id` in `programs.ts`. Add a `slug` field rather than reusing `id` to keep the data model explicit (slugs may diverge from ids later if titles change).

### `Program` type (update `src/types/program.ts`)

```ts
export type ProgramType = "Bootcamp" | "Junior Bootcamp" | "Group Lessons" | "Summer Camp";

export type Program = {
  id: string;
  slug: string;                  // NEW — used in route URL
  title: string;
  description: string;           // unchanged: short, for card grid
  longDescription: string;       // NEW — full paragraph or two for detail page
  type: ProgramType;
  comingSoon?: boolean;
  ctaText: string;
  ctaHref: string;
  imageSrc?: string;

  // NEW — all optional, render only when present
  schedule?: string;             // e.g. "Tuesdays + Thursdays, 6–8pm" or "Weekly cohorts starting Jul 7"
  priceCents?: number;           // e.g. 49500 for $495
  currency?: "CAD" | "USD";      // default "CAD"
  ageGroup?: string;             // e.g. "Ages 12–17", "Adults 18+"
  locationId?: string;           // matches an id in src/content/locations.ts
};
```

### `programs.ts` (update content)

Keep the three entries; add the new fields. Use placeholder copy that Sina can refine — clearly bracketed so it's obvious where the writer should land.

```ts
{
  id: "bootcamps",
  slug: "bootcamps",
  title: "Bootcamps",
  description: "High-intensity group training for measurable improvement.",
  longDescription:
    "Six-week competitive bootcamps for serious players. Two on-court sessions plus one fitness session weekly. " +
    "Stroke mechanics, point construction, mental toughness, and match-play scenarios — assessed against measurable benchmarks. " +
    "Sina Kassaian leads each cohort.",
  type: "Bootcamp",
  comingSoon: false,
  ctaText: "Get Priority Placement",
  ctaHref: "/intake?program=bootcamps",
  imageSrc: "/images/programs/bootcamps.png",
  schedule: "Six-week cohorts, two on-court + one fitness session per week",
  priceCents: undefined,         // priced via intake conversation for now
  currency: "CAD",
  ageGroup: "Ages 14+",
  locationId: "balliol",         // assumes locations.ts has this id; verify
},
{
  id: "kids-summer-camp",
  slug: "kids-summer-camp",
  title: "Kid's Summer Camp",
  description: "Fun, structured training for juniors with fundamentals and confidence.",
  longDescription:
    "Full-day junior tennis camp running through July and August. Stroke fundamentals, match play, " +
    "physical literacy games, and team challenges. Lunch and snacks included. " +
    "Open to all skill levels; juniors are placed in matched groups.",
  type: "Summer Camp",
  comingSoon: true,
  ctaText: "Notify Me When Open",
  ctaHref: "/programs/kids-summer-camp",
  imageSrc: "/images/programs/kids-summer-camp.png",
  schedule: "Weeks running July–August (dates TBA)",
  ageGroup: "Ages 7–13",
  currency: "CAD",
},
{
  id: "group-lessons",
  slug: "group-lessons",
  title: "Group Lessons",
  description: "Adult group lessons with clear progressions and lots of reps.",
  longDescription:
    "Weekly group lessons for adults — 90 minutes, max 6 players per court. Progressions across forehand, " +
    "backhand, serve, return, volleys, and live-ball patterns. Designed for steady improvement, not warm-ups and rallies.",
  type: "Group Lessons",
  comingSoon: true,
  ctaText: "Notify Me When Open",
  ctaHref: "/programs/group-lessons",
  imageSrc: "/images/programs/group-lessons.png",
  schedule: "Weekly evening + weekend slots (schedule TBA)",
  ageGroup: "Adults 18+",
  currency: "CAD",
}
```

(Sina will refine copy later — Claude Code should keep the structure and field shapes exactly.)

---

## 3. New page: `src/app/programs/[slug]/page.tsx`

Server component. Renders different layouts based on `comingSoon`.

**Skeleton:**

```tsx
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { programs } from "@/content/programs";
import { ProgramInterestForm } from "@/components/sections/ProgramInterestForm";
import { Button } from "@/components/ui/Button";
// import the right brand bits — Card, etc. — using existing patterns

type PageProps = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return programs.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const program = programs.find((p) => p.slug === slug);
  if (!program) return {};
  return {
    title: `${program.title} — Tennis Bootcamp`,
    description: program.longDescription.slice(0, 160),
  };
}

export default async function ProgramDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const program = programs.find((p) => p.slug === slug);
  if (!program) notFound();

  // Render layout — see below
}
```

**Layout (both variants):**

Top: dark gradient hero strip (`tb-gradient`) with:
- Program title (h1, white, large)
- Type + ageGroup chip row (e.g. "Bootcamp · Ages 14+")
- One-line description

Body section (max-w-3xl mx-auto px-6 py-12):
- `longDescription` paragraph(s)
- "What's included" / "Schedule" list (if `schedule` present)
- "Location" line (if `locationId` resolves to a location in `locations.ts`)
- "Pricing" line (if `priceCents` set) — else omitted entirely; no "TBA" filler

Bottom CTA section:
- **If `comingSoon: false`** (Bootcamps):
  - Big primary `Button` linking to `program.ctaHref` (which is `/intake?program=bootcamps`)
  - Button text from `program.ctaText`
- **If `comingSoon: true`**:
  - Render `<ProgramInterestForm programSlug={program.slug} programTitle={program.title} />`
  - Heading above form: "Get notified when {title} opens"
  - One-sentence helper: "We'll email you as soon as registration goes live. No spam."

Visual rules:
- Brand color `#B4E655` for primary CTA and accent (already in `Button` variant `primary`)
- Background: keep the dark navy `#061427` from `globals.css`
- No SaaS gradients, no glassmorphism (per `ops/briefs/brand.md`)
- Match the visual density of existing pages — generous whitespace, no walls of text

---

## 4. New component: `ProgramInterestForm`

Lives at `src/components/sections/ProgramInterestForm.tsx`. Client component.

```tsx
"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";

type Props = { programSlug: string; programTitle: string };

export function ProgramInterestForm({ programSlug, programTitle }: Props) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "ok" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setError(null);
    try {
      const res = await fetch("/api/program-interest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, program: programSlug }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setStatus("ok");
    } catch (err) {
      setStatus("error");
      setError("Couldn't save — try again or email info@tennisbootcamp.ca.");
    }
  }

  if (status === "ok") {
    return (
      <p className="text-white/90">
        Thanks. We'll email you when {programTitle} opens.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-md flex-col gap-3 sm:flex-row">
      <input
        type="email"
        required
        placeholder="you@email.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="flex-1 rounded-lg border border-white/10 bg-black/30 px-4 py-3 text-white placeholder:text-white/40 focus:border-[#B4E655] focus:outline-none"
        disabled={status === "submitting"}
      />
      <Button type="submit" variant="primary" disabled={status === "submitting"}>
        {status === "submitting" ? "Saving…" : "Notify me"}
      </Button>
      {error && <p className="text-sm text-red-300">{error}</p>}
    </form>
  );
}
```

(The styling above matches what `EmailCapture` does — Claude Code should look at `src/components/sections/EmailCapture.tsx` and mirror its visual conventions exactly, including any specific padding/border values that differ from the snippet here.)

---

## 5. New API route: `src/app/api/program-interest/route.ts`

Mirror `src/app/api/newsletter/route.ts` byte-for-byte except:

- `const TAB = "program_interest";`
- `const HEADERS = ["timestamp", "email", "program"];`
- Request body shape: `{ email: string, program: string }`
- Append row: `[new Date().toISOString(), body.email ?? "", body.program ?? ""]`

Everything else (env var validation, JWT auth, header-row creation, error handling) is identical. Do NOT abstract these two routes into a shared helper — keep them parallel and obvious. We can refactor when there's a third one.

**Important:** The `program_interest` tab must exist in the Google Sheet before the first production submission. The API will write the header row automatically on first use, but the tab itself must be created manually in the sheet. Add a one-line note about this to `.claude/memory/OPEN_QUESTIONS.md` under "Open" so Sina remembers.

---

## 6. Update existing `ProgramsGrid` cards

Each card currently shows `ctaText` linked to `ctaHref`. After this change:

- Every card's heading or "Learn more" link should point to `/programs/${program.slug}` (the detail page), not the old generic `/programs` placeholder.
- The card CTA button keeps its `ctaText` and `ctaHref` (which now point to `/intake?program=bootcamps` for available, `/programs/kids-summer-camp` etc. for coming-soon).

Effectively: hovering / tapping the card or the "Learn more →" link takes them to the detail page; the primary button takes them to the action (enroll or interest form).

If `ProgramsGrid` currently has only one click target, **add a second** — wrap the card title or image in a `<Link href="/programs/${slug}">`, separate from the button.

---

## 7. Intake page pre-fill from `?program=` param

Currently `/intake/page.tsx` is a multi-step form with internal state. Add:

- Read `searchParams` (or `useSearchParams` for the client component if intake is client-side) for `program` query param.
- On mount, if `program` is one of `bootcamps | kids-summer-camp | group-lessons`, pre-select it in the "programs of interest" step.
- Do NOT auto-submit or skip steps — just pre-fill.

Verify with: `/intake?program=bootcamps` should land on step 1 with Bootcamps already checked in the relevant step.

---

## 8. Files touched (final list)

New:
- `src/app/programs/[slug]/page.tsx`
- `src/app/api/program-interest/route.ts`
- `src/components/sections/ProgramInterestForm.tsx`

Modified:
- `src/types/program.ts` — add new fields
- `src/content/programs.ts` — fill in new fields + update ctaHref values
- `src/components/sections/ProgramsGrid.tsx` — link cards to detail pages
- `src/app/intake/page.tsx` — read `?program=` and pre-select

Untouched (verify in PR):
- `src/app/api/intake/route.ts`
- `src/app/api/newsletter/route.ts`
- Any file under `.claude/`, `.github/`, `.env*`

---

## 9. Test checklist (before committing)

1. `npm run lint` — clean
2. `npx tsc --noEmit` — clean
3. `npm run dev` then visit:
   - `/programs/bootcamps` — renders with primary CTA → `/intake?program=bootcamps`
   - `/programs/kids-summer-camp` — renders with interest form, no CTA button
   - `/programs/group-lessons` — same shape as kids-summer-camp
   - `/programs/does-not-exist` — returns 404
   - `/programs` (the grid) — each card now links to its detail page; primary buttons still work
   - `/intake?program=bootcamps` — Bootcamps pre-selected
4. POST a test email to `/api/program-interest` via curl or dev console; verify it lands in the `program_interest` tab of the Google Sheet (or in the failure path if the tab doesn't exist yet — error message should be clear).
5. SEO check: view page source for each detail page, confirm `<title>` and `<meta description>` are per-program (not the global defaults).
6. Sitemap: `/sitemap.xml` should now list `/programs/bootcamps`, `/programs/kids-summer-camp`, `/programs/group-lessons` in addition to `/programs`. Update `src/app/sitemap.ts` to include them dynamically from `programs.ts`.

---

## 10. Commit shape

One PR, two or three logical commits inside it:

1. `feat(programs): expand Program type with detail fields`
2. `feat(programs): add /programs/[slug] detail pages + program-interest API`
3. `feat(intake): pre-select program from ?program= query param`

PR title: `feat: program detail pages at /programs/[slug]`

---

## 11. Open questions to surface in the PR (not blockers)

- Real prices for Bootcamps — leave `priceCents` undefined for now; PR should not block on this.
- Real dates for Kid's Summer Camp and Group Lessons — leave schedule as placeholder strings; PR should not block.
- The `program_interest` tab must be manually created in the Google Sheet before production launch — flag this in `OPEN_QUESTIONS.md`.
- Update the homepage `ProgramsGrid` to point at the detail pages, not just the `/programs` page.

---

## How to execute this with Claude Code + `/voice`

1. Open PowerShell, `cd C:\Users\farib\tennisbootcamp`.
2. Run `claude` to start a Claude Code session.
3. Type `/voice` to enable voice input.
4. Say (or type): *"Read `ops/plans/program-detail-pages.md` and implement everything in section 8. Follow the test checklist in section 9 before committing. Use the commit shape in section 10. Don't touch anything listed as untouched."*
5. Claude Code reads the spec, asks any clarifying questions, builds it, runs lint+typecheck, commits, and pushes a feature branch.
6. Open a PR via `gh pr create`.
7. Review the PR, merge when CI is green, Vercel auto-deploys.

Realistic time on subscription Claude Pro quota: 30–45 messages of agent activity. Should comfortably fit one 5-hour window.
