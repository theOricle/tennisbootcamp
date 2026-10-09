import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { adminRefusedRedirect, getAdminUser } from "@/lib/adminAuth";
import { TierGallery } from "./TierGallery";

export const metadata: Metadata = {
  title: "Tiers — Admin",
  description: "The tier system, every emblem, rail, ladder and rank card in one place.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminTiersPage() {
  const admin = await getAdminUser();
  if (!admin) redirect(await adminRefusedRedirect("/admin/tiers"));

  return (
    <main className="min-h-screen bg-[#061427] text-white">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="mb-8">
          <Link href="/admin" className="text-sm text-white/60 hover:text-white">
            ← Admin
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">Tiers</h1>
          <p className="mt-1 text-sm text-white/55">
            A QA gallery of the tier system: the seven emblems in every state
            and size, the rail and the ladder in every mode, and the rank card
            fixtures. Nothing here reads or writes data.
          </p>
        </header>
        <TierGallery />
      </div>
    </main>
  );
}
