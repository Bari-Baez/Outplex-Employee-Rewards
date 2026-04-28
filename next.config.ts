import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    localPatterns: [
      {
        pathname: '/outplex-logo.png',
      },
      {
        pathname: '/outplex-logo.webp',
      },
      {
        pathname: '/api/assets/**',
      },
      {
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
