import type { Event } from "@/types/event";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

type EventsListProps = {
  events: Event[];
  title?: string;
};

export function EventsList({ events, title = "Upcoming events" }: EventsListProps) {
  const real = events.filter((e) => !e.placeholder);

  return (
    <section className="mx-auto max-w-6xl px-6 py-12">
      <h2 className="text-2xl font-semibold text-white">{title}</h2>

      {real.length === 0 ? (
        <p className="mt-6 text-sm text-white/50">
          Sessions for the upcoming season are being scheduled — check back soon.
        </p>
      ) : (
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          {real.map((e) => (
            <Card key={e.id}>
              <div className="p-6">
                <div className="text-lg font-semibold text-white">{e.title}</div>
                <div className="mt-2 text-sm text-white/70">{e.dateRange}</div>
                <div className="mt-2 text-sm text-white/70">{e.address}</div>

                {e.ctaHref ? (
                  <div className="mt-5">
                    <Button variant="secondary" href={e.ctaHref}>
                      {e.ctaText ?? "Details"}
                    </Button>
                  </div>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
