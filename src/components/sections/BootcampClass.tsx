import { Fragment, type ReactNode } from "react";
import { CLASS_HEADING, CLASS_PARTS, CLASS_RUNS, type ClassTile } from "@/content/bootcamp";
import { Container } from "@/components/layout/Container";
import { Heading } from "@/components/ui/Heading";
import {
  FocusIcon,
  FootworkIcon,
  MobilityIcon,
  PlayersIcon,
  PointPlayIcon,
  PowerIcon,
  RotateIcon,
  SpeedIcon,
  StaminaIcon,
  TacticsIcon,
  TechniqueIcon,
} from "@/components/ui/icons";

// "Tennis and fitness in every class." (owner, 2026-11-16 and 2026-11-17):
// the section straight under the hero, and what makes every group a
// bootcamp. Two blocks side by side from md, stacked on phones: Tennis, the
// lime block, and Fitness, the court-navy block, each with the four things
// it trains; a rotate glyph between them; then how a class runs and how many
// players a group takes. Real headings and lists, and every word is text:
// the glyphs are decoration. The words live in src/content/bootcamp.ts.
// A full-bleed band with hairlines above and below: it puts the Container
// inside (audit H2).

const TILE_GLYPH = "h-7 w-7 lg:h-[34px] lg:w-[34px]";
const TILE_GLYPHS: Record<ClassTile["icon"], ReactNode> = {
  technique: <TechniqueIcon className={TILE_GLYPH} />,
  footwork: <FootworkIcon className={TILE_GLYPH} />,
  tactics: <TacticsIcon className={TILE_GLYPH} />,
  focus: <FocusIcon className={TILE_GLYPH} />,
  power: <PowerIcon className={TILE_GLYPH} />,
  speed: <SpeedIcon className={TILE_GLYPH} />,
  stamina: <StaminaIcon className={TILE_GLYPH} />,
  mobility: <MobilityIcon className={TILE_GLYPH} />,
};

const RUN_GLYPH = "h-[22px] w-[22px] shrink-0 text-[#B4E655] md:h-6 md:w-6";
const RUN_GLYPHS: Record<(typeof CLASS_RUNS)[number]["icon"], ReactNode> = {
  rotate: <RotateIcon className={RUN_GLYPH} />,
  play: <PointPlayIcon className={RUN_GLYPH} />,
  players: <PlayersIcon className={RUN_GLYPH} />,
};

const BLOCK = "rounded-[20px] border px-[18px] py-[22px] md:px-6 md:py-7 lg:rounded-3xl lg:px-10 lg:pb-10 lg:pt-9";
/** Tennis: the lime block, navy words and navy tiles. */
const BLOCK_LIME = `${BLOCK} border-[#B4E655] bg-[#B4E655] text-[#061427]`;
/** Fitness: the court navy (the Court Plates' court), a hairline border, lime tiles. */
const BLOCK_COURT = `${BLOCK} border-white/[0.16] bg-[#0B2342] text-white`;

export function BootcampClass() {
  return (
    <section aria-labelledby="class-title" className="border-y border-white/10 py-7 md:py-[52px]">
      <Container>
        <Heading id="class-title">{CLASS_HEADING}</Heading>

        <div className="mt-[18px] grid md:mt-7 md:grid-cols-[minmax(0,1fr)_56px_minmax(0,1fr)] md:items-stretch lg:grid-cols-[minmax(0,1fr)_72px_minmax(0,1fr)]">
          {CLASS_PARTS.map((part, i) => (
            <Fragment key={part.name}>
              {i > 0 && (
                // The class rotates between the two: decoration, the line
                // under the blocks says it in words.
                <div aria-hidden="true" className="grid h-[52px] place-items-center text-white/75 md:h-auto">
                  <RotateIcon className="h-7 w-7 lg:h-10 lg:w-10" />
                </div>
              )}
              <div className={part.tone === "lime" ? BLOCK_LIME : BLOCK_COURT}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 lg:gap-x-4">
                  <h3 className="text-[40px] font-bold leading-none tracking-[-0.03em] md:text-[44px] lg:text-[clamp(52px,5.65vw,72px)]">
                    {part.name}
                  </h3>
                  {part.tag && (
                    <span className="inline-flex h-[26px] items-center whitespace-nowrap rounded-full bg-[#B4E655] px-3 text-xs font-semibold text-[#061427] lg:h-[30px] lg:px-3.5 lg:text-sm">
                      {part.tag}
                    </span>
                  )}
                </div>
                <ul role="list" className="mt-5 grid grid-cols-4 gap-x-1 lg:mt-8 lg:gap-x-2">
                  {part.trains.map((tile) => (
                    <li
                      key={tile.label}
                      className="flex min-w-0 flex-col items-center gap-2 text-center text-[13px] font-semibold lg:gap-3 lg:text-base"
                    >
                      <span
                        aria-hidden="true"
                        className={`grid h-[52px] w-[52px] place-items-center rounded-[14px] lg:h-16 lg:w-16 lg:rounded-2xl ${
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

        <ul
          role="list"
          className="mt-[18px] grid gap-2.5 md:mt-[30px] md:flex md:flex-wrap md:gap-x-12 md:gap-y-3"
        >
          {CLASS_RUNS.map((run) => (
            <li
              key={run.text}
              className="flex items-center gap-2.5 text-[15px] font-medium text-white/90 md:gap-3 md:text-[19px]"
            >
              {RUN_GLYPHS[run.icon]}
              {run.text}
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
