import { cn } from "@/lib/utils";

export function Field({
  label,
  hint,
  className,
  ...props
}: React.ComponentProps<"input"> & {
  label: string;
  hint?: React.ReactNode;
}) {
  const id = props.id ?? props.name;
  return (
    <div className={className}>
      <div className="mb-2 flex items-center">
        <label htmlFor={id} className="eyebrow">
          {label}
        </label>
        {hint ? <div className="ml-auto">{hint}</div> : null}
      </div>
      <input
        id={id}
        className={cn(
          "w-full rounded-[11px] border border-line bg-surface-2 px-[15px] py-3.5 text-[13.5px] text-fg-2 outline-none transition-colors",
          "placeholder:text-fg-dim focus:border-line-hi",
        )}
        {...props}
      />
    </div>
  );
}

export function Divider({ label = "OR" }: { label?: string }) {
  return (
    <div className="my-5 flex items-center gap-3">
      <div className="h-px flex-1 bg-line" />
      <div className="font-mono text-[10px] text-fg-faint">{label}</div>
      <div className="h-px flex-1 bg-line" />
    </div>
  );
}

export function FormMessage({
  error,
  notice,
}: {
  error?: string;
  notice?: string;
}) {
  if (!error && !notice) return null;
  return (
    <p
      role="status"
      className={cn(
        "rounded-[11px] border px-[15px] py-3 text-[12.5px] leading-[1.5]",
        error
          ? "border-danger-border bg-danger-soft text-danger"
          : "border-line-hi bg-accent-soft text-accent",
      )}
    >
      {error ?? notice}
    </p>
  );
}
