/** @type {import('next').NextConfig} */
const nextConfig = {
  // Serve canonical data as static assets for API routes
  // All data access goes through API routes, never direct client fetch
  output: undefined, // default (not static export — we need API routes)
};

module.exports = nextConfig;
