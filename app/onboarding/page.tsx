import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { CoachOnboarding } from "@/components/onboarding/coach-onboarding";

export const metadata: Metadata = { title: "Set up · JLIKA Gym" };

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ again?: string }>;
}) {
  const { again } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, onboarded_at, coaching_enabled")
    .eq("id", user.id)
    .maybeSingle();

  const name = profile?.display_name ?? user.email?.split("@")[0] ?? "";

  // ?again=1 is how a coach who skipped the body questions gets back here to
  // answer them. Without it, finishing once is final.
  if (profile?.onboarded_at) {
    if (again !== "1") redirect("/");
    return <OnboardingFlow defaultName={name} />;
  }

  // Someone who signed up at /signup?as=coach is asked two questions, not
  // twelve — see CoachOnboarding.
  if (profile?.coaching_enabled) return <CoachOnboarding defaultName={name} />;

  return <OnboardingFlow defaultName={name} />;
}
