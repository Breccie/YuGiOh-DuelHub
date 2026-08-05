import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const buildSha =
  process.env.VERCEL_GIT_COMMIT_SHA?.trim()
  || process.env.GITHUB_SHA?.trim()
  || process.env.RENDER_GIT_COMMIT?.trim()
  || "development";
const buildTime = new Date().toISOString();

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  experimental: {
    externalDir: true,
  },
  outputFileTracingRoot: path.join(currentDirectory, "../.."),
  env: {
    DUEL_HUB_BUILD_SHA: buildSha,
    DUEL_HUB_BUILD_TIME: buildTime,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "X-Duel-Hub-Frontend-Build", value: buildSha }],
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.ygoprodeck.com",
      },
    ],
  },
};

export default nextConfig;
