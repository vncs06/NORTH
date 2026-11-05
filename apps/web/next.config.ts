import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  output: process.env.NEXT_OUTPUT_MODE === 'server' ? undefined : 'standalone',
  transpilePackages: ['@north/domain'],
};

export default nextConfig;
