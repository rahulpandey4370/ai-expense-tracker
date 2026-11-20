
import type {NextConfig} from 'next';
import withPWA from "@ducanh2912/next-pwa";

const pwaConfig = withPWA({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Chat attachments (receipt photos, statement PDFs) go through server actions.
  // 4mb stays under Vercel's 4.5MB request cap; photos are shrunk in the browser first.
  experimental: {
    serverActions: { bodySizeLimit: '4mb' },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co', // Added for placeholder images
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      }
    ],
  },
};

export default pwaConfig(nextConfig);
