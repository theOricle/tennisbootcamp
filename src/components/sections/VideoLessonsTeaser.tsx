export function VideoLessonsTeaser() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-12">
      <h2 className="text-2xl font-semibold text-white">Video Lessons</h2>
      <p className="mt-3 max-w-2xl text-white/70">
        Members-only video lessons are coming soon. We&apos;ll publish free previews and unlock full lessons
        for enrolled athletes.
      </p>

      <div className="mt-8 grid gap-6 md:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-xl border border-white/10 bg-white/5">
            <div className="aspect-video bg-white/10" />
            <div className="p-4">
              <div className="text-sm font-semibold text-white">
                Beginner Tennis Lesson | Forehand, Backhand &amp; Serve
              </div>
              <div className="mt-2 text-xs text-white/60">Preview</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
