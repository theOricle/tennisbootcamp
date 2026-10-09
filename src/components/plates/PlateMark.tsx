import { COURT } from "@/lib/plates/geometry";
import { MARK_SPECS, type MarkLine, plateSpec } from "@/lib/plates/specs";
import { PLATE_COLOR } from "@/lib/plates/tokens";

// A plan-view thumbnail of a program's target half-court (design specs §4.6):
// the net on the left edge, one motif per program, 40–64px, about 1 KB.
// Always decorative: it sits beside the program's title in cohort cards,
// dashboard rows and admin lists, and the text carries the meaning.

const BOX = 96;
const SCALE = BOX / 13.2;
const OX = 6;
const OY = BOX / 2;
const X = (u: number) => OX + u * SCALE;
const Y = (v: number) => OY - v * SCALE;
const f1 = (n: number) => n.toFixed(1);

function rectPath(u0: number, v0: number, u1: number, v1: number): string {
  return `M${f1(X(u0))} ${f1(Y(v0))}H${f1(X(u1))}V${f1(Y(v1))}H${f1(X(u0))}Z`;
}

const { halfLength: L, halfDoubles: DW, halfSingles: SW, serviceLine: SL, postV } = COURT;

const COURT_LINES = [
  rectPath(0, -DW, L, DW),
  `M${f1(X(0))} ${f1(Y(-SW))}H${f1(X(L))}`,
  `M${f1(X(0))} ${f1(Y(SW))}H${f1(X(L))}`,
  `M${f1(X(SL))} ${f1(Y(-SW))}V${f1(Y(SW))}`,
  `M${f1(X(0))} ${f1(Y(0))}H${f1(X(SL))}`,
].join("");

const NET_LINE = `M${f1(X(0))} ${f1(Y(-postV))}V${f1(Y(postV))}`;

const color = (c: "lime" | "white") => (c === "lime" ? PLATE_COLOR.lime : PLATE_COLOR.white);

export function PlateMark({
  plate,
  size = 48,
  focusSlot,
  className = "",
}: {
  plate: string;
  /** 40, 48 or 56. */
  size?: number;
  /** Adult Bootcamps: which class line is the lime one (0, 1, 2). */
  focusSlot?: number | null;
  className?: string;
}) {
  const id = plateSpec(plate).id;
  const spec = MARK_SPECS[id];

  // The Adult mark swaps the lime line to the cohort's class; the other two
  // step down to white, the nearer class brighter.
  let lines: readonly MarkLine[] = spec.lines;
  if (id === "bootcamps" && typeof focusSlot === "number" && focusSlot >= 0 && focusSlot < spec.lines.length) {
    const others = spec.lines
      .map((_, i) => i)
      .filter((i) => i !== focusSlot)
      .sort((a, b) => Math.abs(a - focusSlot) - Math.abs(b - focusSlot));
    lines = spec.lines.map((line, i) =>
      i === focusSlot
        ? { ...line, color: "lime", width: 2, opacity: 1, dot: 3.2, dotOpacity: 1 }
        : { ...line, color: "white", width: 1.5, opacity: others.indexOf(i) === 0 ? 0.75 : 0.4, dot: 2.6, dotOpacity: others.indexOf(i) === 0 ? 0.85 : 0.5 }
    );
  }

  return (
    <svg
      viewBox={`0 0 ${BOX} ${BOX}`}
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${className}`.trim()}
    >
      <rect width={BOX} height={BOX} rx={14} fill={PLATE_COLOR.court} />
      <path d={COURT_LINES} fill="none" stroke={PLATE_COLOR.white} strokeOpacity={0.5} strokeWidth={1} vectorEffect="non-scaling-stroke" />
      <path d={NET_LINE} fill="none" stroke={PLATE_COLOR.white} strokeOpacity={0.85} strokeWidth={2} vectorEffect="non-scaling-stroke" />
      {spec.zone && (
        <path
          d={rectPath(spec.zone[0], spec.zone[1], spec.zone[2], spec.zone[3])}
          fill={PLATE_COLOR.lime}
          fillOpacity={0.16}
          stroke={PLATE_COLOR.lime}
          strokeOpacity={0.5}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      )}
      {lines.map((line, i) => (
        <g key={i}>
          <path
            d={`M${f1(X(line.from[0]))} ${f1(Y(line.from[1]))}L${f1(X(line.to[0]))} ${f1(Y(line.to[1]))}`}
            fill="none"
            stroke={color(line.color)}
            strokeOpacity={line.opacity ?? 1}
            strokeWidth={line.width ?? 2}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          {line.dot ? (
            <circle cx={f1(X(line.to[0]))} cy={f1(Y(line.to[1]))} r={line.dot} fill={color(line.color)} fillOpacity={line.dotOpacity ?? 1} />
          ) : null}
          {line.ring ? (
            <circle cx={f1(X(line.to[0]))} cy={f1(Y(line.to[1]))} r={7} fill="none" stroke={PLATE_COLOR.lime} strokeOpacity={0.6} strokeWidth={1} />
          ) : null}
        </g>
      ))}
      {spec.hoops?.map(([u, v], i) => (
        <circle key={`h${i}`} cx={f1(X(u))} cy={f1(Y(v))} r={5} fill="none" stroke={PLATE_COLOR.white} strokeOpacity={0.7} strokeWidth={1.2} />
      ))}
      {spec.cones?.map(([u, v], i) => (
        <path
          key={`c${i}`}
          d={`M${f1(X(u) - 3)} ${f1(Y(v) + 2.5)}L${f1(X(u) + 3)} ${f1(Y(v) + 2.5)}L${f1(X(u))} ${f1(Y(v) - 3.5)}Z`}
          fill={PLATE_COLOR.lime}
        />
      ))}
      {spec.arc && (
        <path
          d={`M${f1(X(spec.arc.from[0]))} ${f1(Y(spec.arc.from[1]))}Q${f1(X(spec.arc.ctrl[0]))} ${f1(Y(spec.arc.ctrl[1]))} ${f1(X(spec.arc.to[0]))} ${f1(Y(spec.arc.to[1]))}`}
          fill="none"
          stroke={PLATE_COLOR.lime}
          strokeWidth={2}
          strokeDasharray="4 3"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}
