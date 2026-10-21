import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { searchLibrary } from "@/lib/program/match";
import { getLibrary } from "@/lib/program/queries";

/** Library search for the mid-session "add something extra" box. */
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return NextResponse.json([]);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Global rows plus the caller's own, without the ones they removed. Featured
  // movements and your own come first among equally good hits.
  let library;
  try {
    library = await getLibrary();
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not read the library." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    searchLibrary(query, library, 8).map((exercise) => ({
      id: exercise.id,
      name: exercise.name,
      primary_muscle: exercise.primary_muscle,
      image_start_url: exercise.image_start_url,
    })),
  );
}
