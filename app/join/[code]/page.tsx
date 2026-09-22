import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/shell/logo";
import { JoinCoachCard } from "@/components/coach/join-coach-card";
import { PLACEHOLDER_IMAGES } from "@/lib/placeholder-images";

export const metadata: Metadata = {
  title: "Join your coach · JLIKA Gym",
  // An invite link is not something to index.
  robots: { index: false, follow: false },
};

/** Codes are short and fixed-shape; anything else is not worth a lookup. */
function normalize(raw: string) {
  return decodeURIComponent(raw).trim().toUpperCase().slice(0, 24);
}

/**
 * The link a coach actually sends.
 *
 * Without this, an athlete holding a code had to create an account, finish
 * onboarding, then find Profile → Coach and paste it. A coach hands out a
 * link, not a settings path.
 *
 * This route is public, so it renders for someone with no account — but the
 * coach's name is only looked up once there is a session: coach_invite_preview
 * is granted to `authenticated` only, so an anonymous visitor cannot use it to
 * test codes and find out whose they are.
 */
export default async function JoinPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const code = normalize((await params).code);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <Shell code={code}>
        <h1 className="display text-[30px]">You have been invited by a coach.</h1>
        <p className="mt-3 text-[13.5px] leading-[1.55] text-fg-muted">
          Create your account and the code is applied for you. Your coach starts
          with your training only — bodyweight, photos and meals stay yours
          until you decide otherwise.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            href={`/signup?code=${encodeURIComponent(code)}`}
            className="rounded-[11px] bg-accent px-[22px] py-[13px] text-sm font-bold text-[#0a0c0d] hover:bg-accent-hi"
          >
            Create my account
          </Link>
          <Link
            href={`/login?next=${encodeURIComponent(`/join/${code}`)}`}
            className="rounded-[11px] border border-stroke bg-ghost px-[22px] py-[13px] text-sm font-semibold text-fg-muted hover:bg-hover"
          >
            I already have one
          </Link>
        </div>
      </Shell>
    );
  }

  const { data, error } = await supabase.rpc("coach_invite_preview", {
    invite_code: code,
  });
  const preview = data?.[0];

  return (
    <Shell code={code}>
      <JoinCoachCard
        code={code}
        coachName={preview?.coach_name ?? null}
        gymName={preview?.gym_name ?? null}
        avatarUrl={preview?.avatar_url ?? null}
        reason={error ? "error" : (preview?.reason ?? "unknown")}
      />
    </Shell>
  );
}

function Shell({ code, children }: { code: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-svh items-stretch gap-[18px] bg-bg p-[30px]">
      <div className="flex flex-1 flex-col justify-center rounded-[20px] border border-line bg-surface px-6 py-[34px] sm:px-[38px]">
        <div className="w-full max-w-[520px]">
          <Logo size={30} className="mb-[30px]" />
          <div className="mb-5 w-fit rounded-md border border-line-hi bg-accent-soft px-[9px] py-[5px] font-mono text-[10.5px] font-bold tracking-[0.12em] text-accent uppercase">
            {code}
          </div>
          {children}
        </div>
      </div>
      <aside
        className="relative hidden w-[392px] flex-none overflow-hidden rounded-[20px] border border-line bg-surface bg-cover bg-center lg:block"
        style={{ backgroundImage: `url(${PLACEHOLDER_IMAGES.authPanel})` }}
      >
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#08090a10_30%,#08090af8_100%)]" />
      </aside>
    </main>
  );
}
