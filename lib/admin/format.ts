/**
 * Time formatting for the operator dashboard. Pure; every function takes "now"
 * and dates are written in UTC, so a server-rendered value and its client
 * hydration agree whatever the browser's time zone.
 */

const DAY = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/** "8m", "1h 05m". Floors, so a session is never reported longer than it is. */
export function formatElapsed(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${String(minutes % 60).padStart(2, "0")}m`;
}

/** "just now", "5m ago", "3h ago", "12d ago", then a date past 30 days. */
export function formatAgo(iso: string | null | undefined, now: Date): string {
  if (!iso) return "never";
  const seconds = Math.max(0, (now.getTime() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 30 * 86_400) return `${Math.floor(seconds / 86_400)}d ago`;
  return formatDay(iso);
}

/** "Oct 3, 2026", in UTC. */
export function formatDay(iso: string): string {
  return DAY.format(new Date(iso));
}
