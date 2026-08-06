import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { getAdminUser } from "@/lib/adminAuth";
import { AdminCohortDetailClient } from "./AdminCohortDetailClient";

export const metadata: Metadata = {
  title: "Cohort — Admin",
  description: "Manage a cohort.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function AdminCohortDetailPage({ params }: PageProps) {
  const admin = await getAdminUser();
  if (!admin) redirect("/login");
  const { id } = await params;

  return (
    <main className="min-h-screen bg-[#061427] text-white">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="mb-6">
          <Link href="/admin/cohorts" className="text-sm text-white/50 hover:text-white">
            ← Cohorts
          </Link>
        </header>
        <AdminCohortDetailClient cohortId={id} />
      </div>
    </main>
  );
}
