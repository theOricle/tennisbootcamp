import Link from "next/link";
import type { ComponentProps } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";

type ButtonProps = ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
};

const base =
  "inline-flex items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold transition " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/60";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-[#B4E655] text-[#061427] hover:brightness-110",
  secondary: "bg-white/10 text-white hover:bg-white/15 border border-white/10",
  ghost: "text-white/80 hover:text-white hover:bg-white/5",
};

export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  return <Link className={`${base} ${variants[variant]} ${className}`} {...props} />;
}
