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
