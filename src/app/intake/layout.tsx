import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Find My Program",
  description:
    "Secure your spot in Tennis Bootcamp's next training program. Complete the intake and we'll match you to the right program.",
  robots: { index: false, follow: false },
};

export default function IntakeLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
