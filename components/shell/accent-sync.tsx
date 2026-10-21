"use client";

import { useEffect } from "react";
import { ACCENT_COOKIE, DEFAULT_ACCENT, isAccent } from "@/lib/theme/accent";

/**
 * Keeps <html data-accent> and its cookie in step with the profile. The <head>
 * script applies the cookie before paint; this covers a new device, a cleared
 * cookie, or a change made on another phone — one frame of the old colour at
 * most, then the account's own.
 */
export function AccentSync({ accent }: { accent: string }) {
  useEffect(() => {
    const value = isAccent(accent) ? accent : DEFAULT_ACCENT;
    const root = document.documentElement;
    if (value === DEFAULT_ACCENT) root.removeAttribute("data-accent");
    else root.setAttribute("data-accent", value);
    document.cookie = `${ACCENT_COOKIE}=${value}; path=/; max-age=31536000; samesite=lax`;
  }, [accent]);
  return null;
}
