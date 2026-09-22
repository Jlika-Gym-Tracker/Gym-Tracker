"use client";

import { format, parseISO } from "date-fns";
import { useActionState } from "react";
import { X } from "lucide-react";
import { deletePhoto, type ActionState } from "@/app/actions/body";
import type { PhotoWithUrl } from "@/lib/body/queries";
import { cn } from "@/lib/utils";
import { ActionButton } from "@/components/kit/action-button";

export function PhotoTimeline({ photos }: { photos: PhotoWithUrl[] }) {
  const [state, remove] = useActionState(deletePhoto, {} as ActionState);
  const shown = photos.slice(-8);

  return (
    <div>
      <div className="eyebrow mb-2.5">Timeline</div>
      <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-8">
        {shown.map((photo, i) => (
          <div key={photo.id} className="group relative min-w-0">
            <div
              className={cn(
                "aspect-[3/4] overflow-hidden rounded-[9px] border bg-surface-2",
                i === shown.length - 1 ? "border-line-sel" : "border-line",
              )}
            >
              {photo.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photo.url}
                  alt={`Progress photo from ${photo.taken_on}`}
                  className="size-full object-cover transition-[filter] group-hover:grayscale-0"
                  style={{ filter: i === shown.length - 1 ? "none" : "grayscale(0.5)" }}
                />
              ) : null}
            </div>
            <div
              className={cn(
                "mt-1.5 text-center font-mono text-[9.5px]",
                i === shown.length - 1 ? "text-accent" : "text-fg-dim",
              )}
            >
              {format(parseISO(photo.taken_on), "MMM dd").toUpperCase()}
            </div>

            <form action={remove} className="absolute top-1 right-1">
              <input type="hidden" name="id" value={photo.id} />
              <ActionButton
                spinnerOnly
                aria-label={`Delete photo from ${photo.taken_on}`}
                className="flex size-5 items-center justify-center rounded-md bg-[#0a0c0dcc] text-fg-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-danger focus-visible:opacity-100"
              >
                <X className="size-3" strokeWidth={2.5} />
              </ActionButton>
            </form>
          </div>
        ))}
      </div>
      {state.error ? (
        <p className="mt-2 text-xs text-danger">{state.error}</p>
      ) : null}
    </div>
  );
}
