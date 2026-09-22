"use client";

import Link from "next/link";
import { useActionState } from "react";
import { resendLink } from "@/app/actions/auth";
import type { AuthState } from "@/app/actions/auth";
import { Logo } from "@/components/shell/logo";
import { Field, FormMessage } from "./field";
import { SubmitButton } from "./submit-button";

/**
 * What actually went wrong, in the user's terms.
 *
 * Supabase puts a precise code in the URL — otp_expired, access_denied — and
 * the old page threw it away and said the link was "incomplete" regardless.
 * An expired link and a malformed one need different things from the reader.
 */
const EXPLANATIONS: Record<string, { title: string; body: string; resend: boolean }> = {
  otp_expired: {
    title: "That link has expired.",
    body: "Sign-in links last an hour and work only once. Ask for a fresh one and it will land in a moment.",
    resend: true,
  },
  access_denied: {
    title: "That link is no longer valid.",
    body: "It was either already used or has expired. Links work once, on purpose — a used one is worthless to anyone who finds it.",
    resend: true,
  },
  missing_token: {
    title: "That link was incomplete.",
    body: "Some email clients cut long links in half. Try opening it from the email again, or ask for a new one.",
    resend: true,
  },
  // Supabase's actual code when the verifier cookie is absent. Common and
  // entirely user-fixable, so it must not fall through to "something broke".
  pkce_code_verifier_not_found: {
    title: "Open the link in the same browser.",
    body: "The piece that proves this was you is stored in the browser where you signed up. Ask for a new link, then open it here.",
    resend: true,
  },
  flow_state_not_found: {
    title: "Open the link in the same browser.",
    body: "This link was started in a different browser, and the piece that proves it was you is stored there. Ask for a new link and open it where you are now.",
    resend: true,
  },
  validation_failed: {
    title: "That link didn't verify.",
    body: "The link was malformed. Asking for a new one is the quickest fix.",
    resend: true,
  },
  unknown: {
    title: "That link didn't work.",
    body: "Something went wrong signing you in. A fresh link usually clears it.",
    resend: true,
  },
};

export function AuthErrorPanel({
  code,
  description,
  type,
}: {
  code: string;
  description?: string;
  type?: string;
}) {
  const [state, resend] = useActionState(resendLink, {} as AuthState);
  const explanation = EXPLANATIONS[code] ?? EXPLANATIONS.unknown!;
  // A signup link that expired should resend a signup link, not a reset link.
  const kind = type === "signup" ? "signup" : "reset";

  return (
    <main className="flex min-h-svh items-center justify-center bg-bg p-[30px]">
      <div className="w-full max-w-[440px] rounded-[20px] border border-line bg-surface p-9">
        <Logo size={30} className="mb-7" />

        <div className="w-fit rounded-md border border-warn/40 bg-warn-soft px-[9px] py-[5px] font-mono text-[10.5px] font-bold tracking-[0.12em] text-warn uppercase">
          {code === "unknown" ? "Sign-in problem" : code.replace(/_/g, " ")}
        </div>

        <h1 className="display mt-4 mb-2.5 text-[28px]">{explanation.title}</h1>
        <p className="text-[13.5px] leading-[1.55] text-fg-soft">{explanation.body}</p>

        {explanation.resend ? (
          <form action={resend} className="mt-6 flex flex-col gap-2.5">
            <input type="hidden" name="kind" value={kind} />
            <Field
              label="Email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              required
            />
            <FormMessage error={state?.error} notice={state?.notice} />
            <SubmitButton pendingLabel="Sending…">
              {kind === "signup" ? "Send a new confirmation link" : "Send a new sign-in link"}
            </SubmitButton>
          </form>
        ) : null}

        <p className="mt-6 text-center text-[12.5px] text-fg-soft">
          <Link href="/login" className="text-accent hover:text-accent-hi">
            Back to sign in
          </Link>
        </p>

        {description ? (
          <p className="mt-5 border-t border-line pt-4 font-mono text-[10.5px] leading-[1.5] text-fg-dim">
            {description}
          </p>
        ) : null}
      </div>
    </main>
  );
}
