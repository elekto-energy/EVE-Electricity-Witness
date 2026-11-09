/** @type {import('next').NextConfig} */
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

// A2 instrument hashes, measured at build time where the sources are on disk (the function bundle has no .ts
// sources). The file list is the one run_a2.ts uses. A missing source is recorded as MISSING, never guessed.
(() => {
  const root = path.join(__dirname, "../../");
  const list = JSON.parse(fs.readFileSync(path.join(root, "pipeline/a2/instrument_files.json"), "utf-8"));
  const out = Object.fromEntries(list.map(rel => {
    const p = path.join(root, ...rel.split("/"));
    return [rel, fs.existsSync(p) ? crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex") : "MISSING"];
  }));
  fs.mkdirSync(path.join(__dirname, "lib/a2"), { recursive: true });
  fs.writeFileSync(path.join(__dirname, "lib/a2/instrument.generated.json"), JSON.stringify(out, null, 2) + "\n");
})();

const nextConfig = {
  output: "standalone",

  // Monorepo tracing: ensures standalone includes packages/ dependencies
  // Moved from experimental to top-level per Next.js 15.5
  outputFileTracingRoot: path.join(__dirname, "../../"),

  // glpk.js uses WASM + worker_threads — cannot be bundled by webpack
  serverExternalPackages: ["glpk.js"],

  // The data-update route imports the A2 pipeline from ../../pipeline (outside this app).
  experimental: { externalDir: true },

  // Owner 2026-11-10: the old Ask-EVE report pages cannot generate reports in production (their locked datasets are
  // not deployed), so visitors arriving from search go to the home page. The API routes are left untouched.
  async redirects() {
    return [
      { source: "/ask-eve", destination: "/", permanent: true },
      { source: "/ask-eve/verify", destination: "/", permanent: true },
    ];
  },
  webpack: (config) => {
    // Files outside apps/web resolve npm packages from apps/web/node_modules (no root install on Vercel).
    config.resolve.modules = [path.join(__dirname, "node_modules"), "node_modules"];
    return config;
  },
};

module.exports = nextConfig;
