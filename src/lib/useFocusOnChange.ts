"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Move keyboard and screen-reader focus to `ref` (a step's h1, with
 * tabIndex={-1}) whenever `key` changes, but not on the first render, so a
 * page load never steals focus (audit M19, WCAG 2.4.3). Used by the quiz and
 * the enroll wizard so pressing Next lands on the new step's heading instead
 * of a button that just changed or vanished.
 */
export function useFocusOnChange<T extends HTMLElement>(ref: RefObject<T | null>, key: unknown) {
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    ref.current?.focus();
  }, [key, ref]);
}

/** Move focus to `ref` once, when the component mounts (a result screen). */
export function useFocusOnMount<T extends HTMLElement>(ref: RefObject<T | null>) {
  useEffect(() => {
    ref.current?.focus();
  }, [ref]);
}
