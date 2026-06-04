import type { Metadata } from "next";
import { locations } from "@/content/locations";

export const metadata: Metadata = {
  title: "Locations",
  description:
    "Tennis Bootcamp trains at two Toronto locations: Toronto Tennis City in North York and Tennis Lessons Toronto downtown.",
};

export default function LocationsPage() {
  return (
    <main>
      <div className="tb-gradient">
        <div className="mx-auto max-w-6xl px-6 py-14">
          <h1 className="text-3xl font-semibold text-white">Our Locations</h1>
          <p className="mt-3 max-w-2xl text-white/70">
            We run programs across Toronto. Pick the location that works best for you.
          </p>
        </div>
      </div>

      <section className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid gap-10 md:grid-cols-2">
          {locations.map((loc) => (
            <div
              key={loc.id}
              className="overflow-hidden rounded-2xl border border-white/10 bg-white/5"
            >
              {/* Google Maps embed */}
              <div className="relative h-56 w-full">
                <iframe
                  src={`https://maps.google.com/maps?q=${encodeURIComponent(loc.address)}&output=embed&hl=en`}
                  className="h-full w-full border-0"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  title={`Map — ${loc.name}`}
                />
              </div>

              <div className="p-6">
                <h2 className="text-lg font-semibold text-white">{loc.name}</h2>
                <p className="mt-1 text-sm text-white/70">{loc.address}</p>

                {/* Optional facility details */}
                {(loc.courts !== undefined || loc.indoor !== undefined || loc.parking) && (
                  <ul className="mt-3 space-y-1 text-sm text-white/60">
                    {loc.courts !== undefined && (
                      <li>{loc.courts} {loc.courts === 1 ? "court" : "courts"}</li>
                    )}
                    {loc.indoor !== undefined && (
                      <li>{loc.indoor ? "Indoor facility" : "Outdoor courts"}</li>
                    )}
                    {loc.parking && <li>Parking: {loc.parking}</li>}
                  </ul>
                )}

                {loc.notes && (
                  <p className="mt-3 text-sm text-white/50">{loc.notes}</p>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
                  {loc.phone && <span className="text-white/60">{loc.phone}</span>}
                  {loc.website && (
                    <a
                      href={loc.website.startsWith("http") ? loc.website : `https://${loc.website}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#B4E655] hover:underline"
                    >
                      {loc.website.replace(/^https?:\/\//, "")}
                    </a>
                  )}
                  <a
                    href={`https://maps.google.com/?q=${encodeURIComponent(loc.address)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-white/50 hover:text-white/80"
                  >
                    Get directions →
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
