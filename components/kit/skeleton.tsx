import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** A shimmering block. Sized by the caller to match the real content's shape. */
export function Bone({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse rounded-lg bg-[#171b1d]", className)}
    />
  );
}

export function CardSkeleton({
  className,
  lines = 3,
}: {
  className?: string;
  lines?: number;
}) {
  return (
    <div className={cn("rounded-[20px] border border-line bg-surface p-5", className)}>
      <Bone className="h-2.5 w-20" />
      <div className="mt-4 flex flex-col gap-2.5">
        {Array.from({ length: lines }, (_, i) => (
          <Bone key={i} className={cn("h-3.5", i === lines - 1 ? "w-1/2" : "w-full")} />
        ))}
      </div>
    </div>
  );
}

/** Wraps a route's skeleton so the shell does not jump while data loads. */
export function ScreenSkeleton({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div role="status" aria-label={`Loading ${label}`} className="animate-rise-in">
      <span className="sr-only">Loading {label}…</span>
      {children}
    </div>
  );
}

/**
 * A quiet "still writing" marker for optimistic updates.
 *
 * Toggling an allergen or ticking a grocery item changes the screen at once and
 * saves in the background. Without this the save is invisible, so leaving the
 * page early looks safe when it is not.
 */
export function Saving({ busy, className }: { busy: boolean; className?: string }) {
  if (!busy) return null;
  return (
    <span
      role="status"
      className={cn(
        "inline-flex items-center gap-1.5 font-mono text-[10px] font-medium tracking-[0.1em] text-fg-dim uppercase",
        className,
      )}
    >
      <Loader2 className="size-3 animate-spin" aria-hidden />
      Saving
    </span>
  );
}
