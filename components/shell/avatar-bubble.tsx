import { cn } from "@/lib/utils";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

/**
 * Circular avatar. Falls back to initials on a lime-tinted disc — no stock
 * photography in the real app, unlike the mockup.
 */
export function AvatarBubble({
  name,
  src,
  size = 32,
  className,
}: {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  if (src) {
    return (
      // Avatars come from Supabase Storage / OAuth providers at unknown hosts,
      // so next/image would need a remotePatterns entry per provider.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        width={size}
        height={size}
        className={cn("flex-none rounded-full object-cover", className)}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex flex-none items-center justify-center rounded-full border border-line-hi bg-accent-soft font-mono font-bold text-accent",
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials(name) || "?"}
    </div>
  );
}
