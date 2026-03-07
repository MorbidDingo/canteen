import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "pg",
    "razorpay",
  ],
  images: {
    remotePatterns: [],
  },
};

export default nextConfig;
