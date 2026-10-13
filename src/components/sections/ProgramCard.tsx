import Image from "next/image";
import Link from "next/link";
import type { Program, ProgramGroup } from "@/types/program";
import type { Cohort } from "@/types/cohort";
import { formatCohortSchedule } from "@/lib/cohorts";
import { groupsForProgram } from "@/content/programs";
import {
  formatGroupStart,
  programAgeLabel,
  programEyebrow,
  programLevelRange,
  programLevelTags,
  programStatus,
  type ProgramFit,
  type ProgramStatus,
} from "@/lib/programCatalog";
import { formatTierLevel, levelWithinRange, type TierId } from "@/lib/tiers";
import { LevelTag } from "@/components/tiers";

// The one program card (audit H7; owner 2026-10-12): a spec sheet with a
// photograph of people playing on top — the Court Plates moved to the
// dashboard strip, the admin and the OG card — then the status chip in the
// photo's corner, the eyebrow on a line of its own, the title as the card's
// one link, a two-line description, the decision rows — Ages, When (one line
// per group), Price, Next — on hairlines, and the Levels block: one level
// tag per group (owner, 2026-10-13; a tier chip each, never a span or a
// rail) and the program's own plain line. Nothing appears on hover; one
// action per card.
//
// One link, one tab stop: the title's Link is stretched over the whole card
// with an ::after pseudo-element, the article is the only positioned ancestor
// between the two, and no other element in the card is interactive. The
// photo column is positioned too, for the chip it carries, but it is the
// body's sibling, never an ancestor of the link. The CTA line is decoration
// (aria-hidden); the photo keeps its real alt text, so a reader hears who is
// on court and then the title.
//
// Rendered by the homepage grid and the dashboard's "Suggested for you" row,
// so both stay identical. From md to lg the card lies on its side (photo
// left, body right) so a tablet never shows a 2 + 1 orphan; at lg the
// three-column grid stacks it again.

export type ProgramCardProps = {
  program: Program;
  /** Earliest public cohort for this program, if any (the status chip and the Next row). */
  nextCohort?: Cohort;
  /** Dashboard only: the ranked player this program fits, for "Fits Maya" and the rail marker. */
  fit?: ProgramFit;
  /** The title's heading level; h3 under a section heading, h2 when the page's H1 names the list. */
  headingLevel?: 2 | 3;
};

export const CHIP_BASE = "inline-flex min-h-6 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium";
export const CHIP_NEUTRAL = `${CHIP_BASE} border border-white/15 bg-white/5 text-white/85`;
const CHIP_NEXT = `${CHIP_BASE} bg-[#B4E655]/10 text-[#B4E655]`;
export const CHIP_COMING_SOON = `${CHIP_BASE} border border-dashed border-white/25 bg-[#061427] text-white/85`;

export const EYEBROW_CLASS = "text-xs font-semibold uppercase tracking-[0.12em] text-[#B4E655]";
export const LABEL_CLASS = "text-xs font-semibold uppercase tracking-[0.12em] text-white/60";
export const VALUE_CLASS = "min-w-0 text-sm tabular-nums text-white/90";
export const ROW_CLASS = "grid grid-cols-[4.5rem_1fr] gap-x-3";

/**
 * The card surface with its hover and keyboard-focus states: the border
 * brightens on hover and when the stretched link has visible focus (the
 * ring sits on the article because the link's box is the title alone).
 */
export const CARD_SHELL =
  "group relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] " +
  "motion-safe:transition-colors motion-safe:duration-150 hover:border-white/25 " +
  "has-[a:focus-visible]:border-white/25 has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-[#B4E655]/50 " +
  "has-[a:focus-visible]:ring-offset-2 has-[a:focus-visible]:ring-offset-[#061427]";

/** The title link, stretched over the card. The focus ring is drawn by the article. */
export const STRETCHED_LINK =
  "after:absolute after:inset-0 after:z-10 after:rounded-2xl after:content-[''] focus:outline-none";

/** The photo's responsive widths: full width on phones, half on a tablet, a third of the container at lg. */
const PHOTO_SIZES = "(min-width: 1024px) 352px, (min-width: 768px) 40vw, 100vw";

export function StatusChip({ status }: { status: ProgramStatus }) {
  if (status.kind === "next-cohort") {
    return (
      <span className={CHIP_NEXT}>
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#B4E655]" />
        {status.label}
      </span>
    );
  }
  if (status.kind === "coming-soon") return <span className={CHIP_COMING_SOON}>{status.label}</span>;
  // The joining flow (owner, 2026-10-12): an open group carries a solid lime
  // dot, a by-approval group a hollow ring, so the two read apart at a glance
  // without a second colour. The words carry the meaning; the dots are decoration.
  if (status.kind === "open" || status.kind === "approval") {
    return (
      <span className={CHIP_NEUTRAL}>
        <span
          aria-hidden="true"
          className={
            status.kind === "open"
              ? "h-1.5 w-1.5 rounded-full bg-[#B4E655]"
              : "h-2 w-2 rounded-full border border-white/70"
          }
        />
        {status.label}
      </span>
    );
  }
  return <span className={CHIP_NEUTRAL}>{status.label}</span>;
}

