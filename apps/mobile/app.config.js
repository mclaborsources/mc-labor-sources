const path = require('path');
const { existsSync } = require('fs');
const { expo } = require('./app.json');

// Expo only auto-loads .env files from the app directory. During local
// development, load the monorepo-root environment without overriding values
// supplied by EAS or the calling shell.
const rootEnvPath = path.resolve(__dirname, '../../.env');
if (
  existsSync(rootEnvPath) &&
  (!process.env.EXPO_PUBLIC_SUPABASE_URL || !process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY)
) {
  process.loadEnvFile(rootEnvPath);
}

module.exports = { expo };
