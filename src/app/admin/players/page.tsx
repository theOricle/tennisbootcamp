import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { getAdminUser } from "@/lib/adminAuth";
import { AdminPlayersClient } from "./AdminPlayersClient";

export const metadata: Metadata = {
  title: "Players — Admin",
  description: "Player pool — leveled and waiting for a level.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminPlayersPage() {
  const admin = await getAdminUser();
  if (!admin) redirect("/login");

  return (
    <main className="min-h-screen bg-[#061427] text-white">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="mb-8">
          <Link href="/admin" className="text-sm text-white/50 hover:text-white">
            ← Admin
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">
            Players
          </h1>
          <p className="mt-1 text-sm text-white/55">
            Everyone with an account. Unleveled players came in through the
            2-minute quiz or an assessment request — tap one to set their level.
            Tap a leveled player to correct their level, note, or availability.
          </p>
        </header>
        <AdminPlayersClient />
      </div>
    </main>
  );
}
