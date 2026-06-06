import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center px-6 bg-[#061427] text-white">
      <div className="max-w-lg w-full text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-[#B4E655]">404</p>
        <h1 className="mt-3 text-3xl font-semibold text-white">
          We couldn&apos;t find that page.
        </h1>
        <p className="mt-3 text-white/60">Maybe these links help —</p>

        <div className="mt-10 grid gap-3 sm:grid-cols-3">
          <Link
            href="/"
            className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-sm font-semibold text-white transition hover:border-[#B4E655]/40 hover:bg-[#B4E655]/5 hover:text-[#B4E655]"
          >
            Home
          </Link>
          <Link
            href="/programs"
            className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-sm font-semibold text-white transition hover:border-[#B4E655]/40 hover:bg-[#B4E655]/5 hover:text-[#B4E655]"
          >
            Programs
          </Link>
          <Link
            href="/intake"
            className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-sm font-semibold text-white transition hover:border-[#B4E655]/40 hover:bg-[#B4E655]/5 hover:text-[#B4E655]"
          >
            Get Priority Placement
          </Link>
        </div>
      </div>
    </main>
  );
}
