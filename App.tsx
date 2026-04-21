import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { doc, onSnapshot } from 'firebase/firestore';

import { db, onAuthStateChanged } from './src/config/firebase';
import { navigationRef } from './src/navigation/navigationRef';
import OnboardingNavigator from './src/navigation/OnboardingNavigator';
import MainNavigator from './src/navigation/MainNavigator';
import { usePushNotifications } from './src/hooks/usePushNotifications';
import { colors } from './src/theme';
import ErrorBoundary from './src/components/ErrorBoundary';

type AppState = 'loading' | 'onboarding' | 'main';

export default function App() {
  const [appState, setAppState] = useState<AppState>('loading');
  const [uid, setUid] = useState<string | null>(null);
  usePushNotifications(uid);

  // Register the FCM service worker on every web load, regardless of auth or
  // notification permission. Chrome's PWA install criteria require an active
  // SW with a fetch handler on the first visit; without this, Chrome either
  // hides the install UI (desktop) or falls back to a shortcut/stale WebAPK
  // (Android) that never picks up updated maskable icons.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker
      .register('/firebase-messaging-sw.js', { scope: '/' })
      .catch((err) => console.warn('SW registration failed', err));
  }, []);

  // Step 1: Track auth state
  useEffect(() => {
    return onAuthStateChanged((user: any) => {
      setUid(user?.uid ?? null);
      if (!user) setAppState('onboarding');
    });
  }, []);

  // Step 2: Listen to user profile — reacts when profile is created after onboarding
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(doc(db, 'users', uid), (snap) => {
      setAppState(snap.exists() && snap.data()?.name ? 'main' : 'onboarding');
    }, () => {
      setAppState('onboarding');
    });
  }, [uid]);

  if (appState === 'loading') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <NavigationContainer ref={navigationRef}>
          <StatusBar style="light" backgroundColor={colors.bg} />
          {appState === 'onboarding' ? <OnboardingNavigator /> : <MainNavigator />}
        </NavigationContainer>
        {/* Invisible reCAPTCHA mount point for web phone auth (firebase/auth RecaptchaVerifier) */}
        {Platform.OS === 'web' && (
          // @ts-ignore — <div> is valid in react-native-web's web rendering context
          <div id="recaptcha-container" style={{ position: 'absolute', bottom: 0 }} />
        )}
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
