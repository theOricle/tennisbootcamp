const signals = [
  {
    label: "High-Performance Coaching",
    body: "Technique, tactics, fitness, and mental game under one structured system.",
  },
  {
    label: "Two Toronto Locations",
    body: "North York and Downtown. Find the session closest to you.",
  },
  {
    label: "Priority Placement",
    body: "Athletes who complete the intake are placed first as programs form.",
  },
];

export function TrustBar() {
  return (
    <div className="border-y border-white/10">
      <div className="mx-auto grid max-w-6xl gap-0 px-6 md:grid-cols-3">
        {signals.map((s, i) => (
          <div
            key={s.label}
            className={`py-8 pr-8 ${i !== 0 ? "md:border-l md:border-white/10 md:pl-8" : ""}`}
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
