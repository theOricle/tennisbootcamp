import Link from "next/link";
import type { Program, TimetableSlot } from "@/types/program";
import type { Cohort } from "@/types/cohort";
import { formatCohortSchedule } from "@/lib/cohorts";
import { AGE_BAND_LABELS } from "@/lib/ageBand";
import {
  formatSlotWhen,
  programEyebrow,
  programLevelRange,
  programStatus,
  slotLevelRange,
  type ProgramFit,
  type ProgramStatus,
} from "@/lib/programCatalog";
import {
  formatLevelBand,
  formatTierLevel,
  formatTierSpan,
  levelWithinRange,
  tierRangeForLevels,
} from "@/lib/tiers";
import { ProgramPlate } from "@/components/plates/ProgramPlate";
import { AgeBandChips } from "@/components/programs/AgeBandChips";
import { TierEmblem, TierLine, TierRangeBadges } from "@/components/tiers";

// The one program card (audit H7; design specs §5.3): a spec sheet. The
// program's Court Plate on top, then an eyebrow and a status chip, the title
// as the card's one link, a two-line description, and the decision rows —
// Ages, When, Price, Next — on hairlines, then the Level block (tier span,
// mark, rail and the program's own plain line) when the program carries a
// span. Nothing appears on hover; one action per card.
//
// One link, one tab stop: the title's Link is stretched over the whole card
// with an ::after pseudo-element, the article is the only positioned ancestor
// between the two, and no other element in the card is interactive. The CTA
// line is decoration (aria-hidden) and the plate is decorative, so the
// card's accessible name is its title.
//
// Rendered by the homepage grid, /programs, and the dashboard's "Suggested
// for you" row, so all three stay identical.

export type ProgramCardVariant = "auto" | "compact" | "row";

export type ProgramCardProps = {
  program: Program;
  /** Earliest public cohort for this program, if any (the status chip and the Next row). */
  nextCohort?: Cohort;
  /**
   * `compact`: the stacked card. `row` (/programs, md+): art left, a
   * two-column spec sheet right. `auto` (home, dashboard): compact below md,
   * row layout with a single-column spec from md to lg, compact again in the
   * lg three-column grid, so a tablet never shows a 2 + 1 orphan.
   */
  variant?: ProgramCardVariant;
  /** Dashboard only: the ranked player this program fits, for "Fits Maya" and the rail marker. */
  fit?: ProgramFit;
  /** The title's heading level; h3 under a section heading, h2 when the page's H1 names the list. */
  headingLevel?: 2 | 3;
};

export const CHIP_BASE = "inline-flex min-h-6 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium";
const CHIP_NEUTRAL = `${CHIP_BASE} border border-white/15 bg-white/5 text-white/85`;
const CHIP_NEXT = `${CHIP_BASE} bg-[#B4E655]/10 text-[#B4E655]`;
export const CHIP_COMING_SOON = `${CHIP_BASE} border border-dashed border-white/25 bg-[#061427] text-white/85`;

export const EYEBROW_CLASS = "text-xs font-semibold uppercase tracking-[0.12em] text-[#B4E655]";
const LABEL_CLASS = "text-xs font-semibold uppercase tracking-[0.12em] text-white/60";
const VALUE_CLASS = "min-w-0 text-sm tabular-nums text-white/90";
const ROW_CLASS = "grid grid-cols-[4.5rem_1fr] gap-x-3";

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
 * The one-line price (PRICE_SUMMARY: the session price, then the cohort total)
 * with the per-session figure leading in white and the total muted, each part
 * kept on its own line when the row is narrow. The camp's "$499 a week" is a
 * single part.
 */
function PriceSummary({ text }: { text: string }) {
  const [lead, ...rest] = text.split(" · ");
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5">
      <span className="whitespace-nowrap font-semibold text-white">{lead}</span>
      {rest.map((part) => (
        <span key={part} className="whitespace-nowrap text-white/60">
          <span aria-hidden="true">· </span>
          {part}
        </span>
      ))}
    </span>
  );
}

