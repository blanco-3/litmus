import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Turbopack (default in Next.js 16) handles WASM natively — no extra config needed.
  // Silence the turbopack/webpack warning:
  turbopack: {},
};

export default nextConfig;
