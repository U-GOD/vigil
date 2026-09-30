import type { NextConfig } from "next";

const api = process.env.VIGIL_API_URL ?? "http://127.0.0.1:8787";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@vigil/sdk"],
  async rewrites() {
    return [{ source: "/vigil-api/:path*", destination: `${api}/:path*` }];
  },
};

export default nextConfig;
