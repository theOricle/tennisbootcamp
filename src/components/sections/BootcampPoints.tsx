import type { ReactNode } from "react";
import { BOOTCAMP_POINTS, BOOTCAMP_POINTS_LABEL } from "@/content/bootcamp";
import { Container } from "@/components/layout/Container";
import { PowerIcon, StairsIcon, TechniqueIcon } from "@/components/ui/icons";

// What a bootcamp is, in three points (owner, 2026-11-17): a thin band
// straight under the home page's hero, in place of the large Tennis and
// Fitness section, which moved to About. The two parts of every class, each
// with what it trains, then the levels (owner, 2026-11-19): Tennis (the
// racket), Fitness (the bolt), the levels to climb (the stairs). A real list
// of three, each an icon and one phrase with a bold lead. On a phone: three
// short rows, one line each. From md: three equal columns with a hairline
// between them, the lead on its own line over the rest. The lead is 22px
// from lg and 20px between md and lg, a step set for an earlier, longer
// lead and kept so the band keeps its classes and its height. Every phrase
// keeps to one line on a phone from 330px wide and from about 810px; in the
// narrowest columns of md, 768 to about 805px, the first point's rest takes
// two lines, and to about 785px the second's too.
//
// No heading, no price, no group size, no link and no button: the main
// action sits in the hero above it and the programs follow below. The words
// live in src/content/bootcamp.ts. A full-bleed band with a hairline above
// and below: it puts the Container inside (audit H2).

const POINT_GLYPH = "h-6 w-6 shrink-0 text-[#B4E655] md:h-8 md:w-8";
/** The band draws its icons a little lighter than the site's 2, so three in a row stay quiet. */
const POINT_STROKE = 1.8;
const POINT_GLYPHS: Record<(typeof BOOTCAMP_POINTS)[number]["icon"], ReactNode> = {
  technique: <TechniqueIcon className={POINT_GLYPH} strokeWidth={POINT_STROKE} />,
  power: <PowerIcon className={POINT_GLYPH} strokeWidth={POINT_STROKE} />,
  stairs: <StairsIcon className={POINT_GLYPH} strokeWidth={POINT_STROKE} />,
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
