import { cn } from "@/lib/utils";

/**
 * The loading mark: a barbell being loaded, lifted for one rep, and stripped.
 *
 * Plates go on inside-out — bumper, then the olive 15, then the steel change
 * plate, then the clip — and come off in the reverse order, the way a bar is
 * actually loaded. Pure SVG and CSS (see `.barbell` in globals.css), so it
 * animates in server-rendered HTML before any JavaScript has run, which is
 * what the boot splash needs.
 *
 * Decorative: whoever renders it owns the status text.
 */
export function BarbellLoader({
  width = 160,
  className,
}: {
  width?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 160 80"
      width={width}
      height={width / 2}
      aria-hidden
      className={cn("barbell", className)}
    >
      <ellipse className="barbell-shadow" cx="80" cy="73" rx="54" ry="2.5" />
      <g className="barbell-lift">
        {/* Shaft, then the thicker sleeves the plates ride on. */}
        <rect x="40" y="38.5" width="80" height="3" rx="1.5" className="fill-fg-dim" />
        <rect x="56" y="38.5" width="48" height="3" className="barbell-knurl" />
        <rect x="6" y="37" width="36" height="6" rx="2" className="fill-fg-soft" />
        <rect x="118" y="37" width="36" height="6" rx="2" className="fill-fg-soft" />
        {/* Fixed collars: the stop every plate is pushed up against. */}
        <rect x="40" y="32" width="3" height="16" rx="1" className="fill-fg-muted" />
        <rect x="117" y="32" width="3" height="16" rx="1" className="fill-fg-muted" />

        <g className="barbell-side barbell-left">
          <rect className="barbell-p1" x="33" y="17" width="6.5" height="46" rx="2" />
          <rect className="barbell-p2" x="25.5" y="23" width="6.5" height="34" rx="2" />
          <rect className="barbell-p3" x="20" y="29" width="4.5" height="22" rx="1.5" />
          <rect className="barbell-clip" x="15.5" y="34.5" width="3.5" height="11" rx="1" />
        </g>
        <g className="barbell-side barbell-right">
          <rect className="barbell-p1" x="120.5" y="17" width="6.5" height="46" rx="2" />
          <rect className="barbell-p2" x="128" y="23" width="6.5" height="34" rx="2" />
          <rect className="barbell-p3" x="135.5" y="29" width="4.5" height="22" rx="1.5" />
          <rect className="barbell-clip" x="141" y="34.5" width="3.5" height="11" rx="1" />
        </g>
      </g>
    </svg>
  );
}
