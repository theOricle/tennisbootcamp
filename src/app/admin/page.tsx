import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { getAdminUser } from "@/lib/adminAuth";

export const metadata: Metadata = {
  title: "Admin",
  description: "Tennis Bootcamp admin.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const CARDS = [
  {
    href: "/admin/assessments",
    title: "Assessments",
    body: "Open blocks, work the request queue, complete bookings with a level.",
  },
  {
    href: "/admin/players",
    title: "Players",
    body: "The assessed pool — levels, availability, and coach corrections.",
  },
  {
    href: "/admin/cohorts",
    title: "Cohorts",
    body: "Build private groups, send invites, manage sessions and make-ups.",
  },
];

export default async function AdminHomePage() {
  const admin = await getAdminUser();
  if (!admin) redirect("/login");

  return (
    <main className="min-h-screen bg-[#061427] text-white">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#B4E655]">
            Admin
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">
            Coach&apos;s desk
          </h1>
        </header>

        <div className="grid gap-3">
          {CARDS.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="block min-h-[44px] rounded-2xl border border-white/10 bg-white/5 p-5 transition hover:border-[#B4E655]/50 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427]"
            >
              <p className="text-base font-semibold text-white">
                {card.title} <span className="text-[#B4E655]">→</span>
              </p>
              <p className="mt-1 text-sm text-white/55">{card.body}</p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
