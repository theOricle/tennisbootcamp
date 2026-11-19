import { Fragment, type ReactNode } from "react";
import { CLASS_PARTS, CLASS_RUNS, type ClassTile } from "@/content/bootcamp";
import {
  CardioIcon,
  FocusIcon,
  FootworkIcon,
  PointPlayIcon,
  PowerIcon,
  RotateIcon,
  StabilityIcon,
  StaminaIcon,
  TacticsIcon,
  TechniqueIcon,
} from "@/components/ui/icons";

// The Tennis and Fitness graphic (owner, 2026-11-16; on About since
// 2026-11-17, when three short points took its place under the home page's
// hero): what makes every group a bootcamp, drawn. Two blocks side by side
// from md, stacked on phones: Tennis, the lime block, and Fitness, the
// court-navy block, each with the four things it trains; a rotate glyph
// between them; then how a class runs, in two lines. Real headings and
// lists, and every word is text: the glyphs are decoration. The words live
// in src/content/bootcamp.ts.
//
// It sits inside a page section, under that section's heading: it has no
// heading of its own and no group-size line (About states the size once, in
// its list), and it sets no gutter or page width; the page's Container does
// (audit H2). Its scale is the page's, not a landing band's: the two names
// sit under the page title (28px, 32px from md, against the h1's 30px and
// 36px), the blocks share the cards' radius.

const TILE_GLYPH = "h-7 w-7";
const TILE_GLYPHS: Record<ClassTile["icon"], ReactNode> = {
  technique: <TechniqueIcon className={TILE_GLYPH} />,
  footwork: <FootworkIcon className={TILE_GLYPH} />,
  tactics: <TacticsIcon className={TILE_GLYPH} />,
  focus: <FocusIcon className={TILE_GLYPH} />,
  power: <PowerIcon className={TILE_GLYPH} />,
  stamina: <StaminaIcon className={TILE_GLYPH} />,
  stability: <StabilityIcon className={TILE_GLYPH} />,
  cardio: <CardioIcon className={TILE_GLYPH} />,
};

const RUN_GLYPH = "h-[22px] w-[22px] shrink-0 text-[#B4E655]";
const RUN_GLYPHS: Record<(typeof CLASS_RUNS)[number]["icon"], ReactNode> = {
  rotate: <RotateIcon className={RUN_GLYPH} />,
  play: <PointPlayIcon className={RUN_GLYPH} />,
};

// Below 360 wide the four tile labels need more room than a block has
// ("Technique" and "Footwork" touched at 320), so there the side padding is
// 12px and the labels are 12px; from 360 both are as designed.
const BLOCK = "rounded-2xl border px-3 py-5 min-[360px]:px-[18px] md:px-6 md:py-6 lg:px-8 lg:py-7";
/** Tennis: the lime block, navy words and navy tiles. */
const BLOCK_LIME = `${BLOCK} border-[#B4E655] bg-[#B4E655] text-[#061427]`;
/** Fitness: the court navy (the Court Plates' court), a hairline border, lime tiles. */
const BLOCK_COURT = `${BLOCK} border-white/[0.16] bg-[#0B2342] text-white`;

export function BootcampClass({ className = "" }: { className?: string }) {
  return (
    <div className={className}>
      <div className="grid md:grid-cols-[minmax(0,1fr)_56px_minmax(0,1fr)] md:items-stretch">
        {CLASS_PARTS.map((part, i) => (
          <Fragment key={part.name}>
            {i > 0 && (
              // The class rotates between the two: decoration, the line
              // under the blocks says it in words.
              <div aria-hidden="true" className="grid h-12 place-items-center text-white/75 md:h-auto">
                <RotateIcon className="h-7 w-7" />
              </div>
            )}
            <div className={part.tone === "lime" ? BLOCK_LIME : BLOCK_COURT}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <h3 className="text-[28px] font-bold leading-none tracking-[-0.03em] md:text-[32px]">
                  {part.name}
                </h3>
                {part.tag && (
                  <span className="inline-flex h-[26px] items-center whitespace-nowrap rounded-full bg-[#B4E655] px-3 text-xs font-semibold text-[#061427]">
                    {part.tag}
                  </span>
                )}
              </div>
              <ul role="list" className="mt-5 grid grid-cols-4 gap-x-1 lg:mt-6 lg:gap-x-2">
                {part.trains.map((tile) => (
                  <li
                    key={tile.label}
                    className="flex min-w-0 flex-col items-center gap-2 text-center text-[12px] font-semibold min-[360px]:text-[13px] lg:text-sm"
                  >
                    <span
                      aria-hidden="true"
                      className={`grid h-[52px] w-[52px] place-items-center rounded-[14px] ${
                        part.tone === "lime" ? "bg-[#061427] text-[#B4E655]" : "bg-[#B4E655] text-[#061427]"
                      }`}
                    >
                      {TILE_GLYPHS[tile.icon]}
                    </span>
                    {tile.label}
                  </li>
                ))}
              </ul>
            </div>
          </Fragment>
        ))}
      </div>

      <ul role="list" className="mt-4 grid gap-2.5 md:mt-5 md:flex md:flex-wrap md:gap-x-10 md:gap-y-3">
        {CLASS_RUNS.map((run) => (
          <li key={run.text} className="flex items-center gap-2.5 text-[15px] font-medium text-white/90 md:text-base">
            {RUN_GLYPHS[run.icon]}
            {run.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
