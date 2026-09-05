import { Card, Eyebrow } from "./card";

/**
 * Stand-in for a screen whose phase has not been built yet. Keeps sidebar
 * navigation honest instead of leaving dead links behind.
 */
export function PhasePlaceholder({
  phase,
  title,
  body,
}: {
  phase: string;
  title: string;
  body: string;
}) {
  return (
    <Card className="flex min-h-[420px] flex-col items-center justify-center gap-3 text-center">
      <Eyebrow>{phase}</Eyebrow>
      <h2 className="display text-[30px]">{title}</h2>
      <p className="max-w-[460px] text-[13.5px] leading-[1.55] text-fg-muted">
        {body}
      </p>
    </Card>
  );
}
