import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Don't write AGENTS.md / CLAUDE.md into the app folder on `next dev`.
  agentRules: false,
  // `next build` also writes a self-contained server (.next/standalone) for the Docker image.
  // Tracing starts at the workspace root so pnpm's hoisted packages are included.
  output: 'standalone',
  outputFileTracingRoot: path.join(path.dirname(fileURLToPath(import.meta.url)), '../..'),
};

export default nextConfig;
