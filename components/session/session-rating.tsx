"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { rateSession } from "@/app/actions/session";
import { Card, Eyebrow } from "@/components/kit/card";
import { cn } from "@/lib/utils";
import { useAction } from "@/lib/use-action";

const OPTIONS = [
  { value: 1, label: "Too easy" },
  { value: 2, label: "About right" },
  { value: 3, label: "Brutal" },
] as const;

/**
 * One optional tap on how the session felt, plus a note. A tap saves at once;
 * the note saves on its own button so half a sentence is never written.
 */
export function SessionRating({
  sessionId,
  rating,
  note,
}: {
  sessionId: string;
  rating: number | null;
  note: string | null;
}) {
  const [value, setValue] = useState<number | null>(rating);
  const [text, setText] = useState(note ?? "");
  const [message, setMessage] = useState<{ error?: string; notice?: string }>({});
  const tap = useAction();
  const save = useAction();

  function write(nextRating: number | null, nextNote: string, via: typeof tap) {
    via.run(async () => {
      const result = await rateSession({ sessionId, rating: nextRating, note: nextNote.trim() || null });
      setMessage(result);
    });
  }

  return (
    <Card className="flex flex-col gap-3">
      <Eyebrow>How did that feel?</Eyebrow>
      <div role="radiogroup" aria-label="How the session felt" className="grid grid-cols-3 gap-2">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            disabled={tap.pending}
            onClick={() => {
              // Tapping the chosen one again clears it.
              const next = value === option.value ? null : option.value;
              setValue(next);
              write(next, text, tap);
            }}
            className={cn(
              "min-h-11 rounded-[12px] border px-3 py-3 text-[13px] font-bold transition-colors disabled:opacity-60",
              value === option.value
                ? "border-accent bg-accent text-[#0a0c0d]"
                : "border-line bg-surface-2 text-fg-2 hover:border-stroke",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={500}
        rows={2}
        placeholder="A note for future you — sleep, a tweak in the shoulder, a new gym…"
        aria-label="Session note"
        className="w-full resize-none rounded-[11px] border border-line bg-surface-2 px-3.5 py-3 text-base text-fg-2 outline-none placeholder:text-fg-dim focus:border-line-hi sm:text-[13.5px]"
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => write(value, text, save)}
          disabled={save.pending}
          aria-busy={save.pending || undefined}
          className="flex items-center gap-1.5 rounded-[11px] border border-stroke bg-ghost px-4 py-2.5 text-[13px] font-semibold text-fg-2 hover:bg-hover disabled:opacity-60"
        >
          {save.pending ? <Loader2 className="size-3.5 animate-spin" strokeWidth={2} /> : null}
          Save note
        </button>
        {message.error ? (
          <span className="text-[12px] text-danger">{message.error}</span>
        ) : message.notice ? (
          <span className="text-[12px] text-accent">{message.notice}</span>
        ) : null}
      </div>
    </Card>
  );
}
