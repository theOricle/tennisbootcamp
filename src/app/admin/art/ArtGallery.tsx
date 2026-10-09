import { programs } from "@/content/programs";
import { PLATE_IDS, PLATE_SPECS, type PlateId } from "@/lib/plates/specs";
import { PLATE_FRAMES, type PlateFrame } from "@/lib/plates/tokens";
import { ProgramPlate } from "@/components/plates/ProgramPlate";
import { PlateMark } from "@/components/plates/PlateMark";
import { AgeBandChips } from "@/components/programs/AgeBandChips";
import { TIERS } from "@/lib/tiers";

// The Court Plates gallery Sina signs off on (owner D13; design specs §4.8):
// every plate in every frame, the coming-soon state, the Adult class focus,
// the Youth level profile, both sides of the court, the marks and the age
// chips. Pure rendering, no data fetching; the page wraps it in the admin gate.

const FRAMES: PlateFrame[] = ["master", "band", "strip"];
const ASPECT: Record<PlateFrame, string> = {
  master: "aspect-[16/10]",
  band: "aspect-[2/1]",
  strip: "aspect-[3/1]",
};

function Frame({ frame, children, className = "" }: { frame: PlateFrame; children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative w-full overflow-hidden rounded-2xl border border-white/10 bg-[#061427] ${ASPECT[frame]} ${className}`.trim()}>
      {children}
    </div>
  );
}

function Section({ id, title, body, children }: { id: string; title: string; body: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-12 first:mt-0">
      <h2 id={id} className="text-xl font-semibold tracking-tight text-white">{title}</h2>
      <p className="mt-1 max-w-2xl text-sm text-white/70">{body}</p>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Caption({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 text-xs text-white/60">{children}</p>;
}

const titleOf = (id: PlateId) => programs.find((p) => p.plate === id)?.title ?? "Fallback (any new program)";

export function ArtGallery() {
  const youth = programs.find((p) => p.plate === "youth-programs");
  const adult = programs.find((p) => p.plate === "bootcamps");

  return (
    <div>
      <Section
        id="plates"
        title="Every plate, every frame"
        body="One drawing per program from one camera; three crops. master is the detail page (16:10), band the program card (2:1), strip the dashboard, admin and OG card (3:1). The plate is text-free: age, level and price are UI under it."
      >
        <div className="space-y-10">
          {PLATE_IDS.map((id) => (
            <div key={id}>
              <h3 className="text-base font-semibold text-white">
                {titleOf(id)} <span className="font-normal text-white/60">· {PLATE_SPECS[id].name}</span>
              </h3>
              <div className="mt-3 grid gap-4 md:grid-cols-3">
                {FRAMES.map((frame) => (
                  <div key={frame}>
                    <Frame frame={frame}>
                      <ProgramPlate plate={id} frame={frame} density="compact" />
                    </Frame>
                    <Caption>
                      {frame} · {PLATE_FRAMES[frame].viewBox}
                    </Caption>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section
        id="hero"
        title="Detail-page hero"
        body="The master frame at hero density, the figcaption under it. On the live page the traces wipe in once on load (motion-safe only)."
      >
        <div className="grid gap-6 md:grid-cols-2">
          {[youth, adult].map((p) =>
            p ? (
              <figure key={p.id}>
                <Frame frame="master">
                  <ProgramPlate plate={p.plate} frame="master" density="hero" label={p.plateAlt} animate />
                </Frame>
                <figcaption className="mt-2 text-xs text-white/60">{p.plateCaption}</figcaption>
              </figure>
            ) : null
          )}
        </div>
      </Section>

      <Section
        id="coming-soon"
        title="Coming soon"
        body="Long-dashed traces and outline-only bounce marks. The same plate goes solid when the program opens; the Kids' Summer Camp plate is in this state today."
      >
        <div className="grid gap-4 md:grid-cols-3">
          {(["youth-programs", "high-performance", "bootcamps"] as PlateId[]).map((id) => (
            <div key={id}>
              <Frame frame="band">
                <ProgramPlate plate={id} frame="band" density="compact" comingSoon />
              </Frame>
              <Caption>{titleOf(id)} · coming soon</Caption>
            </div>
          ))}
        </div>
      </Section>

      <Section
        id="focus"
        title="Adult Bootcamps: class focus"
        body="A cohort's plate lights the class it trains in. 4:00 newer, 5:00 intermediate, 6:00 advanced; the other two flights step down."
      >
        <div className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((slot) => (
            <div key={slot}>
              <Frame frame="band">
                <ProgramPlate plate="bootcamps" frame="band" density="compact" focusSlot={slot} />
              </Frame>
              <Caption>
                focus {slot} · {adult?.timetable?.[slot]?.day.slice(0, 3)} {adult?.timetable?.[slot]?.time.split("–")[0]} · {adult?.timetable?.[slot]?.group}
              </Caption>
            </div>
          ))}
        </div>
      </Section>

      <Section
        id="profile"
        title="Youth Programs: level profile"
        body="A cohort's level band profiles the signature flight: the higher the tier, the flatter the ball and the deeper it lands. Base plate first, then Love, Break and Grand Slam cohorts."
      >
        <div className="grid gap-4 md:grid-cols-4">
          <div>
            <Frame frame="band">
              <ProgramPlate plate="youth-programs" frame="band" density="compact" />
            </Frame>
            <Caption>program plate (no band)</Caption>
          </div>
          {[1, 4, 7].map((tier) => (
            <div key={tier}>
              <Frame frame="band">
                <ProgramPlate plate="youth-programs" frame="band" density="compact" levelMin={tier} levelMax={tier + 0.5} />
              </Frame>
              <Caption>
                {TIERS[tier - 1].name} cohort · level {tier.toFixed(1)}
              </Caption>
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-4">
          {[1, 4, 7].map((tier) => (
            <div key={tier}>
              <Frame frame="strip">
                <ProgramPlate plate="high-performance" frame="strip" density="compact" levelMin={tier} levelMax={7} />
              </Frame>
              <Caption>High Performance · {TIERS[tier - 1].name} and up · strip</Caption>
            </div>
          ))}
        </div>
      </Section>

      <Section
        id="side"
        title="Deuce and ad side"
        body="The side of the court is hashed from the cohort id, so two cohorts of one program need not look identical. u is never mirrored: the ball still travels left to right."
      >
        <div className="grid gap-4 md:grid-cols-2">
          {(["cohort-a", "cohort-b"] as const).map((seed) => (
            <div key={seed}>
              <Frame frame="strip">
                <ProgramPlate plate="high-performance" frame="strip" density="compact" seed={seed} levelMin={3} levelMax={4.5} />
              </Frame>
              <Caption>seed &quot;{seed}&quot;</Caption>
            </div>
          ))}
        </div>
      </Section>

      <Section
        id="marks"
        title="Marks"
        body="Plan-view thumbnails of the target half-court for cohort cards, dashboard rows and admin lists. 56, 48 and 40px; the Adult mark follows the class focus."
      >
        <div className="flex flex-wrap gap-8">
          {PLATE_IDS.map((id) => (
            <div key={id} className="flex flex-col items-start gap-2">
              <div className="flex items-end gap-3">
                <PlateMark plate={id} size={56} />
                <PlateMark plate={id} size={48} />
                <PlateMark plate={id} size={40} />
              </div>
              <span className="text-xs text-white/60">{titleOf(id)}</span>
            </div>
          ))}
          <div className="flex flex-col items-start gap-2">
            <div className="flex items-end gap-3">
              {[0, 1, 2].map((slot) => (
                <PlateMark key={slot} plate="bootcamps" size={48} focusSlot={slot} />
              ))}
            </div>
            <span className="text-xs text-white/60">Adult Bootcamps · focus 0, 1, 2</span>
          </div>
        </div>
      </Section>

      <Section
        id="age"
        title="Age chips"
        body="Age as shape plus text, in neutral white: the band's bar is lit on a three-step glyph. All three bands read as one Any age chip."
      >
        <div className="space-y-3">
          {programs
            .filter((p) => !p.unlisted)
            .map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-3">
                <span className="w-40 text-sm text-white/85">{p.title}</span>
                <AgeBandChips bands={p.ageBands} />
              </div>
            ))}
        </div>
      </Section>

      <Section
        id="og"
        title="Share cards"
        body="Each program's OG image carries its strip plate under the title. Open one to check the raster."
      >
        <ul role="list" className="flex flex-wrap gap-3">
          {programs
            .filter((p) => !p.unlisted)
            .map((p) => (
              <li key={p.id}>
                <a
                  href={`/programs/${p.slug}/opengraph-image`}
                  className="inline-flex min-h-[44px] items-center rounded-full border border-white/25 px-4 text-sm font-semibold text-white/80 transition hover:border-white/45 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427]"
                >
                  {p.title} card
                </a>
              </li>
            ))}
        </ul>
      </Section>
    </div>
  );
}
