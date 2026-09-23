"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { createInvite } from "@/app/actions/profile";
import type { CrewMember } from "@/lib/database.types";
import { useAction } from "@/lib/use-action";
import { Card } from "@/components/kit/card";
import { Message } from "@/components/profile/controls";

/**
 * How anyone else gets into the season.
 *
 * A season belongs to its owner's crew, so inviting to the league *is*
 * inviting to the crew — and only the owner's code puts someone in the crew
 * that owns this season. Before this, the code lived in Profile → Crew with
 * nothing here pointing at it, so there was no way to work that out.
 */
export function InviteCrew({
  crew,
  memberIds,
  isOwner,
  ownerName,
}: {
  crew: CrewMember[];
  memberIds: string[];
  isOwner: boolean;
  ownerName: string | null;
}) {
  const [state, setState] = useState<{ code?: string; error?: string; notice?: string }>({});
  const [copied, setCopied] = useState(false);
  const { pending, run } = useAction();

  const waiting = crew.filter((m) => !memberIds.includes(m.friend_id));

  if (!isOwner) {
    return (
      <Card className="rounded-[18px]">
        <h2 className="text-[15px] font-bold">Who else can join</h2>
        <p className="mt-1 text-[12.5px] leading-[1.5] text-fg-soft">
          This season belongs to {ownerName ?? "its owner"}&apos;s crew, so they
          hand out the invite codes. Anyone who joins their crew sees this season
          on their own Crew league screen.
        </p>
      </Card>
    );
  }

  async function copyLink(code: string) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/signup?code=${code}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard can be refused; the code is on screen to read out.
    }
  }

  return (
    <Card className="rounded-[18px]">
      <h2 className="text-[15px] font-bold">Invite your crew</h2>
      <p className="mt-1 mb-3 text-[12.5px] leading-[1.5] text-fg-soft">
        A code puts someone in your crew, and your crew sees this season and can
        join it. Each code works three times and lasts two weeks.
      </p>

      <button
        type="button"
        disabled={pending}
        aria-busy={pending || undefined}
        onClick={() => run(async () => setState(await createInvite()))}
        className="flex w-full items-center justify-center gap-1.5 rounded-[11px] bg-accent px-4 py-3 text-[13px] font-bold text-[#0a0c0d] transition-colors hover:bg-accent-hi disabled:opacity-60"
      >
        {pending ? (
          <Loader2 className="size-3.5 flex-none animate-spin" strokeWidth={2.5} />
        ) : null}
        {pending ? "Creating…" : "Create an invite code"}
      </button>

      {state.code ? (
        <div className="mt-3 rounded-[10px] border border-line bg-surface-2 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[13px] font-bold text-accent">{state.code}</span>
            <button
              type="button"
              onClick={() => void copyLink(state.code!)}
              className="ml-auto flex-none rounded-[8px] border border-stroke bg-ghost px-2.5 py-1.5 font-mono text-[10px] font-bold tracking-[0.08em] text-fg-muted uppercase hover:bg-hover"
            >
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
          <p className="mt-2 text-[11px] leading-[1.5] text-fg-dim">
            Send the link to someone new — it carries the code through signup.
            Anyone who already has an account enters it under Profile → Crew.
          </p>
        </div>
      ) : null}

      <div className="mt-3">
        <Message error={state.error} notice={state.code ? undefined : state.notice} />
      </div>

      {waiting.length > 0 ? (
        <div className="mt-3 border-t border-[#1a1e20] pt-3">
          <div className="eyebrow mb-2">In your crew, not in this season</div>
          <p className="text-[12px] leading-[1.5] text-fg-muted">
            {waiting.map((m) => m.display_name).join(", ")} — the season is on
            their Crew league screen with a Join button. Their baseline is taken
            the day they join, so joining late is fair, not free.
          </p>
        </div>
      ) : null}
    </Card>
  );
}
