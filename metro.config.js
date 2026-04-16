const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Tell Metro to use the react-native export condition so @firebase/auth
// resolves to its RN build (dist/rn/index.js) instead of the browser build.
// The browser build runs registerAuth() at module evaluation time which
// crashes in Expo Go before the native bridge is ready.
config.resolver.unstable_conditionNames = [
  'react-native',
  'require',
  'default',
];

// On web, redirect expo-notifications to a no-op shim because the package
// requires native modules that don't exist in the browser environment.
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'expo-notifications') {
    return {
      filePath: path.resolve(__dirname, 'src/shims/expo-notifications-web.ts'),
      type: 'sourceFile',
    };
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
