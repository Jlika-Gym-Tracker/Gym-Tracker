import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * The e2e suite builds into its own directory so a `playwright test` run
   * cannot clobber the running dev server's .next manifests — sharing one
   * serves the app with no CSS, which is maddening to diagnose.
   */
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
