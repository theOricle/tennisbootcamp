import { coaches } from "@/content/coaches";
import { Coaches } from "@/components/sections/Coaches";

export default function AboutPage() {
  return (
    <main>
      <div className="tb-gradient">
        <div className="mx-auto max-w-6xl px-6 py-14">
          <h1 className="text-3xl font-semibold text-white">About Us</h1>
          <p className="mt-3 max-w-3xl text-white/70">
            Tennis Bootcamp is a high-performance program designed to help athletes take their game to the next
            level — focusing on technique, strategy, fitness, and mental toughness.
          </p>
        </div>
      </div>

      <Coaches coaches={coaches} title="Our team" />
    </main>
  );
}
