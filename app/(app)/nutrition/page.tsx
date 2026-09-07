import { currentWeekStart, toDateString } from "@/lib/dates";
import {
  getExcludes,
  getRecipes,
  getTargets,
  getWeekPlan,
} from "@/lib/nutrition/queries";
import { NutritionScreen } from "@/components/nutrition/nutrition-screen";
import { AllergiesPanel } from "@/components/nutrition/allergies-panel";
import { TargetsMissing } from "@/components/nutrition/targets-missing";
import { createClient } from "@/lib/supabase/server";
import type { UnitSystem } from "@/lib/database.types";

export default async function NutritionPage() {
  const weekStart = currentWeekStart();
  const [targets, plan, recipes, excludes] = await Promise.all([
    getTargets(),
    getWeekPlan(weekStart),
    getRecipes(),
    getExcludes(),
  ]);

  // Targets need height, birth date, sex and a weigh-in. Name what is missing
  // rather than listing everything it might be.
  if (!targets.ok) {
    const supabase = await createClient();
    const { data: profile } = await supabase
      .from("profiles")
      .select("unit_system")
      .maybeSingle();

    return (
      <div className="grid items-start gap-[18px] xl:grid-cols-[1fr_336px]">
        <TargetsMissing
          missing={targets.missing}
          system={(profile?.unit_system ?? "metric") as UnitSystem}
        />
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
