"use client";

import Link from "next/link";
import { Logo } from "@/components/shell/logo";
import { NavSpinner } from "@/components/shell/nav-spinner";

/** PostgREST's code for "that table is not in the schema cache". */
const MISSING_TABLE = "PGRST205";

/**
 * Reads what we can out of a server error.
 *
 * Next redacts server-component error messages in production, leaving only a
 * digest, so this only ever recognises the setup case in development — which
 * is exactly when it matters, because the usual cause is migrations that have
 * not been run yet.
 */
function looksLikeMissingSchema(error: Error) {
  return (
    error.message.includes(MISSING_TABLE) ||
    error.message.includes("schema cache") ||
    error.message.includes("does not exist")
  );
}

export function ErrorPanel({
  error,
  reset,
  standalone = false,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  standalone?: boolean;
}) {
  const setupProblem = looksLikeMissingSchema(error);

  const body = (
    <div className="w-full max-w-[560px] rounded-[20px] border border-line bg-surface p-8">
      {standalone ? <Logo size={28} className="mb-7" /> : null}

      <div className="w-fit rounded-md border border-danger-border bg-danger-soft px-[9px] py-[5px] font-mono text-[10.5px] font-bold tracking-[0.12em] text-danger uppercase">
        {setupProblem ? "Database not ready" : "Something broke"}
      </div>

      <h1 className="display mt-4 mb-2 text-[30px]">
        {setupProblem ? "Your migrations haven't run yet." : "That didn't load."}
      </h1>

      {setupProblem ? (
        <>
          <p className="text-[13.5px] leading-[1.55] text-fg-muted">
            The app is talking to Supabase, but a table it needs is missing. Apply
            the files in <code className="font-mono text-accent">supabase/migrations/</code>{" "}
            in numeric order — later ones build on earlier tables.
          </p>
          <ol className="mt-4 flex flex-col gap-1.5 font-mono text-[11.5px] text-fg-soft">
            {[
              "02_program", "03_seed_exercises", "04_sessions", "05_body",
              "06_nutrition", "07_seed_nutrition", "08_user_settings",
              "09_crew", "10_league", "11_league_functions", "12_weekly_review_cron",
            ].map((name, i) => (
              <li key={name} className="flex gap-2.5">
                <span className="text-fg-dim">{String(i + 2).padStart(2, "0")}</span>
                {name}
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p className="text-[13.5px] leading-[1.55] text-fg-muted">
          An unexpected error stopped this screen from rendering. Trying again is
          usually enough; if it keeps happening the details below identify it in
          the server logs.
        </p>
      )}

      {error.digest ? (
        <p className="mt-4 font-mono text-[11px] text-fg-dim">
          Reference: {error.digest}
        </p>
      ) : null}

      {process.env.NODE_ENV === "development" ? (
        <pre className="mt-4 max-h-40 overflow-auto rounded-[11px] border border-line bg-surface-2 p-3 font-mono text-[11px] leading-[1.6] whitespace-pre-wrap text-fg-soft">
          {error.message}
        </pre>
      ) : null}

      <div className="mt-7 flex flex-wrap gap-2.5">
        <button
          type="button"
          onClick={reset}
          className="rounded-[11px] bg-accent px-[22px] py-[13px] text-sm font-bold text-[#0a0c0d] transition-colors hover:bg-accent-hi"
        >
          Try again
        </button>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-[11px] border border-stroke bg-ghost px-5 py-[13px] text-sm font-semibold text-fg-2 transition-colors hover:bg-hover"
        >
          <NavSpinner />
          Back to Today
        </Link>
      </div>
    </div>
  );

  if (!standalone) return body;

  return (
    <main className="flex min-h-svh items-center justify-center bg-bg p-[30px]">
      {body}
    </main>
  );
}
