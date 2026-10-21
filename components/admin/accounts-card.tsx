"use client";

import { useState } from "react";
import { Card } from "@/components/kit/card";
import { ActionButton } from "@/components/kit/action-button";
import { AsyncButton } from "@/components/kit/async-button";
import { Message } from "@/components/profile/controls";
import { loadAccounts, setAccountDisabled } from "@/app/actions/admin";
import { formatAgo, formatDay } from "@/lib/admin/format";
import type { AccountsPage, AdminAccount } from "@/lib/admin/types";
import { cn } from "@/lib/utils";

/**
 * Every account, newest first, searchable by email.
 *
 * PRIVACY BOUNDARY: a row is an AdminAccount and nothing more — there is no
 * link into anyone's sessions, because there is nothing behind one.
 */
export function AccountsCard({ initial }: { initial: AccountsPage }) {
  const [page, setPage] = useState(initial);
  const [query, setQuery] = useState(initial.query);
  const [error, setError] = useState<string>();

  async function load(nextQuery: string, nextPage: number) {
    const result = await loadAccounts({ query: nextQuery, page: nextPage });
    if (result.ok) {
      setPage(result.data);
      setError(undefined);
    } else {
      setError(result.error);
    }
  }

  function updateRow(id: string, disabled: boolean) {
    setPage((current) => ({
      ...current,
      rows: current.rows.map((row) => (row.id === id ? { ...row, disabled } : row)),
    }));
  }

  const now = new Date(page.asOf);
  const first = page.total ? (page.page - 1) * page.pageSize + 1 : 0;
  const last = Math.min(page.total, page.page * page.pageSize);

  return (
    <Card className="p-0">
      <div className="p-5 pb-4">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[15px] font-bold">Accounts</h2>
          <span className="font-mono text-[11px] text-fg-dim">
            {page.query ? `${page.total} matching` : `${page.total} total`}
          </span>
        </div>
        <form
          role="search"
          action={() => load(query, 1)}
          className="mt-3 flex gap-2"
        >
          <input
            type="search"
            name="q"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by email"
            aria-label="Search accounts by email"
            maxLength={100}
            autoComplete="off"
            className="min-w-0 flex-1 rounded-[11px] border border-line bg-surface-2 px-3.5 py-2.5 text-[13px] text-fg-2 outline-none placeholder:text-fg-dim focus:border-line-hi"
          />
          <ActionButton className="flex-none rounded-[11px] border border-stroke bg-ghost px-4 py-2.5 text-[13px] font-semibold text-fg-2 hover:bg-hover">
            Search
          </ActionButton>
        </form>
        {error ? (
          <div className="mt-3">
            <Message error={error} />
          </div>
        ) : null}
      </div>

      {page.rows.length ? (
        <ul>
          {page.rows.map((account) => (
            <AccountRow key={account.id} account={account} now={now} onChange={updateRow} />
          ))}
        </ul>
      ) : (
        <p className="border-t border-line px-5 py-8 text-center text-[12.5px] text-fg-dim">
          {page.query ? `No account email contains “${page.query}”.` : "No accounts yet."}
        </p>
      )}

      <div className="flex items-center gap-2 border-t border-line px-5 py-3">
        <span className="font-mono text-[11px] text-fg-dim">
          {page.total ? `${first}–${last} of ${page.total}` : "0 of 0"}
        </span>
        <div className="ml-auto flex gap-2">
          <AsyncButton
            action={() => load(page.query, page.page - 1)}
            disabled={page.page <= 1}
            className={PAGER}
          >
            Prev
          </AsyncButton>
          <AsyncButton
            action={() => load(page.query, page.page + 1)}
            disabled={last >= page.total}
            className={PAGER}
          >
            Next
          </AsyncButton>
        </div>
      </div>
    </Card>
  );
}

const PAGER =
  "hit inline-flex items-center gap-1.5 rounded-[10px] border border-stroke bg-ghost px-3 py-2 text-[12px] font-semibold text-fg-2 hover:bg-hover disabled:opacity-40";