/** The decorative CTA line: the program's label and an arrow that nudges on hover. */
export function CtaLine({ text, className = "" }: { text: string; className?: string }) {
  return (
    <span aria-hidden="true" className={`block text-sm font-semibold text-[#B4E655] ${className}`.trim()}>
      {text}{" "}
      <span className="inline-block motion-safe:transition-transform motion-safe:duration-150 motion-safe:group-hover:translate-x-1">
        →
      </span>
    </span>
  );
}

/**
 * The price (PRICE_SUMMARY: the session price, then the cohort total) stacked:
 * the per-session figure leading in white, the total on its own line in
 * white/60. Stacked on purpose, with no separator, so a narrow Price column
 * never wraps to a stray "· $…" line (the audit L8 pattern). "Rates on
 * request" is a single part.
 */
export function PriceSummary({ text }: { text: string }) {
  const [lead, ...rest] = text.split(" · ");
  return (
    <span className="block">
      <span className="block font-semibold text-white">{lead}</span>
      {rest.map((part) => (
        <span key={part} className="block text-white/60">
          {part}
        </span>
      ))}
    </span>
  );
}

/**
 * The Next row: the public cohort's schedule (formatCohortSchedule, four
 * parts joined by " · ") as parts that wrap whole. Each part is
 * `whitespace-nowrap`, so a narrow column never splits a date range, and the
 * middot rides with the part before it, so a second line never opens with a
 * separator (the audit L8 pattern the Price row already avoids).
 */
export function CohortSchedule({ cohort }: { cohort: Cohort }) {
  const parts = formatCohortSchedule(cohort).split(" · ");
  const last = parts.length - 1;
  return (
    <span className="flex flex-wrap gap-x-1">
      {parts.map((part, i) => (
        <span key={`${i}-${part}`} className="whitespace-nowrap">
          {part}
          {i < last && <span aria-hidden="true"> ·</span>}
        </span>
      ))}
    </span>
  );
}

/**
 * The Levels block on the program card (owner, 2026-10-13): the level tags
 * its groups carry, one chip per tier in ladder order ("All levels" for a
 * program built for any level), the program's own plain line, and, on the
 * dashboard, the ranked player the program fits with their tier and level.
 * No span, no rail: each group has one level, and the group cards say which.
 */
export function LevelTags({
  tags,
  range,
  note,
  fit = null,
  className = "",
}: {
  /** One tier id per distinct group level, or null for any level. */
  tags: TierId[] | null;
  /** The program's numeric span, for the dashboard's fit check only. */
  range: { min: number; max: number } | null;
  note?: string;
  fit?: ProgramFit;
  className?: string;
}) {
  if (tags !== null && tags.length === 0) return null;
  const fitInRange = !!fit && !!range && levelWithinRange(fit.level, range.min, range.max);
  return (
    <div className={className}>
      <p className={LABEL_CLASS}>{tags === null || tags.length === 1 ? "Level" : "Levels"}</p>
      <ul role="list" className="mt-2 flex flex-wrap gap-1.5">
        {tags === null ? (
          <li>
            <LevelTag level={null} />
          </li>
        ) : (
          tags.map((id) => (
            <li key={id}>
              <LevelTag level={id} />
            </li>
          ))
        )}
      </ul>
      {note && <p className="mt-2 text-xs text-white/60">{note}</p>}
      {fitInRange && fit && (
        <p className="mt-1 text-xs text-white/75">
          {fit.name ? `${fit.name}: ` : "Your level: "}
          {formatTierLevel(fit.level)}
        </p>
      )}
    </div>
  );
}

/**
 * One "When" entry per group, stacked the same way every time: the start
 * ("Sat 12:00") in white on its own line, the level-led group name under it
 * in white/65. Stacked on purpose, with no separator, so the three entries
 * share one shape in the narrow column instead of wrapping where each name
 * happens to run out of room (the Price row's pattern).
 */
function GroupLines({ groups }: { groups: ProgramGroup[] }) {
  return (
    <ul role="list" className="space-y-1.5">
      {groups.map((g) => (
        <li key={g.id}>
          <span className="block text-white">{formatGroupStart(g)}</span>
          <span className="block text-white/65">{g.name}</span>
        </li>
      ))}
    </ul>
  );
}

