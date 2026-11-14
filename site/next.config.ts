import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // NEXT_OUTPUT=standalone (set by site/Dockerfile) builds a self-contained server for a container; Vercel ignores it.
  ...(process.env.NEXT_OUTPUT === "standalone" ? { output: "standalone" as const } : {}),
};

export default nextConfig;
