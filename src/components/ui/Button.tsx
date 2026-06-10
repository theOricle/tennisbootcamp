import Link from "next/link";
import type { ComponentProps } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";

type ButtonProps = ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
};

const base =
  "inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold transition " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 " +
  "focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427]";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-[#B4E655] text-[#061427] hover:brightness-110",
  secondary: "border border-white/25 bg-transparent text-white/80 hover:border-white/45 hover:text-white",
  ghost: "text-white/80 hover:text-white hover:bg-white/5",
};

export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  return <Link className={`${base} ${variants[variant]} ${className}`} {...props} />;
}
