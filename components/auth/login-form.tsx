"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn } from "@/app/actions/auth";
import { Field, FormMessage } from "./field";
import { SubmitButton } from "./submit-button";

export function LoginForm({
  next,
  initialError,
}: {
  next: string;
  initialError?: string;
}) {
  const [state, action] = useActionState(signIn, { error: initialError });

  return (
    <>
      <h1 className="display text-[30px]">Welcome back.</h1>
      <p className="mt-2.5 text-[13.5px] leading-[1.5] text-fg-soft">
        Your training, body photos and meals stay in your own account. Friends
        you invite get their own space.
      </p>

      <form action={action} className="mt-[26px] flex flex-col gap-[11px]">
        <input type="hidden" name="next" value={next} />
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          required
        />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••••"
          required
          hint={
            <Link
              href="/forgot-password"
              className="hit font-mono text-[10px] font-medium tracking-[0.1em] text-accent uppercase"
            >
              Forgot?
            </Link>
          }
        />
        <FormMessage error={state?.error} />
        <SubmitButton pendingLabel="Signing in…" className="mt-1">
          Sign in
        </SubmitButton>
      </form>

      <p className="mt-6 text-center text-[12.5px] text-fg-soft">
        New here?{" "}
        <Link href="/signup" className="text-accent hover:text-accent-hi">
          Create an account
        </Link>
      </p>
    </>
  );
}