// ─── Slot qualifier (design specs §5.3.1) ─────────────────────────────────────
// The first matching rule wins: the slot's level band as TierRangeBadges (so
// Adult Bootcamps shows Love – Rally / Deuce / Break – Ace, the visible
// climb); else its age band as a neutral chip; else, when the timetable has
// more than one class, the class label; otherwise nothing.

type QualifierKind = "tier" | "age" | "group" | "none";

function qualifierKind(slot: TimetableSlot, slotCount: number): QualifierKind {
  if (slotLevelRange(slot)) return "tier";
  if (slot.ageBand) return "age";
  if (slotCount > 1) return "group";
  return "none";
}

function SlotQualifier({ slot, kind }: { slot: TimetableSlot; kind: QualifierKind }) {
  if (kind === "tier") return <TierRangeBadges levelMin={slot.levelMin} levelMax={slot.levelMax} />;
  if (kind === "age" && slot.ageBand) return <span className={CHIP_NEUTRAL}>{AGE_BAND_LABELS[slot.ageBand]}</span>;
  if (kind === "group") return <span className={CHIP_NEUTRAL}>{slot.group}</span>;
  return null;
}

// ─── Layout per variant ───────────────────────────────────────────────────────
// Every class is a complete literal so the JIT keeps it. `row` switches at md;
// `auto` switches at md and back at lg.

type Layout = {
  article: string;
  art: string;
  body: string;
  title: string;
  description: string;
  /** The spec list: `row` splits it into Timetable | Ages · Price · Next at md. */
  dl: string;
  /** One dt/dd row: `row` stacks the label above its value at md, so the two columns keep their width. */
  specRow: string;
  dlWhen: string;
  dlAges: string;
  dlPrice: string;
  dlNext: string;
  /** `row` only: at md the spec sheet is two columns and the When row reads "Timetable". */
  rowSpec: boolean;
  /** A timetable line: `row` spreads it across the column with hairlines at md. */
  slot: string;
  /** `row` only: the class label beside the time at md. */
  slotGroup: string;
  /** `row` only: the md+ rail replaces the sm rail. */
  railSm: string;
  railMd: string;
};

const LAYOUT: Record<ProgramCardVariant, Layout> = {
  compact: {
    article: "",
    art: "",
    body: "",
    title: "text-lg",
    description: "line-clamp-2",
    dl: "space-y-2.5",
    specRow: "",
    dlWhen: "",
    dlAges: "",
    dlPrice: "",
    dlNext: "",
    rowSpec: false,
    slot: "",
    slotGroup: "hidden",
    railSm: "",
    railMd: "hidden",
  },
  row: {
    article: "md:grid md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]",
    art: "md:aspect-auto md:h-full md:min-h-[320px] md:border-b-0 md:border-r",
    body: "md:p-8",
    title: "text-lg md:text-2xl",
    description: "line-clamp-2 md:line-clamp-none",
    dl: "space-y-2.5 md:grid md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] md:gap-x-8 md:gap-y-4 md:space-y-0",
    specRow: "md:block md:space-y-1.5",
    dlWhen: "md:col-start-1 md:row-start-1 md:row-span-3",
    dlAges: "md:col-start-2 md:row-start-1",
    dlPrice: "md:col-start-2 md:row-start-2",
    dlNext: "md:col-start-2 md:row-start-3",
    rowSpec: true,
    slot: "md:justify-between md:border-b md:border-white/5 md:py-1.5 md:last:border-0",
    slotGroup: "hidden md:inline",
    railSm: "md:hidden",
    railMd: "hidden md:block",
  },
  auto: {
    article: "md:grid md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:flex",
    art: "md:aspect-auto md:h-full md:min-h-[320px] md:border-b-0 md:border-r lg:aspect-[2/1] lg:h-auto lg:min-h-0 lg:border-b lg:border-r-0",
    body: "md:p-8 lg:p-6",
    title: "text-lg md:text-2xl lg:text-lg",
    description: "line-clamp-2 md:line-clamp-none lg:line-clamp-2",
    dl: "space-y-2.5",
    specRow: "",
    dlWhen: "",
    dlAges: "",
    dlPrice: "",
    dlNext: "",
    rowSpec: false,
    slot: "",
    slotGroup: "hidden",
    railSm: "",
    railMd: "hidden",
  },
};

