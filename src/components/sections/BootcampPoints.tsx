import type { ReactNode } from "react";
import { BOOTCAMP_POINTS, BOOTCAMP_POINTS_LABEL } from "@/content/bootcamp";
import { Container } from "@/components/layout/Container";
import { PlayersIcon, PointPlayIcon, RotateIcon } from "@/components/ui/icons";

// What a bootcamp is, in three points (owner, 2026-11-17): a thin band
// straight under the home page's hero, in place of the large Tennis and
// Fitness section, which moved to About. A real list of three, each an icon
// and one phrase with a bold lead. On a phone: three short rows, one line
// each. From md: three equal columns with a hairline between them, the lead
// on its own line over the rest. The lead is 22px from lg and 20px between
// md and lg: at 22px "Tennis and fitness" ended 9px short of the hairline
// in the 240px columns of a 768px screen.
//
// No heading, no price, no group size, no link and no button: the main
// action sits in the hero above it and the programs follow below. The words
// live in src/content/bootcamp.ts. A full-bleed band with a hairline above
// and below: it puts the Container inside (audit H2).

const POINT_GLYPH = "h-6 w-6 shrink-0 text-[#B4E655] md:h-8 md:w-8";
/** The band draws its icons a little lighter than the site's 2, so three in a row stay quiet. */
const POINT_STROKE = 1.8;
const POINT_GLYPHS: Record<(typeof BOOTCAMP_POINTS)[number]["icon"], ReactNode> = {
  rotate: <RotateIcon className={POINT_GLYPH} strokeWidth={POINT_STROKE} />,
  play: <PointPlayIcon className={POINT_GLYPH} strokeWidth={POINT_STROKE} />,
  players: <PlayersIcon className={POINT_GLYPH} strokeWidth={POINT_STROKE} />,
};

export function BootcampPoints() {
  return (
    <section aria-label={BOOTCAMP_POINTS_LABEL} className="border-y border-white/10">
      <Container>
        <ul role="list" className="grid gap-3 py-[18px] md:grid-cols-3 md:gap-0 md:py-0">
          {BOOTCAMP_POINTS.map((point) => (
            <li
              key={point.lead}
              className="flex items-center gap-3 text-[15px] text-white/75 md:gap-4 md:border-l md:border-white/10 md:py-[26px] md:pl-8 md:text-base md:first:border-l-0 md:first:pl-0"
            >
              {POINT_GLYPHS[point.icon]}
              {/* One line on a phone; from md the lead sits on its own line
                  over the rest (a grid puts each on a row). */}
              <span className="min-w-0 md:grid">
                <b className="font-semibold text-white md:text-xl md:leading-tight md:tracking-[-0.02em] lg:text-[22px]">
                  {point.lead}
                </b>{" "}
                {point.rest}
              </span>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
