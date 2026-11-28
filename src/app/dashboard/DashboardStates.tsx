import { Button } from "@/components/ui/Button";
import { CARD_CLASS } from "@/components/ui/Card";
import { Heading } from "@/components/ui/Heading";

// The dashboard while it loads, and when its rows cannot be read (backlog
// #105): both in the page's own look, so neither is a different page.

// ─── Skeleton ────────────────────────────────────────────────────────────────

/** A section's ghost: its heading on the left, its rows on the right from lg. */
function SectionGhost({ rows }: { rows: number }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.3fr)] lg:gap-12">
      <div className="h-8 w-40 rounded bg-white/10" />
      <div className="divide-y divide-white/10 border-y border-white/10">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-start gap-4 py-4">
            <div className="h-11 w-11 shrink-0 rounded-xl bg-white/5" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-5 w-36 rounded bg-white/10" />
              <div className="h-3 w-56 max-w-full rounded bg-white/5" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The page's own shape while it loads: the welcome, the next step, two sections. */
export function DashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-8 md:space-y-10">
      <div className="h-9 w-64 max-w-full rounded bg-white/10" />
      <div className={`${CARD_CLASS} p-6 md:p-8`}>
        <div className="h-8 w-3/4 rounded bg-white/10" />
        <div className="mt-4 h-3 w-full max-w-xl rounded bg-white/5" />
        <div className="mt-2 h-3 w-2/3 max-w-md rounded bg-white/5" />
        <div className="mt-6 h-11 w-44 rounded-full bg-white/10" />
      </div>
      <div className="space-y-12 pt-4 md:space-y-16 md:pt-6">
        <SectionGhost rows={2} />
        <SectionGhost rows={2} />
      </div>
    </div>
  );
}

// ─── Error state ─────────────────────────────────────────────────────────────

/**
 * The account's rows could not be read. Says what is wrong and the two ways
 * out: load the page again, or the human fallback (voice.md).
 */
export function DashboardErrorState() {
  return (
    <div className="py-10 md:py-16">
      <Heading as="h1">Couldn&apos;t load your dashboard right now.</Heading>
      <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-white/75">
        Refresh the page. If it keeps happening, email{" "}
        <a href="mailto:info@tennisbootcamp.ca" className="text-[#B4E655] underline-offset-2 hover:underline">
          info@tennisbootcamp.ca
        </a>
        .
      </p>
      <Button variant="secondary" href="/dashboard" className="mt-6">
        Refresh
      </Button>
    </div>
  );
}
