"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { browseHref, parseBrowseParams } from "@/lib/exercises/browse";
import { cn } from "@/lib/utils";
import { CreateExercise } from "./exercise-form";

/** "+ Your own" on the Exercises page: the builder's form, landing on what you added. */
export function AddOwnExercise({
  initialName = "",
  variant = "button",
}: {
  initialName?: string;
  /** "link" for the inline offer under an empty search. */
  variant?: "button" | "link";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <div className={cn(variant === "button" && "contents")}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={
          variant === "button"
            ? "hit ml-auto flex-none self-start rounded-lg border border-stroke px-2.5 py-1.5 font-mono text-[10.5px] font-semibold text-fg-soft transition-colors hover:border-accent hover:text-accent"
            : "font-semibold text-accent hover:text-accent-hi"
        }
      >
        {variant === "button" ? (open ? "CLOSE" : "+ YOUR OWN") : "Add it as your own"}
      </button>
      {open ? (
        <div className="basis-full text-left">
          <CreateExercise
            initialName={initialName}
            onCreated={(name) => {
              setOpen(false);
              router.push(browseHref(parseBrowseParams({}), { q: name }));
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
