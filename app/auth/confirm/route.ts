import type { NextRequest } from "next/server";
import { landSession } from "@/lib/auth/land-session";

/** Email confirmations and the Forgot-password link land here. */
export async function GET(request: NextRequest) {
  return landSession(request);
}
