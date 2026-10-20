import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPersonalBests, getRecentSessions, getSession } from "@/lib/training/queries";
import { prescribe } from "@/lib/program/prescription";
import { SessionScreen, type SessionSettings } from "@/components/session/session-screen";
import type { SidePanelData } from "@/components/session/side-panel";
import type { EffortScale, UnitSystem } from "@/lib/database.types";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: profile }, { data: prefs }, session] = await Promise.all([
    supabase.from("profiles").select("unit_system").maybeSingle(),
    supabase
      .from("user_settings")
      .select(
        "default_rest_seconds, keyboard_shortcuts, auto_rest, show_e1rm, keep_awake, rest_sound, effort_scale",
      )
      .maybeSingle(),
    getSession(id),
  ]);

  if (!session) notFound();
  if (session.ended_at) redirect(`/session/${session.id}/summary`);

  const system = (profile?.unit_system ?? "metric") as UnitSystem;
  const settings: SessionSettings = {
    restSeconds: prefs?.default_rest_seconds ?? 90,
    autoRest: prefs?.auto_rest ?? true,
    shortcuts: prefs?.keyboard_shortcuts ?? true,
    showE1rm: prefs?.show_e1rm ?? false,
    keepAwake: prefs?.keep_awake ?? true,
    restSound: prefs?.rest_sound ?? true,
    effortScale: (prefs?.effort_scale ?? "rpe") as EffortScale,
  };

  // Per-movement history, bests and the next-step prescription, computed once on
  // the server so the client bundle stays free of database access.
  const ids = session.exercises.map((ex) => ex.exercise.id);
  const [recent, bests] = await Promise.all([
    getRecentSessions(ids, { excludeSessionId: session.id, perExercise: 8 }),
    getPersonalBests(ids, { excludeSessionId: session.id }),
  ]);

  const panels: Record<string, SidePanelData> = {};
  for (const ex of session.exercises) {
    const history = recent.get(ex.exercise.id) ?? [];
    const p = prescribe(
      {
        tracking: ex.exercise.tracking ?? "reps",
        primaryMuscle: ex.exercise.primary_muscle,
        equipment: ex.exercise.equipment,
        dayPolicy: session.day?.progression ?? null,
        plan: ex.plan,
      },
      history,
      system,
    );
    panels[ex.exercise.id] = {
      history: history.slice(0, 6).map((h) => ({
        date: h.date,
        topWeightKg: Math.max(0, ...h.sets.map((s) => Number(s.weight_kg ?? 0))),
        longestS: Math.max(0, ...h.sets.map((s) => s.duration_s ?? 0)),
      })),
      prescription: {
        policy: p.policy,
        kind: p.kind,
        why: p.why,
        reps: p.reps,
        seconds: p.seconds,
        weightKg: p.weightKg,
      },
      best: bests.get(ex.exercise.id) ?? null,
    };
  }

  return <SessionScreen session={session} system={system} settings={settings} panels={panels} />;
}
