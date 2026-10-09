import type { Event } from "@/types/event";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Heading } from "@/components/ui/Heading";

type EventsListProps = {
  events: Event[];
  title?: string;
};

export function EventsList({ events, title = "Upcoming events" }: EventsListProps) {
  const real = events.filter((e) => !e.placeholder);

  return (
    // No padding or width of its own: the page's Container sets both (audit H2).
    <section aria-labelledby="events-title">
      <Heading id="events-title">{title}</Heading>

      {real.length === 0 ? (
        <p className="mt-6 text-sm text-white/60">
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
