// No-op shim for expo-notifications on web.
// Metro resolves this file instead of expo-notifications when bundling for web
// (see metro.config.js resolveRequest override).
// All native notification APIs are safely stubbed so web builds never crash.

export const setNotificationHandler = () => {};

export const addNotificationResponseReceivedListener = () => ({ remove: () => {} });

export const getLastNotificationResponseAsync = async () => null;

export const getPermissionsAsync = async () => ({ status: 'undetermined' as const });

export const requestPermissionsAsync = async () => ({ status: 'denied' as const });

export const getDevicePushTokenAsync = async () => ({ data: '', type: 'fcm' as const });

export const setNotificationChannelAsync = async () => {};

export const AndroidImportance = { MAX: 5, HIGH: 4, DEFAULT: 3, LOW: 2, MIN: 1 };
