import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Local testing runs on 127.0.0.1 because another service holds localhost:3311 over IPv6.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
