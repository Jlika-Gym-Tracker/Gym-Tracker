import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAiCoachAvailable } from "@/lib/ai-coach/config";
import { getAiCoachView } from "@/lib/ai-coach/state";
import { AiCoachConsent } from "@/components/ai-coach/consent-card";
import { AiCoachScreen } from "@/components/ai-coach/ai-coach-screen";

/**
 * Designing or reviewing a week is one model call that can run for a minute
 * or more. The AI Coach's Server Actions are invoked from this page, so they
 * inherit this limit on serverless hosts; app/actions/ai-coach.ts keeps each
 * run's own deadline below it, so a slow answer fails cleanly and is logged
 * instead of being cut off mid-write.
 */
export const maxDuration = 300;

export default async function AiCoachPage() {
  // No key on the server: the route does not exist, just as the nav item doesn't.
  if (!isAiCoachAvailable()) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const view = await getAiCoachView(supabase, user.id);

  // Opt-in per account: until they agree, the only thing here is what it means.
  if (!view.consentedAt) {
    return <AiCoachConsent model={view.model} dailyLimit={view.dailyLimit} fixture={view.fixture} />;
  }
  return <AiCoachScreen view={view} />;
}