export function ProgramCard({
  program: p,
  nextCohort,
  variant = "auto",
  fit = null,
  headingLevel = 3,
}: ProgramCardProps) {
  const L = LAYOUT[variant];
  const Title = headingLevel === 2 ? "h2" : "h3";
  const status = programStatus(p, nextCohort);
  const range = programLevelRange(p);
  const fitInRange = !!fit && !!range && levelWithinRange(fit.level, range.min, range.max);
  const eyebrow = fitInRange ? `Fits ${fit?.name ?? "you"}` : programEyebrow(p);
  const slots = p.timetable ?? [];
  const minTier = range ? tierRangeForLevels(range.min, range.max)?.min : undefined;

  return (
    <article className={`${CARD_SHELL} ${L.article}`.trim()}>
      {/* The plate: text-free and decorative (design specs rule 2). The art
          box is not positioned, so the Coming Soon chip and the stretched
          link both measure from the article. */}
      <div className={`aspect-[2/1] w-full overflow-hidden border-b border-white/10 bg-[#061427] ${L.art}`.trim()}>
        {variant === "row" ? (
          // The row card's art fills a tall left column, so it takes the full master frame.
          <ProgramPlate plate={p.plate} frame="master" density="compact" comingSoon={p.comingSoon} interactive />
        ) : (
          <ProgramPlate plate={p.plate} frame="band" density="compact" comingSoon={p.comingSoon} interactive />
        )}
      </div>
      {p.comingSoon && <span className={`absolute right-3 top-3 ${CHIP_COMING_SOON}`}>Coming Soon</span>}

      <div className={`flex min-w-0 flex-1 flex-col p-5 md:p-6 ${L.body}`.trim()}>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
          <p className={EYEBROW_CLASS}>{eyebrow}</p>
          {!p.comingSoon && <StatusChip status={status} />}
        </div>

        <Title className={`mt-3 font-semibold tracking-tight text-white ${L.title}`}>
          <Link href={p.ctaHref} className={STRETCHED_LINK}>
            {p.title}
          </Link>
        </Title>
        <p className={`mt-1.5 text-sm leading-relaxed text-white/70 ${L.description}`}>{p.description}</p>

        <dl className={`mt-5 border-t border-white/10 pt-4 ${L.dl}`}>
          <div className={`${ROW_CLASS} ${L.specRow} ${L.dlAges}`.trim()}>
            <dt className={`${LABEL_CLASS} pt-0.5`}>Ages</dt>
            <dd className={VALUE_CLASS}>
              <AgeBandChips bands={p.ageBands} />
            </dd>
          </div>

          <div className={`${ROW_CLASS} ${L.specRow} ${L.dlWhen}`.trim()}>
            <dt className={`${LABEL_CLASS} pt-0.5`}>
              {L.rowSpec ? (
                <>
                  <span className="md:hidden">When</span>
                  <span className="hidden md:inline">Timetable</span>
                </>
              ) : (
                "When"
              )}
            </dt>
            <dd className={VALUE_CLASS}>
              {slots.length > 0 ? (
                <ul role="list" className="space-y-1">
                  {slots.map((slot) => {
                    const kind = qualifierKind(slot, slots.length);
                    return (
                      <li
                        key={`${slot.day}-${slot.time}`}
                        className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${L.slot}`.trim()}
                      >
                        <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
                          <span className="whitespace-nowrap">{formatSlotWhen(slot)}</span>
                          {L.rowSpec && (kind === "tier" || kind === "none") && (
                            <span className={`min-w-0 text-white/65 ${L.slotGroup}`}>
                              <span aria-hidden="true">· </span>
                              {slot.group}
                            </span>
                          )}
                        </span>
                        <SlotQualifier slot={slot} kind={kind} />
                      </li>
                    );
                  })}
                </ul>
              ) : (
                p.schedule
              )}
            </dd>
          </div>

          {p.priceSummary && (
            <div className={`${ROW_CLASS} ${L.specRow} ${L.dlPrice}`.trim()}>
              <dt className={`${LABEL_CLASS} pt-0.5`}>Price</dt>
              <dd className={VALUE_CLASS}>
                <PriceSummary text={p.priceSummary} />
              </dd>
            </div>
          )}

          {nextCohort && (
            <div className={`${ROW_CLASS} ${L.specRow} ${L.dlNext}`.trim()}>
              <dt className={`${LABEL_CLASS} pt-0.5`}>Next</dt>
              <dd className={VALUE_CLASS}>{formatCohortSchedule(nextCohort)}</dd>
            </div>
          )}

          {!range && p.levelNote && (
            <div className={`${ROW_CLASS} ${L.specRow}`.trim()}>
              <dt className={`${LABEL_CLASS} pt-0.5`}>Level</dt>
              <dd className={VALUE_CLASS}>{p.levelNote}</dd>
            </div>
          )}
        </dl>

        {/* The Level block: tier span in words, the min tier's mark, the
            numeric band, the rail, and the program's own plain line. Only
            when the span is set; never "TBA". */}
        {range && minTier && (
          <div className="mt-4 border-t border-white/10 pt-4">
            <p className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <span className={LABEL_CLASS}>Level</span>
              <span className="flex min-w-0 items-center gap-2">
                <TierEmblem tier={minTier.id} size={20} decorative className="shrink-0" />
                <span className="text-sm font-semibold text-white">{formatTierSpan(range.min, range.max)}</span>
                <span aria-hidden="true" className="text-xs tabular-nums text-white/60">
                  {formatLevelBand(range.min, range.max)}
                </span>
                <span className="sr-only">
                  , levels {range.min.toFixed(1)} to {range.max.toFixed(1)} on the seven-tier ladder from Love to Grand Slam
                </span>
              </span>
            </p>
            <TierLine
              variant="rail"
              size="sm"
              span={range}
              marker={fit ? { level: fit.level, label: fit.name ?? "You" } : null}
              labels="none"
              className={`mt-3 ${L.railSm}`.trim()}
            />
            {L.rowSpec && (
              <TierLine
                variant="rail"
                size="md"
                span={range}
                marker={fit ? { level: fit.level, label: fit.name ?? "You" } : null}
                labels="ends"
                className={`mt-3 ${L.railMd}`}
              />
            )}
            {p.levelNote && <p className="mt-2 text-xs text-white/60">{p.levelNote}</p>}
            {fitInRange && fit && (
              <p className="mt-1 text-xs text-white/75">
                {fit.name ? `${fit.name}: ` : "Your level: "}
                {formatTierLevel(fit.level)}
              </p>
            )}
          </div>
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
  /** `grid`: auto cards, three across from lg. `rows`: one row card per program. */
  layout?: "grid" | "rows";
  headingLevel?: 2 | 3;
};

/**
 * The list the grid and the dashboard both render: a real list of cards,
 * each stretched to its row's height. Sync and database-free, so a server
 * page can call it with cohorts it already holds.
 */
export function ProgramCardList({
  programs,
  publicCohorts,
  fits,
  layout = "grid",
  headingLevel,
}: ProgramCardListProps) {
  const rows = layout === "rows";
  return (
    <ul role="list" className={rows ? "space-y-4" : "grid gap-4 lg:grid-cols-3"}>
      {programs.map((p) => (
        <li key={p.id} className="flex [&>*]:w-full">
          <ProgramCard
            program={p}
            nextCohort={nextCohortFor(publicCohorts, p.id)}
            variant={rows ? "row" : "auto"}
            fit={fits?.[p.id] ?? null}
            headingLevel={headingLevel}
          />
        </li>
      ))}
    </ul>
  );
}
