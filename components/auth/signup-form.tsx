"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signInWithGoogle, signUp } from "@/app/actions/auth";
import { Divider, Field, FormMessage } from "./field";
import { SubmitButton } from "./submit-button";

export function SignupForm() {
  const [state, action] = useActionState(signUp, {});

  return (
    <>
      <h1 className="display text-[30px]">Create your account.</h1>
      <p className="mt-2.5 text-[13.5px] leading-[1.5] text-fg-soft">
        One account per person. Invite friends later — each gets their own
        private space, nobody sees anyone else&apos;s photos or numbers.
      </p>

      <form action={action} className="mt-[26px] flex flex-col gap-[11px]">
        <Field
          label="Display name"
          name="displayName"
          autoComplete="name"
          placeholder="Yassir"
          required
          minLength={2}
          maxLength={60}
        />
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          required
        />
        <div className="grid gap-[11px] sm:grid-cols-2">
          <Field
            label="Password"
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••••••"
            required
            minLength={8}
          />
          <Field
            label="Confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••••••"
            required
            minLength={8}
          />
        </div>
        <FormMessage error={state?.error} notice={state?.notice} />
        <SubmitButton pendingLabel="Creating account…" className="mt-1">
          Create account
        </SubmitButton>
      </form>

      <Divider />

      <form action={signInWithGoogle}>
        <SubmitButton variant="ghost" pendingLabel="Redirecting…">
          Continue with Google
        </SubmitButton>
      </form>

      <p className="mt-6 text-center text-[12.5px] text-fg-soft">
        Already have an account?{" "}
        <Link href="/login" className="text-accent hover:text-accent-hi">
          Sign in
        </Link>
      </p>
    </>
  );
}
