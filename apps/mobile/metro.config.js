const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');
const sharedPackageRoot = path.resolve(workspaceRoot, 'packages/shared');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

// Preserve the workspace aliases needed by local and EAS builds.
config.resolver.alias = {
  ...(config.resolver.alias ?? {}),
  '@': path.resolve(projectRoot, 'src'),
};

config.resolver.extraNodeModules = {
  '@mc-labor/shared': sharedPackageRoot,
};

// Never traverse admin-web sources (Next.js).
const adminWebRoot = path.resolve(workspaceRoot, 'apps/admin-web');
config.resolver.blockList = [
  new RegExp(`${adminWebRoot.replace(/[/\\]/g, '[/\\\\]')}.*`),
];

// This workspace also contains a Next.js app on a newer React patch. Native
// modules must always share the mobile app's React instance with its renderer.
function isReactRuntime(moduleName) {
  return (
    moduleName === 'react' ||
    moduleName === 'react-dom' ||
    moduleName === 'react-native' ||
    moduleName === 'react-native-web' ||
    moduleName.startsWith('react/') ||
    moduleName.startsWith('react-dom/') ||
    moduleName.startsWith('react-native/') ||
    moduleName.startsWith('react-native-web/')
  );
}

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (isReactRuntime(moduleName)) {
    return {
      filePath: require.resolve(moduleName, { paths: [projectRoot] }),
      type: 'sourceFile',
    };
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
