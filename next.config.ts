import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    resolveAlias: {
      // Stub out wagmi's optional `accounts` peer dep (used only by tempo/webAuthn
      // connectors, which we never instantiate). Without this Turbopack fails at
      // build time trying to statically resolve the dynamic import('accounts').
      accounts: "./src/stubs/accounts.js",
    },
  },
  webpack: (config) => {
    // Same alias for the webpack (production) build
    config.resolve.alias["accounts"] = path.resolve("./src/stubs/accounts.js");
    return config;
  },
};

export default nextConfig;
