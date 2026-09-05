"use client";

import Link from "next/link";
import { useActionState } from "react";
import { sendMagicLink } from "@/app/actions/auth";
import { Field, FormMessage } from "./field";
import { SubmitButton } from "./submit-button";

/**
 * Password reset piggybacks on the magic link: signing in from the emailed link
 * lands you in the app, where Profile → Account can set a new password.
 */
export function ForgotPasswordForm() {
  const [state, action] = useActionState(sendMagicLink, {});

  return (
    <>
      <h1 className="display text-[30px]">Locked out?</h1>
      <p className="mt-2.5 text-[13.5px] leading-[1.5] text-fg-soft">
        We&apos;ll email you a one-time link. Open it and you&apos;re back in —
        then set a new password from Profile.
      </p>

      <form action={action} className="mt-[26px] flex flex-col gap-[11px]">
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          required
        />
        <FormMessage error={state?.error} notice={state?.notice} />
        <SubmitButton pendingLabel="Sending…" className="mt-1">
          Email me a link
        </SubmitButton>
      </form>

      <p className="mt-6 text-center text-[12.5px] text-fg-soft">
        Remembered it?{" "}
        <Link href="/login" className="text-accent hover:text-accent-hi">
          Back to sign in
        </Link>
      </p>
    </>
  );
}
