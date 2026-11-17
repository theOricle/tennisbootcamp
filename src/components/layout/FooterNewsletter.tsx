"use client";

import { usePathname } from "next/navigation";
import { EmailCapture } from "@/components/sections/EmailCapture";
import { footerNewsletterSource } from "@/lib/newsletterSource";

/**
 * The footer's newsletter line. The footer is one component on every page,
 * so the line reads the page it sits on and records that as the signup's
 * source: the home page and the programs page keep the values they always
 * recorded (src/lib/newsletterSource.ts). The analytics event follows the
 * same value.
 */
export function FooterNewsletter() {
  // No fallback here: an unknown path records the footer's own value.
  const pathname = usePathname();
  return <EmailCapture variant="line" source={footerNewsletterSource(pathname)} />;
}
