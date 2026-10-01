/** @type {import('next').NextConfig} */
const path = require('path');
const { PHASE_DEVELOPMENT_SERVER } = require('next/constants');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

module.exports = (phase) => ({
  transpilePackages: ['@mc-labor/shared'],
  // Keep development output separate from production and validation builds.
  distDir: process.env.NEXT_DIST_DIR || (phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next'),
});