function AccountRow({
  account,
  now,
  onChange,
}: {
  account: AdminAccount;
  now: Date;
  onChange: (id: string, disabled: boolean) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<{ error?: string; notice?: string }>({});

  async function apply(disabled: boolean) {
    const response = await setAccountDisabled({ userId: account.id, disabled });
    if (response.ok) {
      onChange(account.id, response.data.disabled);
      setConfirming(false);
      setResult({ notice: response.notice });
    } else {
      setResult({ error: response.error });
    }
  }

  // Yourself, or another admin who is still enabled: not from here.
  const locked = account.isSelf || (account.isAdmin && !account.disabled);

  return (
    <li className={cn("border-t border-line px-5 py-3.5", account.disabled && "bg-danger-soft/30")}>
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span
              title={account.email}
              className={cn(
                "min-w-0 truncate text-[13.5px] font-semibold",
                account.disabled ? "text-fg-dim line-through decoration-fg-faint" : "text-fg-2",
              )}
            >
              {account.email}
            </span>
            {account.isSelf ? <Badge>You</Badge> : null}
            {account.isAdmin ? <Badge tone="accent">Admin</Badge> : null}
            {account.disabled ? <Badge tone="danger">Disabled</Badge> : null}
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
            <Fact label="Joined" value={formatDay(account.createdAt)} />
            <Fact label="Last sign-in" value={formatAgo(account.lastSignInAt, now)} />
            <Fact
              label="Sessions"
              value={
                account.lastTrainedAt
                  ? `${account.finishedSessions} · ${formatDay(account.lastTrainedAt)}`
                  : "None yet"
              }
            />
            <Fact
              label="Open session"
              value={account.openSessionSince ? `Started ${formatAgo(account.openSessionSince, now)}` : "—"}
              tone={account.openSessionSince ? "accent" : undefined}
            />
          </dl>
        </div>

        {/* Always present on wide screens, so a row without a button keeps
            its columns in line with the rest. */}
        <div
          className={cn(
            "flex-none sm:flex sm:w-[84px] sm:justify-end",
            (locked || (confirming && !account.disabled)) && "max-sm:hidden",
          )}
        >
          {locked ? null : account.disabled ? (
            <AsyncButton action={() => apply(false)} className={cn(ROW_BUTTON, "text-fg-2 hover:bg-hover")}>
              Enable
            </AsyncButton>
          ) : confirming ? null : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className={cn(ROW_BUTTON, "text-danger hover:bg-danger-soft")}
            >
              Disable
            </button>
          )}
        </div>
      </div>

      {confirming ? (
        <div className="mt-3 rounded-[12px] border border-danger-border bg-danger-soft p-3">
          <p className="text-[12px] leading-[1.5] text-fg-2">
            Disable <strong className="break-all">{account.email}</strong>? They are signed out on
            every device and cannot sign in until you enable the account again. Nothing they
            logged is touched.
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <AsyncButton
              action={() => apply(true)}
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-danger-border bg-[#2a1212] px-3.5 py-2 text-[12.5px] font-bold text-danger hover:bg-[#3a1616] disabled:opacity-60"
            >
              Disable account
            </AsyncButton>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-[10px] border border-stroke bg-ghost px-3.5 py-2 text-[12.5px] font-semibold text-fg-2 hover:bg-hover"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {result.error || result.notice ? (
        <div className="mt-2.5">
          <Message error={result.error} notice={result.notice} />
        </div>
      ) : null}
    </li>
  );
}

const ROW_BUTTON =
  "hit inline-flex w-fit flex-none items-center gap-1.5 self-start rounded-[10px] border border-stroke bg-ghost px-3 py-2 text-[12px] font-semibold disabled:opacity-60";

function Fact({ label, value, tone }: { label: string; value: string; tone?: "accent" }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[9.5px] tracking-[0.1em] text-fg-faint uppercase">{label}</dt>
      <dd className={cn("truncate text-[12px]", tone === "accent" ? "text-accent" : "text-fg-soft")}>
        {value}
      </dd>
    </div>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone?: "accent" | "danger" }) {
  return (
    <span
      className={cn(
        "flex-none rounded-[6px] border px-1.5 py-[3px] font-mono text-[9.5px] font-bold tracking-[0.1em] uppercase",
        tone === "accent" && "border-line-hi bg-accent-soft text-accent",
        tone === "danger" && "border-danger-border bg-danger-soft text-danger",
        !tone && "border-stroke bg-ghost text-fg-muted",
      )}
    >
      {children}
    </span>
  );
}
