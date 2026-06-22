const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const { resolve: metroResolve } = require('metro-resolver');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');
const sharedPackageRoot = path.resolve(workspaceRoot, 'packages/shared');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

// Merge Expo defaults (required by expo-doctor) with monorepo roots.
config.watchFolders = [...new Set([...(config.watchFolders ?? []), workspaceRoot])];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Explicit alias — tsconfig paths may not load on EAS when devDependencies are omitted.
config.resolver.alias = {
  ...(config.resolver.alias ?? {}),
  '@': path.resolve(projectRoot, 'src'),
};

config.resolver.extraNodeModules = {
  '@mc-labor/shared': sharedPackageRoot,
};

// Never traverse admin-web sources (Next.js / React 19)
const adminWebRoot = path.resolve(workspaceRoot, 'apps/admin-web');
config.resolver.blockList = [
  new RegExp(`${adminWebRoot.replace(/[/\\]/g, '[/\\\\]')}.*`),
];

function isReactFamily(moduleName) {
  return (
    moduleName === 'react' ||
    moduleName === 'react-dom' ||
    moduleName === 'react-native-web' ||
    moduleName.startsWith('react/') ||
    moduleName.startsWith('react-dom/')
  );
}

const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Always pin React to mobile's React 18 — admin-web's React 19 must never enter this bundle
  if (isReactFamily(moduleName)) {
    try {
      return {
        filePath: require.resolve(moduleName, { paths: [projectRoot] }),
        type: 'sourceFile',
      };
    } catch {
      // fall through
    }
  }

  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }

  return metroResolve(context, moduleName, platform);
};

module.exports = config;
