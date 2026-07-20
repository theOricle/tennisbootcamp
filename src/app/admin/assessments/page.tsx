import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getAdminUser } from "@/lib/adminAuth";
import { AdminAssessmentsClient } from "./AdminAssessmentsClient";

export const metadata: Metadata = {
  title: "Assessments — Admin",
  description: "Manage assessment blocks and bookings.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminAssessmentsPage() {
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
            Assessments
          </h1>
          <p className="mt-1 text-sm text-white/55">
            Open blocks, book slots, and complete assessments with a level.
          </p>
        </header>
        <AdminAssessmentsClient />
      </div>
    </main>
  );
}
