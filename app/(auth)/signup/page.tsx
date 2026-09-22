import type { Metadata } from "next";
import { AUTH_POINTS, AuthShell, type ValuePoint } from "@/components/auth/auth-shell";
import { SignupForm } from "@/components/auth/signup-form";
import { PLACEHOLDER_IMAGES } from "@/lib/placeholder-images";

export const metadata: Metadata = { title: "Create an account · JLIKA Gym" };

const COACH_POINTS: ValuePoint[] = [
  {
    title: "Write it once, assign it often",
    body: "Build a program in your library, then drop it into any athlete's week.",
  },
  {
    title: "They choose what you see",
    body: "You get their training. Bodyweight, photos and meals stay theirs unless they hand them over.",
  },
  {
    title: "Same account, second hat",
    body: "Coach here and train here. One login, one password, no switching.",
  },
];

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ as?: string; code?: string }>;
}) {
  const { as, code } = await searchParams;
  const isCoach = as === "coach";

  return (
    <AuthShell
      image={isCoach ? PLACEHOLDER_IMAGES.authPanel : PLACEHOLDER_IMAGES.onboardingPanel}
      eyebrow={isCoach ? "For coaches" : "Private by default"}
      points={isCoach ? COACH_POINTS : AUTH_POINTS}
    >
      <SignupForm
        mode={isCoach ? "coach" : "athlete"}
        presetCode={code ? code.trim().toUpperCase().slice(0, 24) : undefined}
      />
    </AuthShell>
  );
}
