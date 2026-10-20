"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Card } from "@/components/kit/card";
import { ActionButton } from "@/components/kit/action-button";
import { AsyncButton } from "@/components/kit/async-button";
import { Field, Message } from "@/components/profile/controls";
import { createSignupInvite, revokeSignupInvite, setInviteOnly } from "@/app/actions/admin";
import { formatDay } from "@/lib/admin/format";
import { INVITE_STATUS_LABEL, MAX_INVITE_USES } from "@/lib/admin/invite-code";
import type { InviteSettings, SignupInviteView } from "@/lib/admin/types";
import { useAction } from "@/lib/use-action";
import { cn } from "@/lib/utils";

const EXPIRY_OPTIONS = [
  { value: 1, label: "1 day" },
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
  { value: 0, label: "Never" },
];

/**
 * Invite-only signup: the switch, and the codes it asks for.
 *
 * The switch lives in the database (app_settings), not the environment,
 * because the trigger that enforces it on auth.users is the only check a
 * direct signUp call cannot skip — and it cannot read the app's environment.
 */
export function InviteCard({ initial }: { initial: InviteSettings }) {
  const [inviteOnly, setInviteOnlyState] = useState(initial.inviteOnly);
  const [invites, setInvites] = useState(initial.invites);
  const [message, setMessage] = useState<{ error?: string; notice?: string }>({});

  async function toggle() {
    const result = await setInviteOnly(!inviteOnly);
    if (result.ok) {
      setInviteOnlyState(result.data.inviteOnly);
      setMessage({ notice: result.notice });
    } else {
      setMessage({ error: result.error });
    }
  }

  async function create(formData: FormData) {
    const result = await createSignupInvite(formData);
    if (result.ok) {
      setInvites((current) => [result.data, ...current]);
      setMessage({ notice: `${result.data.code} is ready to share.` });
    } else {
      setMessage({ error: result.error });
    }
  }

  function replace(updated: SignupInviteView) {
    setInvites((current) => current.map((i) => (i.code === updated.code ? updated : i)));
  }

  const active = invites.filter((i) => i.status === "active").length;

  return (
    <Card>
      <h2 className="text-[15px] font-bold">Signup</h2>
      <InviteOnlySwitch on={inviteOnly} onToggle={toggle} />

      {inviteOnly && active === 0 ? (
        <p className="mb-1 rounded-[11px] border border-line bg-warn-soft px-3.5 py-2.5 text-[12px] leading-[1.5] text-warn">
          No code is active, so nobody can sign up until you generate one.
        </p>
      ) : null}

      <form action={create} className="mt-3 grid grid-cols-2 gap-2.5">
        <Field
          label="Uses"
          name="maxUses"
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_INVITE_USES}
          defaultValue={1}
          required
        />
        <label className="block" htmlFor="expiresInDays">
          <span className="eyebrow mb-1.5 block">Lasts</span>
          <select
            id="expiresInDays"
            name="expiresInDays"
            defaultValue={7}
            className="w-full rounded-[11px] border border-line bg-surface-2 px-3 py-3 text-[13.5px] text-fg-2 outline-none focus:border-line-hi"
          >
            {EXPIRY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <Field
          label="Note"
          name="note"
          placeholder="Who it's for (optional)"
          maxLength={60}
          autoComplete="off"
          className="col-span-2"
        />
        <ActionButton
          pendingLabel="Generating…"
          className="col-span-2 rounded-[11px] bg-accent px-4 py-3 text-[13px] font-bold text-[#0a0c0d] hover:bg-accent-hi"
        >
          Generate a code
        </ActionButton>
      </form>

      {message.error || message.notice ? (
        <div className="mt-3">
          <Message error={message.error} notice={message.notice} />
        </div>
      ) : null}

      {invites.length ? (
        <ul className="mt-3 flex flex-col gap-2">
          {invites.map((invite) => (
            <InviteRow key={invite.code} invite={invite} onRevoked={replace} onError={(error) => setMessage({ error })} />
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[12px] text-fg-dim">No codes yet.</p>
      )}
    </Card>
  );
}

/** The design's 40×22 switch, but one that spins for as long as the write takes. */
function InviteOnlySwitch({ on, onToggle }: { on: boolean; onToggle: () => Promise<void> }) {
  const { pending, run } = useAction({ announce: "soft" });

  return (
    <div className="flex items-start gap-3 py-2.5">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby="invite-only-label"
        aria-busy={pending || undefined}
        disabled={pending}
        onClick={() => run(onToggle)}
        className={cn(
          "mt-0.5 flex h-[22px] w-10 flex-none items-center rounded-full border p-[2px] transition-colors disabled:opacity-60",
          on ? "border-accent bg-accent" : "border-stroke bg-surface-2",
        )}
      >
        {pending ? (
          <Loader2
            aria-label="Saving"
            className={cn("mx-auto size-3.5 animate-spin", on ? "text-[#0a0c0d]" : "text-fg-muted")}
            strokeWidth={2.5}
          />
        ) : (
          <span
            className={cn(
              "size-4 rounded-full transition-transform",
              on ? "translate-x-[18px] bg-[#0a0c0d]" : "translate-x-0 bg-[#3a4247]",
            )}
          />
        )}
      </button>
      <span className="min-w-0">
        <span id="invite-only-label" className="block text-[13px] font-semibold text-fg-2">
          Invite-only
        </span>
        <span className="mt-0.5 block text-[11.5px] leading-[1.5] text-fg-dim">
          New accounts need a code. Google sign-ups carry none, so first-time ones are refused
          while this is on. Existing accounts are never affected.
        </span>
      </span>
    </div>
  );
}

function InviteRow({
  invite,
  onRevoked,
  onError,
}: {
  invite: SignupInviteView;
  onRevoked: (invite: SignupInviteView) => void;
  onError: (error: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const active = invite.status === "active";

  async function copy() {
    try {
      await navigator.clipboard.writeText(invite.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard access can be refused; the code is on screen to type.
    }
  }

  async function revoke() {
    const result = await revokeSignupInvite(invite.code);
    if (result.ok) onRevoked(result.data);
    else onError(result.error);
  }

  return (
    <li
      className={cn(
        "rounded-[10px] border border-line bg-surface-2 px-3 py-2.5",
        !active && "opacity-60",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span
          className={cn(
            "font-mono text-[12.5px] font-bold tracking-[0.02em] select-all",
            active ? "text-accent" : "text-fg-soft line-through decoration-fg-faint",
          )}
        >
          {invite.code}
        </span>
        <span className="ml-auto font-mono text-[10px] tracking-[0.08em] text-fg-dim uppercase">
          {INVITE_STATUS_LABEL[invite.status]}
        </span>
      </div>
      <div className="mt-1 font-mono text-[10.5px] text-fg-dim">
        {invite.uses}/{invite.maxUses} used ·{" "}
        {invite.expiresAt
          ? `${invite.status === "expired" ? "expired" : "expires"} ${formatDay(invite.expiresAt)}`
          : "never expires"}
      </div>
      {invite.note ? <div className="mt-1 text-[11px] text-fg-soft">{invite.note}</div> : null}
      {active ? (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => void copy()}
            className="hit rounded-[8px] border border-stroke bg-ghost px-2.5 py-1.5 font-mono text-[10px] font-bold tracking-[0.08em] text-fg-muted uppercase hover:bg-hover"
          >
            {copied ? "Copied" : "Copy"}
          </button>
          <AsyncButton
            action={revoke}
            className="hit inline-flex items-center gap-1.5 rounded-[8px] border border-danger-border bg-ghost px-2.5 py-1.5 font-mono text-[10px] font-bold tracking-[0.08em] text-danger uppercase hover:bg-danger-soft disabled:opacity-60"
          >
            Revoke
          </AsyncButton>
        </div>
      ) : null}
    </li>
  );
}
