"use client";

import { ErrorPanel } from "@/components/kit/error-panel";

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorPanel error={error} reset={reset} standalone />;
}
