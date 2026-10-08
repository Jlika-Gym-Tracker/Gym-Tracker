"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { useReportActivity } from "@/lib/activity";
import { cn } from "@/lib/utils";

export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  className,
  ...props
}: React.ComponentProps<"button"> & {
  pendingLabel?: string;
  variant?: "primary" | "ghost";
}) {
  const { pending } = useFormStatus();
  useReportActivity(pending, { label: pendingLabel });

  return (
    <button
      type="submit"
      disabled={pending || props.disabled}
      aria-busy={pending || undefined}
      className={cn(
        "inline-flex w-full items-center justify-center gap-2 rounded-[11px] transition-colors disabled:opacity-60",
        variant === "primary"
          ? "bg-accent px-4 py-[15px] text-sm font-bold text-[#0a0c0d] hover:bg-accent-hi"
          : "border border-stroke bg-ghost px-4 py-[13px] text-[13px] font-semibold text-fg-2 hover:bg-hover",
        className,
      )}
      {...props}
    >
      {pending ? <Loader2 className="size-4 flex-none animate-spin" aria-hidden /> : null}
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
