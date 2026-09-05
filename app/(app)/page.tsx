import { EmptyState } from "@/components/kit/empty-state";
import { Card, Eyebrow, StatCard } from "@/components/kit/card";

/**
 * Today. Phase 1 renders the shell of the screen with honest empty states —
 * the hero, stats, weight trend and week strip fill in as later phases land
 * program, session and body data.
 */
export default function TodayPage() {
  return (
    <div className="grid items-start gap-[18px] xl:grid-cols-[1fr_336px]">
      <div className="flex min-w-0 flex-col gap-[18px]">
        <EmptyState
          eyebrow="No week published"
          title="Write your first week."
          body="You write the program — every week. Paste it as text, build it by hand, or start blank and fill it in at the gym."
          action={{ href: "/program", label: "Open program builder" }}
          secondaryAction={{ href: "/profile", label: "Finish your profile" }}
          watermark="WEEK 1"
        />

        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Sessions" value="—" unit="this week" delta="No sessions logged" />
          <StatCard label="Volume" value="—" unit="kg" delta="Starts with your first set" />
          <StatCard label="Avg deficit" value="—" unit="kcal / day" delta="Set targets in profile" />
          <StatCard label="Weight" value="—" unit="kg" delta="Log your first weigh-in" />
        </div>

        <Card className="flex min-h-[220px] flex-col">
          <Eyebrow>Weight trend</Eyebrow>
          <div className="flex flex-1 items-center justify-center">
            <p className="max-w-[280px] text-center text-[13px] leading-[1.55] text-fg-dim">
              Twelve weeks of weigh-ins draw a line here. Nothing to plot yet.
            </p>
          </div>
        </Card>
      </div>

      <div className="flex flex-col gap-[18px]">
        <Card className="flex min-h-[200px] flex-col">
          <Eyebrow>Fuel today</Eyebrow>
          <div className="flex flex-1 items-center justify-center">
            <p className="max-w-[240px] text-center text-[13px] leading-[1.55] text-fg-dim">
              Calorie and macro targets appear once your body details are in.
            </p>
          </div>
        </Card>

        <Card className="flex min-h-[200px] flex-col">
          <Eyebrow>Progress photos</Eyebrow>
          <div className="flex flex-1 items-center justify-center">
            <p className="max-w-[240px] text-center text-[13px] leading-[1.55] text-fg-dim">
              Your first photo pair shows up here. Private to your account.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
