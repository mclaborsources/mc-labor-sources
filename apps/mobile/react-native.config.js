/** @type {import('@react-native-community/cli-types').Config} */
module.exports = {
  dependencies: {
    // Ensure correct import when expo/react-native.config.js fails to load on EAS (pnpm monorepo).
    // expo/android/build.gradle namespace is "expo.core" but ExpoModulesPackage lives in expo.modules.
    expo: {
      platforms: {
        android: {
          packageImportPath: 'import expo.modules.ExpoModulesPackage;',
          packageInstance: 'new ExpoModulesPackage()',
        },
      },
    },
  },
};
