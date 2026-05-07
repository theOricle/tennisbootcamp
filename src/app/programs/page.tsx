import type { Metadata } from "next";
import { programs } from "@/content/programs";
import { ProgramsGrid } from "@/components/sections/ProgramsGrid";
import { EmailCapture } from "@/components/sections/EmailCapture";

export const metadata: Metadata = {
  title: "Programs",
  description:
    "Competitive bootcamps, group lessons, and summer camps for tennis players of all levels in Toronto.",
};

export default function ProgramsPage() {
  return (
    <main>
      <div className="tb-gradient">
        <div className="mx-auto max-w-6xl px-6 py-14">
          <h1 className="text-3xl font-semibold text-white">Our Programs</h1>
          <p className="mt-3 max-w-2xl text-white/70">
            Choose the program that matches your level and goals. Registrations are opening soon.
          </p>
        </div>
      </div>

      <EmailCapture />
      <ProgramsGrid programs={programs} title="Programs" />
    </main>
  );
}
