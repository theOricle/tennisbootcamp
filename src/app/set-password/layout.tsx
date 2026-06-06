import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Set Password",
  description: "Create a password to secure your Tennis Bootcamp account.",
  robots: { index: false, follow: false },
};

export default function SetPasswordLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
