import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "pg",
    "razorpay",
    "pdf-parse",
  ],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
    ],
    localPatterns: [
      {
        pathname: "/uploads/**",
      },
      {
        pathname: "/logo*.png",
      },
    ],
  },
  experimental: {
    proxyClientMaxBodySize: "25mb",
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
