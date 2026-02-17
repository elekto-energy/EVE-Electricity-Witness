/** @type {import('next').NextConfig} */
const path = require("path");

const nextConfig = {
  // Always standalone — EVE is infrastructure, not frontend-first.
  // Deterministic build: Docker, local, CI all produce same artifact.
  output: "standalone",

  // Monorepo tracing: ensures standalone includes packages/ dependencies
  experimental: {
    outputFileTracingRoot: path.join(__dirname, "../../"),
  },
};

module.exports = nextConfig;
