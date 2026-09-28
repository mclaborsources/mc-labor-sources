/** @type {import('next').NextConfig} */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const nextConfig = {
  transpilePackages: ['@mc-labor/shared'],
  // Validation builds can use .next-build so they never corrupt a running
  // development server's Webpack files in .next.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
};

module.exports = nextConfig;
