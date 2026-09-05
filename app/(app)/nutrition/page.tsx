import Link from "next/link";
import { currentWeekStart, toDateString } from "@/lib/dates";
import {
  getExcludes,
  getRecipes,
  getTargets,
  getWeekPlan,
} from "@/lib/nutrition/queries";
import { NutritionScreen } from "@/components/nutrition/nutrition-screen";
import { AllergiesPanel } from "@/components/nutrition/allergies-panel";
import { Card } from "@/components/kit/card";

export default async function NutritionPage() {
  const weekStart = currentWeekStart();
  const [targets, plan, recipes, excludes] = await Promise.all([
    getTargets(),
    getWeekPlan(weekStart),
    getRecipes(),
    getExcludes(),
  ]);

  // Targets need height, birth date, sex and a weigh-in. Ask rather than guess.
  if (!targets) {
    return (
      <div className="grid items-start gap-[18px] xl:grid-cols-[1fr_336px]">
        <Card className="rounded-[18px]">
          <div className="w-fit rounded-md border border-line-hi bg-accent-soft px-[9px] py-[5px] font-mono text-[10.5px] font-bold tracking-[0.12em] text-accent uppercase">
            Targets not set
          </div>
          <h1 className="display mt-4 mb-2 max-w-[460px] text-[34px]">
            We need four numbers first.
          </h1>
          <p className="max-w-[440px] text-[13.5px] leading-[1.55] text-fg-muted">
            Calorie and macro targets come from your height, birth date, sex and a
            current bodyweight — Mifflin-St Jeor, then an activity factor and your
            deficit. Nothing is invented, so nothing shows until those are in.
          </p>
          <div className="mt-6 flex flex-wrap gap-2.5">
            <Link
              href="/profile"
              className="rounded-[11px] bg-accent px-[22px] py-[13px] text-sm font-bold text-[#0a0c0d] hover:bg-accent-hi"
            >
              Fill in your profile
            </Link>
            <Link
              href="/progress"
              className="rounded-[11px] border border-stroke bg-ghost px-5 py-[13px] text-sm font-semibold text-fg-2 hover:bg-hover"
            >
              Log a weigh-in
            </Link>
          </div>
        </Card>
        <AllergiesPanel excludes={excludes} />
      </div>
    );
  }

  return (
    <NutritionScreen
      plan={plan}
      targets={targets.targets}
      trainingDays={targets.trainingDays}
      today={toDateString(new Date())}
      weekStart={weekStart}
      recipes={recipes}
      excludes={excludes}
    />
  );
}
