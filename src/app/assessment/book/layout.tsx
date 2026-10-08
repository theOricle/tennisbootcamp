import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Book Your Assessment",
  description: "Pick a slot for your 20-minute player assessment.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/assessment/book" },
};

export default function BookLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
