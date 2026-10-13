import type { NextConfig } from "next";

// With VIGIL_API_URL set, /vigil-api proxies to services/api. Without it, app/vigil-api
// serves the same routes from Monad testnet contract reads.
const api = process.env.VIGIL_API_URL;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@vigil/sdk", "@vigil/api", "@vigil/indexer", "@vigil/riskmodel", "@vigil/marketdata"],
  async rewrites() {
    return api ? { beforeFiles: [{ source: "/vigil-api/:path*", destination: `${api}/:path*` }], afterFiles: [], fallback: [] } : [];
  },
};

export default nextConfig;
