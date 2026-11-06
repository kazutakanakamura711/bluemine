import type { NextConfig } from 'next';

const isBrowserE2E = process.env.BLUEMINE_BROWSER_E2E === '1';

const nextConfig: NextConfig = {
  distDir: isBrowserE2E ? '.next-e2e' : '.next',
  typescript: {
    tsconfigPath: isBrowserE2E ? 'tsconfig.browser-e2e.json' : 'tsconfig.json',
  },
};

export default nextConfig;
