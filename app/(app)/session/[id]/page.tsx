import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getExerciseHistory, getSession } from "@/lib/training/queries";
import { bestSet, progressionHint } from "@/lib/training/e1rm";
import { loadIncrementKg, weightUnit } from "@/lib/units";
import { SessionScreen } from "@/components/session/session-screen";
import type { SidePanelData } from "@/components/session/side-panel";
import type { UnitSystem } from "@/lib/database.types";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: profile }, { data: settings }, session] = await Promise.all([
    supabase.from("profiles").select("unit_system").maybeSingle(),
    supabase
      .from("user_settings")
      .select("default_rest_seconds, keyboard_shortcuts")
      .maybeSingle(),
    getSession(id),
  ]);

  if (!session) notFound();
  if (session.ended_at) redirect(`/?finished=1`);

  const system = (profile?.unit_system ?? "metric") as UnitSystem;

  // Per-movement history and the next-step hint, computed once on the server so
  // the client bundle stays free of database access.
  const panels: Record<string, SidePanelData> = {};
  await Promise.all(
    session.exercises.map(async (ex) => {
      const history = await getExerciseHistory(ex.exercise.id, {
        excludeSessionId: session.id,
      });
      const lastSets = history[0]?.sets ?? [];
      panels[ex.exercise.id] = {
        history: history.map((h) => ({
          date: h.date,
          topWeightKg: h.topWeightKg,
          volumeKg: h.volumeKg,
        })),
        hint: progressionHint({
          lastSets,
          repMin: ex.plan?.rep_min ?? null,
          repMax: ex.plan?.rep_max ?? null,
          incrementKg: loadIncrementKg(system),
          unitLabel: weightUnit(system),
        }).headline,
        bestEver: bestSet(history.flatMap((h) => h.sets)),
      };
    }),
  );

  return (
    <SessionScreen
      session={session}
      system={system}
      restSeconds={settings?.default_rest_seconds ?? 90}
      panels={panels}
      shortcutsEnabled={settings?.keyboard_shortcuts ?? true}
    />
  );
}
