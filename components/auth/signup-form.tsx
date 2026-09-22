"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUp } from "@/app/actions/auth";
import { Field, FormMessage } from "./field";
import { SubmitButton } from "./submit-button";

export type SignupMode = "athlete" | "coach";

/**
 * One signup form, two doors.
 *
 * There is no separate coach account — the same email is often both a coach and
 * someone who trains. `mode` only changes what is asked for and where they land:
 * a coach skips the crew code and gets coaching switched on before their first
 * render, so the Coach nav is there waiting.
 */
export function SignupForm({
  mode = "athlete",
  presetCode,
}: {
  mode?: SignupMode;
  presetCode?: string;
}) {
  const [state, action] = useActionState(signUp, {});
  const isCoach = mode === "coach";
  const fromCoachLink = Boolean(presetCode?.startsWith("COACH-"));

  return (
    <>
      <h1 className="display text-[30px]">
        {isCoach ? "Create your coach account." : "Create your account."}
      </h1>
      <p className="mt-2.5 text-[13.5px] leading-[1.5] text-fg-soft">
        {isCoach
          ? "Write programs once and assign them to athletes who join with your code. You can train here yourself too — it is the same account, not a second login."
          : "One account per person. Invite friends later — each gets their own private space, nobody sees anyone else's photos or numbers."}
      </p>

      {fromCoachLink ? (
        <div className="mt-4 rounded-[11px] border border-line-hi bg-accent-soft px-[15px] py-3 text-[12.5px] leading-[1.5] text-accent">
          You were invited with <strong className="font-mono">{presetCode}</strong>.
          It is applied the moment your account is ready, and it shares your
          training only.
        </div>
      ) : null}

      <form action={action} className="mt-[26px] flex flex-col gap-[11px]">
        {isCoach ? <input type="hidden" name="as" value="coach" /> : null}
        <Field
          label="Display name"
          name="displayName"
          autoComplete="name"
          placeholder={isCoach ? "Coach Yassir" : "Yassir"}
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
        {/* A coach joins nobody, so the code field would only be noise. */}
        {isCoach ? null : (
          <Field
            label={fromCoachLink ? "Coach code" : "Invite code"}
            name="inviteCode"
            defaultValue={presetCode}
            placeholder="CREW-7K2P (optional)"
            autoComplete="off"
          />
        )}
        <FormMessage error={state?.error} notice={state?.notice} />
        <SubmitButton pendingLabel="Creating account…" className="mt-1">
          {isCoach ? "Create coach account" : "Create account"}
        </SubmitButton>
      </form>

      <p className="mt-6 text-center text-[12.5px] text-fg-soft">
        Already have an account?{" "}
        <Link href="/login" className="text-accent hover:text-accent-hi">
          Sign in
        </Link>
      </p>
      <p className="mt-2 text-center text-[12.5px] text-fg-dim">
        {isCoach ? (
          <>
            Here to train, not to coach?{" "}
            <Link href="/signup" className="text-fg-soft hover:text-fg">
              Create a normal account
            </Link>
          </>
        ) : (
          <>
            Coaching a team?{" "}
            <Link href="/signup?as=coach" className="text-fg-soft hover:text-fg">
              Create a coach account
            </Link>
          </>
        )}
      </p>
    </>
  );
}
