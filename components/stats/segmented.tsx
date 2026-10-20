"use client";

import { cn } from "@/lib/utils";

/**
 * The small mono switch the stats cards use to change what they show — the
 * same look as the pose switch on the photo card. Only for view state; a
 * control that saves something needs its own pending guard.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: readonly { key: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /** Names the group for screen readers, e.g. "Window". */
  label: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn("flex w-fit gap-1 rounded-[9px] border border-line bg-surface-2 p-[3px]", className)}
    >
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          aria-pressed={value === option.key}
          onClick={() => onChange(option.key)}
          className={cn(
            "hit rounded-md px-2.5 py-1.5 font-mono text-[11px] font-semibold whitespace-nowrap uppercase transition-colors",
            value === option.key ? "bg-accent text-[#0a0c0d]" : "text-fg-soft hover:text-fg",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
