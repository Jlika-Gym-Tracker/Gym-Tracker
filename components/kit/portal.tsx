"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

const subscribe = () => () => {};

/**
 * Renders into <body>, outside the page tree.
 *
 * Anything `position: fixed` belongs here. A transform, filter or `contain` on
 * any ancestor turns that ancestor into the containing block for fixed
 * descendants — so an overlay rendered inside <main> quietly sizes itself to
 * <main> instead of the screen. That is how the exercise drawer ended up
 * 1600px tall with nothing to scroll.
 */
export function Portal({ children }: { children: React.ReactNode }) {
  // False on the server and during hydration, true after: document.body only
  // exists on the client.
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  return mounted ? createPortal(children, document.body) : null;
}
