import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Chrome and curl often use 127.0.0.1 while `next dev` binds localhost.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
