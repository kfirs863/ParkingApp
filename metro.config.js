const { getDefaultConfig } = require('expo/metro-config');

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

module.exports = config;
