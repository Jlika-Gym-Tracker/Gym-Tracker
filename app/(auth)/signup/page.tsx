import type { Metadata } from "next";
import { AUTH_POINTS, AuthShell } from "@/components/auth/auth-shell";
import { SignupForm } from "@/components/auth/signup-form";
import { PLACEHOLDER_IMAGES } from "@/lib/placeholder-images";

export const metadata: Metadata = { title: "Create an account · JLIKA Gym" };

export default function SignupPage() {
  return (
    <AuthShell
      image={PLACEHOLDER_IMAGES.onboardingPanel}
      eyebrow="Private by default"
      points={AUTH_POINTS}
    >
      <SignupForm />
    </AuthShell>
  );
}
