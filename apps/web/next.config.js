/** @type {import('next').NextConfig} */
const path = require("path");

const nextConfig = {
  output: "standalone",

  // Monorepo tracing: ensures standalone includes packages/ dependencies
  // Moved from experimental to top-level per Next.js 15.5
  outputFileTracingRoot: path.join(__dirname, "../../"),

  // glpk.js uses WASM + worker_threads — cannot be bundled by webpack
  serverExternalPackages: ["glpk.js"],
};

module.exports = nextConfig;
