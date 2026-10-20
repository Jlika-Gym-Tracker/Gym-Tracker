import Link from "next/link";
import { Card } from "@/components/kit/card";

/** A slug that is not in your library: someone else's movement, or a mistyped link. */
export default function ExerciseNotFound() {
  return (
    <Card className="mx-auto w-full max-w-[520px] rounded-[18px] text-center">
      <div className="eyebrow">Not in your library</div>
      <p className="mt-3 text-[13.5px] leading-[1.55] text-fg-muted">
        There is no exercise at that address — or it belongs to someone else.
      </p>
      <Link
        href="/exercises"
        className="mt-5 inline-flex rounded-[11px] bg-accent px-5 py-3 text-[13px] font-bold text-[#0a0c0d] hover:bg-accent-hi"
      >
        Browse the library
      </Link>
    </Card>
  );
}
