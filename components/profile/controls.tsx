"use client";

import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { useReportActivity } from "@/lib/activity";
import { cn } from "@/lib/utils";

/** 40×22 toggle, lime when on — the design's switch. */
export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  /** Returns anything — callers usually hand back a server-action result. */
  onChange: (next: boolean) => unknown;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  useReportActivity(pending, { mode: "soft" });

  return (
    <label className="flex items-start gap-3 py-2.5">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        aria-busy={pending || undefined}
        disabled={disabled || pending}
        onClick={() => startTransition(() => void onChange(!checked))}
        className={cn(
          "mt-0.5 flex h-[22px] w-10 flex-none items-center rounded-full border p-[2px] transition-colors disabled:opacity-60",
          checked ? "border-accent bg-accent" : "border-stroke bg-surface-2",
        )}
      >
        {pending ? (
          <Loader2
            aria-label="Saving"
            className={cn(
              "mx-auto size-3.5 animate-spin",
              checked ? "text-[#0a0c0d]" : "text-fg-muted",
            )}
            strokeWidth={2.5}
          />
        ) : (
          <span
            className={cn(
              "size-4 rounded-full transition-transform",
              checked ? "translate-x-[18px] bg-[#0a0c0d]" : "translate-x-0 bg-[#3a4247]",
            )}
          />
        )}
      </button>
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-fg-2">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-[11.5px] leading-[1.5] text-fg-dim">
            {description}
          </span>
        ) : null}
      </span>
    </label>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (next: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1 rounded-[11px] border border-line bg-surface-2 p-1">
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "hit flex-1 rounded-lg px-3 py-2 text-center text-[13px] transition-colors",
            value === option.value
              ? "bg-accent font-bold text-[#0a0c0d]"
              : "font-semibold text-fg-soft hover:text-fg",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
  name,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (next: number) => void;
  name: string;
  hint?: string;
}) {
  return (
    <div className="py-2.5">
      <div className="mb-2 flex items-baseline">
        <span className="eyebrow">{label}</span>
        <span className="ml-auto font-mono text-[13px] font-bold text-fg">
          {value}
          {suffix ? <span className="ml-1 text-[10px] text-fg-dim">{suffix}</span> : null}
        </span>
      </div>
      <input
        type="range"
        name={name}
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        className="jl-slider w-full"
      />
      {hint ? <p className="mt-2 text-[11.5px] leading-[1.5] text-fg-dim">{hint}</p> : null}
    </div>
  );
}

export function Field({
  label,
  hint,
  className,
  ...props
}: React.ComponentProps<"input"> & { label: string; hint?: string }) {
  const id = props.id ?? props.name;
  return (
    <label className={cn("block", className)} htmlFor={id}>
      <span className="eyebrow mb-1.5 block">{label}</span>
      <input
        id={id}
        className="w-full rounded-[11px] border border-line bg-surface-2 px-3.5 py-3 text-[13.5px] text-fg-2 outline-none placeholder:text-fg-dim focus:border-line-hi"
        {...props}
      />
      {hint ? <span className="mt-1.5 block text-[11.5px] text-fg-dim">{hint}</span> : null}
    </label>
  );
}

export function Message({ error, notice }: { error?: string; notice?: string }) {
  if (!error && !notice) return null;
  return (
    <p
      className={cn(
        "rounded-[11px] border px-3.5 py-2.5 text-[12.5px]",
        error
          ? "border-danger-border bg-danger-soft text-danger"
          : "border-line-hi bg-accent-soft text-accent",
      )}
    >
      {error ?? notice}
    </p>
  );
}
