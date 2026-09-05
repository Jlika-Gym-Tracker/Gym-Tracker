"use client";

import { ErrorPanel } from "@/components/kit/error-panel";

/** Errors inside the app shell keep the sidebar and top bar around them. */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorPanel error={error} reset={reset} />;
}
