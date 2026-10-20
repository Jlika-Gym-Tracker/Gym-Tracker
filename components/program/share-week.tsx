"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Download, Loader2, Printer, Upload } from "lucide-react";
import { importSharedWeek } from "@/app/actions/program-share";
import type { WeekDetail } from "@/lib/program/queries";
import { shareFileName, toSharedWeek } from "@/lib/program/share";
import { useAction } from "@/lib/use-action";

/**
 * Send this week to someone as a small file, bring theirs in, or print it.
 * The file holds the routine only — no logged sets, no weigh-ins, no loads.
 */
export function ShareWeek({ week }: { week: WeekDetail }) {
  const input = useRef<HTMLInputElement>(null);
  const importing = useAction({ announce: "soft", label: "Importing the week" });
  const [message, setMessage] = useState<{ error?: string; notice?: string }>({});

  function download() {
    const shared = toSharedWeek(week.label, week.days);
    const blob = new Blob([JSON.stringify(shared, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = shareFileName(week.label, week.week_start);
    link.click();
    URL.revokeObjectURL(url);
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    const text = await file.text();
    importing.run(async () => {
      setMessage(await importSharedWeek(week.week_start, text));
      if (input.current) input.current.value = "";
    });
  }

  const button =
    "flex items-center gap-2 rounded-[10px] border border-stroke bg-ghost px-3.5 py-2.5 text-[12.5px] font-semibold text-fg-2 transition-colors hover:bg-hover disabled:opacity-50";

  return (
    <div className="flex flex-col gap-2.5 rounded-[14px] border border-line bg-surface-2 px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="eyebrow mr-auto">Share this week</span>
        <button type="button" onClick={download} className={button}>
          <Download className="size-3.5" strokeWidth={2} />
          Download file
        </button>
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={importing.pending}
          aria-busy={importing.pending || undefined}
          className={button}
        >
          {importing.pending ? (
            <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />
          ) : (
            <Upload className="size-3.5" strokeWidth={2} />
          )}
          Import a week
        </button>
        <Link
          href={`/print/week?week=${week.week_start}`}
          target="_blank"
          prefetch={false}
          className={button}
        >
          <Printer className="size-3.5" strokeWidth={2} />
          Print
        </Link>
        <input
          ref={input}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
      </div>
      <p className="text-[11.5px] leading-[1.5] text-fg-dim">
        The file carries the routine — days, exercises, sets, reps and rules — never your logged
        sets, weigh-ins or loads. Importing only fills days you have left empty.
      </p>
      {message.error || message.notice ? (
        <p
          className={
            message.error
              ? "rounded-[10px] border border-danger-border bg-danger-soft px-3 py-2 text-[12px] text-danger"
              : "rounded-[10px] border border-line-hi bg-accent-soft px-3 py-2 text-[12px] text-accent"
          }
        >
          {message.error ?? message.notice}
        </p>
      ) : null}
    </div>
  );
}
