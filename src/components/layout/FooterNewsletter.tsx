"use client";

import { usePathname } from "next/navigation";
import { EmailCapture } from "@/components/sections/EmailCapture";
import { isPrivateAreaPath } from "@/lib/mainAction";
import { footerNewsletterSource } from "@/lib/newsletterSource";

/**
 * The footer's newsletter line. The footer is one component on every page,
 * so the line reads the page it sits on and records that as the signup's
 * source: the home page and the programs page keep the values they always
 * recorded (src/lib/newsletterSource.ts). The analytics event follows the
 * same value.
 */
export function FooterNewsletter({ id, className }: { id?: string; className?: string }) {
  // No fallback here: an unknown path records the footer's own value.
  const pathname = usePathname();
  // The signed-in pages (dashboard, profile, sign-up, admin) carry no
  // newsletter line (backlog #105): the rule reads the path only.
  if (isPrivateAreaPath(pathname)) return null;
  return (
    <div id={id} className={className}>
      <EmailCapture variant="line" source={footerNewsletterSource(pathname)} />
    </div>
  );
}
