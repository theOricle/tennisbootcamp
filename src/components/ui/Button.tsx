import Link from "next/link";
import type { ComponentProps } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "md" | "compact";

const base =
  "inline-flex min-h-[44px] items-center justify-center rounded-full py-3 text-sm font-semibold transition " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 " +
  "focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427] " +
  "disabled:cursor-not-allowed disabled:opacity-50";

// One hover spec per weight (audit M12): the lime primary brightens, the
// outline secondary firms its border and text. Lime is the only CTA colour.
const variants: Record<ButtonVariant, string> = {
  primary: "bg-[#B4E655] text-[#061427] hover:brightness-110",
  secondary: "border border-white/25 text-white/80 hover:border-white/45 hover:text-white",
  ghost: "text-white/80 hover:bg-white/5 hover:text-white",
};

const sizes: Record<ButtonSize, string> = {
  md: "px-6",
  compact: "px-5",
};

/**
 * The button classes, for a native <button> (a form submit) that must look
 * like the linked Button. Always 44px tall or more.
 */
export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md"): string {
  return `${base} ${variants[variant]} ${sizes[size]}`;
}

type ButtonProps = ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({ variant = "primary", size = "md", className = "", ...props }: ButtonProps) {
  return <Link className={`${buttonClass(variant, size)} ${className}`.trim()} {...props} />;
}
