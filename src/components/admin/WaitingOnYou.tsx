import Link from "next/link";
import { DESK_HEADING, DESK_QUIET_LINE, type Desk } from "@/lib/adminDesk";

// "Waiting on you" on /admin (backlog #104): each line a count the eye
// lands on first, a few plain words and the page where it is done. When
// nothing waits, one quiet line; when a read failed, a line that says it
// couldn't check, never that nothing waits.

export function WaitingOnYou({ desk }: { desk: Desk }) {
  return (
    <section aria-labelledby="desk-heading" className="mb-8">
      <h2 id="desk-heading" className="text-sm font-semibold uppercase tracking-wide text-white/60">
        {DESK_HEADING}
      </h2>

      {desk.lines.length > 0 && (
        <ul className="mt-3 divide-y divide-white/10 overflow-hidden rounded-2xl border border-[#B4E655]/30 bg-white/5">
          {desk.lines.map((line) => (
            <li key={line.key}>
              <Link
                href={line.href}
                className="flex min-h-[56px] items-center gap-4 px-4 py-3 transition hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#B4E655]/60"
              >
                <span className="w-9 shrink-0 text-center text-2xl font-semibold tabular-nums leading-none text-[#B4E655]">
                  {line.count}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-white">{line.text}</span>
                  {line.detail && (
                    <span className="mt-0.5 block text-xs text-white/60 [overflow-wrap:anywhere]">{line.detail}</span>
                  )}
                </span>
                <span aria-hidden className="shrink-0 text-[#B4E655]">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {desk.gaps.map((gap) => (
        <p
          key={gap.key}
          role="status"
          className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-yellow-400/30 bg-yellow-400/10 px-4 py-3 text-sm text-yellow-200"
        >
          <span>{gap.text}</span>
          <Link href={gap.href} className="font-semibold text-white underline underline-offset-4 hover:text-[#B4E655]">
            {gap.linkLabel}
          </Link>
        </p>
      ))}

      {desk.quiet && <p className="mt-3 text-sm text-white/60">{DESK_QUIET_LINE}</p>}
    </section>
  );
}
