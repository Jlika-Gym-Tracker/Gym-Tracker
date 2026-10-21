import { Card, StatCard } from "@/components/kit/card";
import type { AccountsPage, AdminTotals, InviteSettings, TrainingNow } from "@/lib/admin/types";
import { formatDay } from "@/lib/admin/format";
import { SECRET_KEY_MISSING } from "@/lib/admin/access";
import { AccountsCard } from "./accounts-card";
import { TrainingNowCard } from "./training-now-card";
import { InviteCard } from "./invite-card";

/**
 * The operator dashboard.
 *
 * PRIVACY BOUNDARY: everything this renders arrives as the types in
 * lib/admin/types.ts — account-level facts and counts. There is no drill-down
 * into anyone's training, and nothing here could draw one: the data is not
 * fetched, and the database functions behind it cannot return it.
 */
export function AdminScreen({
  totals,
  accounts,
  trainingNow,
  invites,
}: {
  totals: AdminTotals;
  accounts: AccountsPage;
  trainingNow: TrainingNow;
  invites: InviteSettings;
}) {
  const count = new Intl.NumberFormat("en-US");
  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-[18px]">
      <Boundary />

      <section aria-label="Totals" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Accounts"
          value={count.format(totals.accounts)}
          delta={totals.disabled ? `${count.format(totals.disabled)} disabled` : "None disabled"}
          tone={totals.disabled ? "warn" : "dim"}
        />
        <StatCard
          label="Active · 7 days"
          value={count.format(totals.active7d)}
          delta="Signed in or trained"
        />
        <StatCard
          label="Active · 30 days"
          value={count.format(totals.active30d)}
          delta="Signed in or trained"
        />
        <StatCard
          label="Sessions this week"
          value={count.format(totals.sessionsThisWeek)}
          delta={`Started since ${formatDay(`${totals.weekStart}T00:00:00Z`)}`}
        />
      </section>

      {/* Phones read top to bottom: who is training, then accounts, then
          signup. Wide screens put the two short cards beside the list. */}
      <div className="grid grid-cols-1 items-start gap-[18px] xl:grid-cols-[minmax(0,1fr)_360px] xl:grid-rows-[auto_1fr]">
        <div className="xl:col-start-2 xl:row-start-1">
          <TrainingNowCard initial={trainingNow} />
        </div>
        <div className="min-w-0 xl:col-start-1 xl:row-span-2 xl:row-start-1">
          <AccountsCard initial={accounts} />
        </div>
        <div className="xl:col-start-2 xl:row-start-2">
          <InviteCard initial={invites} />
        </div>
      </div>
    </div>
  );
}

/** What this page shows and what it never will, said before anything else. */
function Boundary() {
  return (
    <Card className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-8">
      <div className="lg:max-w-[360px]">
        <div className="w-fit rounded-md border border-line-hi bg-accent-soft px-[9px] py-[5px] font-mono text-[10.5px] font-bold tracking-[0.12em] text-accent uppercase">
          Operator
        </div>
        <h1 className="display mt-3 text-[28px] lg:text-[30px]">Accounts, counted. Never opened.</h1>
        <p className="mt-2 text-[12.5px] leading-[1.55] text-fg-soft">
          Everyone here was promised that nobody can read their data — and that includes
          whoever runs the instance.
        </p>
      </div>
      <div className="grid flex-1 gap-3 sm:grid-cols-2">
        <div className="rounded-[14px] border border-line bg-surface-2 p-3.5">
          <div className="eyebrow mb-2">Shown here</div>
          <ul className="flex flex-col gap-1 text-[12px] leading-[1.45] text-fg-2">
            <li>Email, signup date, last sign-in</li>
            <li>Disabled or not</li>
            <li>Finished sessions and the last training date</li>
            <li>Whether a session is open, and since when</li>
          </ul>
        </div>
        <div className="rounded-[14px] border border-danger-border bg-danger-soft p-3.5">
          <div className="eyebrow mb-2 text-danger">Never shown</div>
          <ul className="flex flex-col gap-1 text-[12px] leading-[1.45] text-fg-2">
            <li>Weights, sets or exercises</li>
            <li>Weigh-ins, measurements or photos</li>
            <li>Meals, targets or notes</li>
          </ul>
          <p className="mt-2 text-[11px] leading-[1.45] text-fg-dim">
            Not hidden — never fetched. The database functions behind this page cannot
            return them.
          </p>
        </div>
      </div>
    </Card>
  );
}

/** An operator on a server without the secret key: say what is missing. */
export function AdminUnavailable() {
  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-[18px]">
      <Boundary />
      <Card>
        <h2 className="text-[15px] font-bold">Not configured</h2>
        <p className="mt-1 text-[12.5px] leading-[1.55] text-fg-soft">
          {SECRET_KEY_MISSING} Set it in the server&apos;s environment — never a{" "}
          <code className="font-mono text-accent">NEXT_PUBLIC_</code> variable — and reload.
        </p>
      </Card>
    </div>
  );
}
