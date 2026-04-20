const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// EXPLICIT REDIRECTS FOR WEB:
// The 'react-native' condition added by Expo/RN forces Firebase Auth 
// to use the native build even on Web. We need to force it to use
// the browser-compatible entry points for Web.
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web') {
    if (moduleName === 'firebase/auth') {
      return {
        filePath: path.resolve(__dirname, 'node_modules/firebase/auth/dist/index.mjs'),
        type: 'sourceFile',
      };
    }
    if (moduleName === '@firebase/auth') {
      return {
        filePath: path.resolve(__dirname, 'node_modules/@firebase/auth/dist/index.mjs'),
        type: 'sourceFile',
      };
    }
    if (moduleName === 'expo-notifications') {
      return {
        filePath: path.resolve(__dirname, 'src/shims/expo-notifications-web.ts'),
        type: 'sourceFile',
      };
    }
  }

  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
