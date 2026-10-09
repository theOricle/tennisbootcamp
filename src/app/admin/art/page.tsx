import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { adminRefusedRedirect, getAdminUser } from "@/lib/adminAuth";
import { ArtGallery } from "./ArtGallery";

export const metadata: Metadata = {
  title: "Program art — Admin",
  description: "The Court Plates gallery.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminArtPage() {
  const admin = await getAdminUser();
  if (!admin) redirect(await adminRefusedRedirect("/admin/art"));

  return (
    <main className="min-h-screen bg-[#061427] text-white">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="mb-10">
          <Link href="/admin" className="text-sm text-white/60 hover:text-white">
            ← Admin
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">
            Program art
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-white/70">
            The Court Plates: one court diagram per program, drawn in code, no
            photos and no text in the image. Every surface on the site draws
            from these.
          </p>
        </header>
        <ArtGallery />
      </div>
    </main>
  );
}
