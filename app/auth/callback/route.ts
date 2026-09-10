import type { NextRequest } from "next/server";
import { landSession } from "@/lib/auth/land-session";

/** OAuth (Google) lands here. Same handling — the shapes are interchangeable. */
export async function GET(request: NextRequest) {
  return landSession(request);
}
