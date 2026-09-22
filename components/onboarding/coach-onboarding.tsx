"use client";

import { useActionState, useState } from "react";
import { completeCoachOnboarding, type ActionState } from "@/app/actions/onboarding";
import { PLACEHOLDER_IMAGES } from "@/lib/placeholder-images";
import { Logo } from "@/components/shell/logo";
import { Message } from "@/components/profile/controls";
import { OnboardingFlow } from "./onboarding-flow";

/**
 * A coach's first run: two questions, then straight to the coach screen.
 *
 * The full five-step flow asks for sex, height, weight, goal and allergens so
 * it can compute *that person's* calories. A coach who does not train here has
 * no answers to give, and inventing them puts junk on their own dashboard —
 * so they get the short version, with a door into the long one if they do train.
 */
export function CoachOnboarding({ defaultName }: { defaultName: string }) {
  const [state, submit] = useActionState(completeCoachOnboarding, {} as ActionState);
  const [alsoTrains, setAlsoTrains] = useState(false);

  // They said they train here too, so hand over the real flow — coaching is
  // already switched on, so nothing is lost by taking the long road.
  if (alsoTrains) return <OnboardingFlow defaultName={defaultName} />;

  return (
    <main className="flex min-h-svh items-stretch gap-[18px] bg-bg p-[30px]">
      <form
        action={submit}
        className="flex flex-1 flex-col rounded-[20px] border border-line bg-surface px-6 py-[34px] sm:px-[38px]"
      >
        <div className="mb-[26px] flex items-center gap-4">
          <Logo size={30} />
          <div className="ml-auto font-mono text-[10px] tracking-[0.12em] text-fg-dim uppercase">
            Coach setup
          </div>
        </div>

        <div className="max-w-[520px]">
          <div className="w-fit rounded-md border border-line-hi bg-accent-soft px-[9px] py-[5px] font-mono text-[10.5px] font-bold tracking-[0.12em] text-accent uppercase">
            Coaching
          </div>
          <h1 className="display mt-4 text-[34px]">
            Two questions, then you can write your first program.
          </h1>
          <p className="mt-3 text-[13.5px] leading-[1.55] text-fg-muted">
            We are not going to ask for your bodyweight or your calories — those
            belong to the people you coach. You can add your own training later
            if you want it here too.
          </p>

          <div className="mt-7 flex flex-col gap-[13px]">
            <label className="block">
              <span className="eyebrow mb-2 block">Your name, as athletes see it</span>
              <input
                name="displayName"
                defaultValue={defaultName}
                required
                minLength={2}
                maxLength={60}
                placeholder="Coach Yassir"
                className="w-full rounded-[11px] border border-line bg-surface-2 px-[15px] py-3.5 text-[13.5px] text-fg-2 outline-none focus:border-line-hi"
              />
            </label>
            <label className="block">
              <span className="eyebrow mb-2 block">Gym or team — optional</span>
              <input
                name="gymName"
                maxLength={80}
                placeholder="JLIKA Strength, Casablanca"
                className="w-full rounded-[11px] border border-line bg-surface-2 px-[15px] py-3.5 text-[13.5px] text-fg-2 outline-none focus:border-line-hi"
              />
              <span className="mt-2 block text-[11.5px] text-fg-dim">
                Shown to athletes when they open your invite link, so they know
                the code is really yours.
              </span>
            </label>
          </div>

          <div className="mt-7 rounded-[14px] border border-line bg-surface-2 p-4">
            <div className="eyebrow mb-2.5">What happens next</div>
            <ol className="flex flex-col gap-2 text-[12.5px] leading-[1.5] text-fg-muted">
              {[
                "Build a program in your library — days, exercises, sets and reps.",
                "Create a coach code and send the link to your athletes.",
                "Assign the program into their week. They train; you see every set.",
              ].map((line, index) => (
                <li key={line} className="flex gap-2.5">
                  <span className="mt-px font-mono text-[11px] font-bold text-accent">
                    {index + 1}
                  </span>
                  <span>{line}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-3 pt-7">
          <button
            type="submit"
            className="rounded-[11px] bg-accent px-[26px] py-[13px] text-sm font-bold text-[#0a0c0d] hover:bg-accent-hi"
          >
            Go to coaching
          </button>
          <button
            type="button"
            onClick={() => setAlsoTrains(true)}
            className="rounded-[11px] border border-stroke bg-ghost px-5 py-[13px] text-[13.5px] font-semibold text-fg-muted hover:bg-hover"
          >
            I train here too — set mine up
          </button>
        </div>

        <div className="mt-3">
          <Message error={state.error} notice={state.notice} />
        </div>
      </form>

      <aside
        className="relative hidden w-[392px] flex-none overflow-hidden rounded-[20px] border border-line bg-surface bg-cover bg-center lg:block"
        style={{ backgroundImage: `url(${PLACEHOLDER_IMAGES.authPanel})` }}
      >
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#08090a10_30%,#08090af8_100%)]" />
        <div className="absolute inset-x-0 bottom-0 p-7">
          <div className="font-mono text-[10px] font-bold tracking-[0.12em] text-accent uppercase">
            One account, two hats
          </div>
          <div className="mt-2.5 text-[22px] leading-[1.2] font-extrabold tracking-[-0.03em]">
            Coaching is a capability, not a different login.
          </div>
          <p className="mt-2.5 text-[12.5px] leading-[1.5] text-fg-muted">
            The same email writes programs for your athletes and logs your own
            sets. Nothing to switch between.
          </p>
        </div>
      </aside>
    </main>
  );
}
