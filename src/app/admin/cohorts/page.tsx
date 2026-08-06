import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { getAdminUser } from "@/lib/adminAuth";
import { AdminCohortsClient } from "./AdminCohortsClient";

export const metadata: Metadata = {
  title: "Cohorts — Admin",
  description: "Create and manage cohorts.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminCohortsPage() {
  const admin = await getAdminUser();
  if (!admin) redirect("/login");

  const seasonEndDate = process.env.SEASON_END_DATE || "2026-11-30";

  return (
    <main className="min-h-screen bg-[#061427] text-white">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="mb-8">
          <Link href="/admin" className="text-sm text-white/50 hover:text-white">
            ← Admin
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">
            Cohorts
          </h1>
          <p className="mt-1 text-sm text-white/55">
            Build a group, invite players, and it confirms itself at minimum
            paid count.
          </p>
        </header>
        <AdminCohortsClient seasonEndDate={seasonEndDate} />
      </div>
    </main>
  );
}
