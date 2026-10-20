import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Shared pieces of the AI Coach screens, in the app's own vocabulary. */

export const primaryButton =
  "inline-flex items-center justify-center gap-1.5 rounded-[11px] bg-accent px-[18px] py-[12px] text-[13px] font-bold text-[#0a0c0d] transition-colors hover:bg-accent-hi disabled:cursor-not-allowed disabled:opacity-60";

export const ghostButton =
  "inline-flex items-center justify-center gap-1.5 rounded-[11px] border border-stroke bg-ghost px-4 py-[12px] text-[13px] font-semibold text-fg-2 transition-colors hover:bg-hover disabled:cursor-not-allowed disabled:opacity-60";

export const dangerButton =
  "inline-flex items-center justify-center gap-1.5 rounded-[11px] border border-danger-border bg-danger-soft px-4 py-[12px] text-[13px] font-semibold text-danger transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60";

export const fieldClass =
  "w-full rounded-xl border border-line bg-surface-2 p-3 text-[13px] leading-[1.55] text-fg-2 outline-none placeholder:text-fg-faint focus:border-line-hi";

/** The lime tag at the top of a card. */
export function Tag({ children, tone = "accent" }: { children: React.ReactNode; tone?: "accent" | "warn" | "dim" }) {
  return (
    <div
      className={cn(
        "w-fit rounded-md border px-[9px] py-[5px] font-mono text-[10.5px] font-bold tracking-[0.12em] uppercase",
        tone === "accent" && "border-line-hi bg-accent-soft text-accent",
        tone === "warn" && "border-warn/40 bg-warn-soft text-warn",
        tone === "dim" && "border-line bg-surface-2 text-fg-dim",
      )}
    >
      {children}
    </div>
  );
}

export function Notice({ error, notice }: { error?: string | null; notice?: string | null }) {
  if (!error && !notice) return null;
  return (
    <p
      role={error ? "alert" : "status"}
      className={cn(
        "rounded-[11px] border px-3.5 py-2.5 text-[12.5px] leading-[1.5]",
        error ? "border-danger-border bg-danger-soft text-danger" : "border-line-hi bg-accent-soft text-accent",
      )}
    >
      {error ?? notice}
    </p>
  );
}

/** A toggle chip for single or multiple choice. */
export function Choice({
  selected,
  onClick,
  children,
  detail,
  className,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  detail?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "min-h-11 rounded-[11px] border px-3.5 py-2 text-left transition-colors",
        selected ? "border-line-sel bg-accent-soft" : "border-line bg-surface-2 hover:border-stroke",
        className,
      )}
    >
      <span className={cn("block text-[12.5px] font-bold", selected ? "text-fg" : "text-fg-2")}>{children}</span>
      {detail ? <span className="mt-0.5 block font-mono text-[10px] text-fg-dim">{detail}</span> : null}
    </button>
  );
}

export function Spinner({ show }: { show: boolean }) {
  return show ? <Loader2 className="size-3.5 flex-none animate-spin" aria-hidden /> : null;
}

/** A bullet row: lime square for what is included, faint for what is not. */
export function Bullet({ children, off = false }: { children: React.ReactNode; off?: boolean }) {
  return (
    <li className="flex gap-2.5">
      <span className={cn("mt-[6px] size-[6px] flex-none rounded-[2px]", off ? "bg-fg-faint" : "bg-accent")} />
      <span className={off ? "text-fg-dim" : "text-fg-muted"}>{children}</span>
    </li>
  );
}
