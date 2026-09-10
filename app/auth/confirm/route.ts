import type { NextRequest } from "next/server";
import { landSession } from "@/lib/auth/land-session";

/** Email confirmations and magic links land here. */
export async function GET(request: NextRequest) {
  return landSession(request);
}
