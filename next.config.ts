import type { NextConfig } from 'next';

// Standalone output is only enabled for the Docker image (set in Dockerfile):
// on Windows it needs symlink privileges and fails with EPERM during local builds.
const nextConfig: NextConfig = {
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
};

export default nextConfig;
