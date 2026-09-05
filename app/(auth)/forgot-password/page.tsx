import type { Metadata } from "next";
import { AUTH_POINTS, AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { PLACEHOLDER_IMAGES } from "@/lib/placeholder-images";

export const metadata: Metadata = { title: "Reset your password · JLIKA Gym" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      image={PLACEHOLDER_IMAGES.authPanel}
      eyebrow="Built for you and your crew"
      points={AUTH_POINTS}
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
