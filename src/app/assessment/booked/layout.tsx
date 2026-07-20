import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "You're booked",
  description: "Your assessment is confirmed.",
  robots: { index: false, follow: false },
};

export default function BookedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
