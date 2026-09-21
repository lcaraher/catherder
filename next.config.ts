import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output so the Docker runner stage only needs .next/standalone.
  output: "standalone",
  // Development only: keeps the dev badge off the theme controls, bottom-left.
  devIndicators: { position: "bottom-right" },
};

export default nextConfig;
