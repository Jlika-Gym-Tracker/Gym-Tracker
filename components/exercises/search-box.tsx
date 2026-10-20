"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";
import { browseHref, type BrowseParams } from "@/lib/exercises/browse";

/**
 * The Exercises page's search. Typing updates the URL after a short pause and
 * the server filters; without JavaScript it is a plain GET form.
 */
export function SearchBox({ params, total }: { params: BrowseParams; total: number }) {
  const router = useRouter();
  const [value, setValue] = useState(params.q);
  const [pending, startTransition] = useTransition();
  const typed = useRef(false);

  // Back and forward change the query underneath the box; follow them, but
  // never undo a trailing space someone is still typing.
  useEffect(() => {
    setValue((current) => (current.trim() === params.q ? current : params.q));
  }, [params.q]);

  useEffect(() => {
    if (!typed.current || value.trim() === params.q) return;
    const timer = setTimeout(() => {
      startTransition(() => router.replace(browseHref(params, { q: value.trim() }), { scroll: false }));
    }, 250);
    return () => clearTimeout(timer);
  }, [value, params, router]);

  return (
    <form
      action="/exercises"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(() => router.replace(browseHref(params, { q: value.trim() }), { scroll: false }));
      }}
      role="search"
    >
      {params.group ? <input type="hidden" name="group" value={params.group} /> : null}
      {params.equipment.length ? <input type="hidden" name="eq" value={params.equipment.join(",")} /> : null}
      {params.tracking ? <input type="hidden" name="as" value={params.tracking} /> : null}
      <label className="flex min-h-11 cursor-text items-center gap-2 rounded-[10px] border border-line bg-surface-2 px-3 py-2 focus-within:border-line-hi">
        {pending ? (
          <Loader2 className="size-3.5 flex-none animate-spin text-accent" strokeWidth={2} aria-hidden />
        ) : (
          <Search className="size-3.5 flex-none text-fg-dim" strokeWidth={1.5} aria-hidden />
        )}
        <input
          type="search"
          name="q"
          value={value}
          onChange={(e) => {
            typed.current = true;
            setValue(e.target.value);
          }}
          placeholder={`Search ${total} movements…`}
          aria-label="Search the exercise library"
          autoComplete="off"
          className="w-full bg-transparent text-base text-fg-2 outline-none placeholder:text-fg-dim sm:text-[13px] [&::-webkit-search-cancel-button]:hidden"
        />
        {value ? (
          <button
            type="button"
            onClick={() => {
              typed.current = true;
              setValue("");
            }}
            aria-label="Clear the search"
            className="hit flex-none text-fg-dim hover:text-fg"
          >
            <X className="size-3.5" strokeWidth={2} />
          </button>
        ) : null}
      </label>
    </form>
  );
}
