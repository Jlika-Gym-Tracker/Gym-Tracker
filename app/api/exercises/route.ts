import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { findCandidates, type LibraryExercise } from "@/lib/program/match";

/** Library search for the mid-session "add something extra" box. */
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return NextResponse.json([]);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // RLS limits this to global rows plus the caller's own.
  const { data, error } = await supabase
    .from("exercises")
    .select("id, name, slug, aliases, primary_muscle, equipment, image_start_url");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const matches = findCandidates(query, (data ?? []) as LibraryExercise[], 8);
  return NextResponse.json(
    matches.map((m) => ({
      id: m.exercise.id,
      name: m.exercise.name,
      primary_muscle: m.exercise.primary_muscle,
      image_start_url: m.exercise.image_start_url,
    })),
  );
}
