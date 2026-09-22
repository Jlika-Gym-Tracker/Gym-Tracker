"use client";

import { useLinkStatus } from "next/link";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Feedback the instant a nav link is tapped.
 *
 * A route's loading.tsx only appears once the server starts responding. Before
 * that — the whole round trip on a slow connection — nothing moved, so a tap
 * looked ignored and invited a second one. Must be rendered inside the <Link>
 * it belongs to: useLinkStatus reports on the nearest one.
 */
export function NavSpinner({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <Loader2
      aria-label="Loading"
      role="status"
      className={cn("size-3.5 animate-spin text-accent", className)}
    />
  );
}
