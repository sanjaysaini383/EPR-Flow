import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components is off for now: every page in the app is authenticated and
  // tenant-specific, so the classic dynamic rendering model is simpler. Revisit later.
  cacheComponents: false,
  serverExternalPackages: ["@node-rs/argon2"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
