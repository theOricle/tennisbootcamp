"use client";

import { useEffect } from "react";
import { captureFirstTouch } from "@/lib/firstTouchBrowser";

/**
 * Records where a visitor came from on the first page load (backlog #26):
 * a tagged URL or an external referrer goes into localStorage once, for 90
 * days, and the quiz sends it with the answers. Client-side navigations keep
 * the same landing, so a mount effect is enough. Renders nothing, sends
 * nothing, and never touches GA.
 */
export function FirstTouchCapture() {
  useEffect(() => {
    captureFirstTouch();
  }, []);
  return null;
}
