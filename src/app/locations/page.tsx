import type { Metadata } from "next";
import { locations } from "@/content/locations";
import { LocationsGrid } from "@/components/sections/LocationsGrid";

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

      <LocationsGrid locations={locations} title="Locations" />
    </main>
  );
}
