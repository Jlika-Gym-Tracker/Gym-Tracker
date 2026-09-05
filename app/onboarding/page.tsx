import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";

export const metadata: Metadata = { title: "Set up · JLIKA Gym" };

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, onboarded_at")
    .eq("id", user.id)
    .maybeSingle();

  // Finished already — no reason to walk it again.
  if (profile?.onboarded_at) redirect("/");

  return (
    <OnboardingFlow
      defaultName={profile?.display_name ?? user.email?.split("@")[0] ?? ""}
    />
  );
}
