import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output so the Docker runner stage only needs .next/standalone.
  output: "standalone",
};

export default nextConfig;