export function ProgramCard({ program: p, nextCohort, fit = null, headingLevel = 3 }: ProgramCardProps) {
  const Title = headingLevel === 2 ? "h2" : "h3";
  const status = programStatus(p, nextCohort);
  const range = programLevelRange(p);
  const fitInRange = !!fit && !!range && levelWithinRange(fit.level, range.min, range.max);
  const eyebrow = fitInRange ? `Fits ${fit?.name ?? "you"}` : programEyebrow(p);
  const groups = groupsForProgram(p.slug);
  const scheduled = groups.filter((g) => g.day !== null);
  // The level tags its groups carry; a program with no groups shows its plain line instead.
  const tags = groups.length > 0 ? programLevelTags(groups) : [];

  return (
    <article className={`${CARD_SHELL} md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:flex`}>
      {/* The photo column: the program's photograph with its real alt text,
          and the status chip in its top-right corner, so the eyebrow below
          always has its line to itself. The column is the body's sibling, so
          the stretched link still measures from the article. */}
      <div className="relative md:h-full lg:h-auto">
        <div className="aspect-[16/10] w-full overflow-hidden border-b border-white/10 bg-[#061427] md:aspect-auto md:h-full md:border-b-0 md:border-r lg:aspect-[16/10] lg:h-auto lg:border-b lg:border-r-0">
          {p.photo ? (
            <Image
              src={p.photo.src}
              alt={p.photo.alt}
              width={p.photo.width}
              height={p.photo.height}
              sizes={PHOTO_SIZES}
              className="h-full w-full object-cover"
            />
          ) : (
            <div aria-hidden="true" className="h-full w-full bg-white/10" />
          )}
        </div>
        {/* An opaque navy disc under the chip, so a translucent chip stays
            legible over a photo. A program with no fixed class has no chip. */}
        {status && (
          <span className="absolute right-3 top-3 flex rounded-full bg-[#061427]">
            <StatusChip status={status} />
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col p-5 md:p-6">
        <p className={EYEBROW_CLASS}>{eyebrow}</p>

        <Title className="mt-3 text-lg font-semibold tracking-tight text-white">
          <Link href={p.ctaHref} className={STRETCHED_LINK}>
            {p.title}
          </Link>
        </Title>
        <p className="mt-1.5 text-sm leading-relaxed text-white/70">{p.description}</p>

        <dl className="mt-5 space-y-2.5 border-t border-white/10 pt-4">
          <div className={ROW_CLASS}>
            <dt className={`${LABEL_CLASS} pt-0.5`}>Ages</dt>
            <dd className={VALUE_CLASS}>{programAgeLabel(groups)}</dd>
          </div>

          <div className={ROW_CLASS}>
            <dt className={`${LABEL_CLASS} pt-0.5`}>When</dt>
            <dd className={VALUE_CLASS}>
              {scheduled.length > 0 ? <GroupLines groups={scheduled} /> : p.schedule}
            </dd>
          </div>

          {p.priceSummary && (
            <div className={ROW_CLASS}>
              <dt className={`${LABEL_CLASS} pt-0.5`}>Price</dt>
              <dd className={VALUE_CLASS}>
                <PriceSummary text={p.priceSummary} />
              </dd>
            </div>
          )}

          {nextCohort && (
            <div className={ROW_CLASS}>
              <dt className={`${LABEL_CLASS} pt-0.5`}>Next</dt>
              <dd className={VALUE_CLASS}>
                <CohortSchedule cohort={nextCohort} />
              </dd>
            </div>
          )}

          {tags !== null && tags.length === 0 && p.levelNote && (
            <div className={ROW_CLASS}>
              <dt className={`${LABEL_CLASS} pt-0.5`}>Level</dt>
              <dd className={VALUE_CLASS}>{p.levelNote}</dd>
            </div>
          )}
        </dl>

        {/* The Levels block only when the groups carry tags; never "TBA". */}
        {(tags === null || tags.length > 0) && (
          <LevelTags tags={tags} range={range} note={p.levelNote} fit={fit} className="mt-4 border-t border-white/10 pt-4" />
        )}

        <CtaLine text={p.ctaText} className="mt-auto pt-5" />
      </div>
    </article>
  );
}

/** Earliest public cohort per program — the status chip and the Next row's source. */
export function nextCohortFor(publicCohorts: Cohort[], programId: string): Cohort | undefined {
  return publicCohorts
    .filter((c) => c.programId === programId)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
}

export type ProgramCardListProps = {
  programs: Program[];
  /** Already fetched by the page or the grid; this list never reads the database. */
  publicCohorts: Cohort[];
  /** Dashboard only: which ranked player each program fits, by program id. */
  fits?: Record<string, ProgramFit>;
  headingLevel?: 2 | 3;
};

/**
 * The list the grid and the dashboard both render: a real list of cards,
 * each stretched to its row's height, three across from lg. Sync and
 * database-free, so a server page can call it with cohorts it already holds.
 */
export function ProgramCardList({ programs, publicCohorts, fits, headingLevel }: ProgramCardListProps) {
  return (
    <ul role="list" className="grid gap-4 lg:grid-cols-3">
      {programs.map((p) => (
        <li key={p.id} className="flex [&>*]:w-full">
          <ProgramCard
            program={p}
            nextCohort={nextCohortFor(publicCohorts, p.id)}
            fit={fits?.[p.id] ?? null}
            headingLevel={headingLevel}
          />
        </li>
      ))}
    </ul>
  );
}
