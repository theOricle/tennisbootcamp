// The funnel is quiz-first (owner 2026-10-02): Sina places every player from
// the 2-minute quiz, and the on-court assessment is optional.
const signals = [
  {
    label: "Structured coaching",
    body: "Technique, tactics, fitness, and mental game, coached as one system.",
  },
  {
    label: "Placed by Sina",
    body: "Every player is placed by level and schedule from the 2-minute quiz. The 20-minute on-court assessment is optional, if you want your level confirmed first.",
  },
];

export function TrustBar() {
  return (
    <div className="border-y border-white/10">
      <div className="mx-auto grid max-w-6xl gap-0 px-6 md:grid-cols-2">
        {signals.map((s, i) => (
          <div
            key={s.label}
            className={`py-6 md:py-8 md:pr-8 ${i !== 0 ? "border-t border-white/10 md:border-t-0 md:border-l md:border-white/10 md:pl-8" : ""}`}
          >
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[#B4E655]" />
              <span className="text-sm font-semibold text-white">{s.label}</span>
            </div>
            <p className="mt-2 text-sm text-white/75 leading-relaxed">{s.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
