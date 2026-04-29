import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, Platform, Text, I18nManager } from 'react-native';
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

// Every string in this app is Hebrew and the layout is hand-tuned for RTL
// (row-reverse, textAlign:right). On an English-locale Android device the
// default direction is LTR, which renders the whole UI mirrored. Force RTL
// at module import so the layout is correct regardless of OS locale.
// Web ignores I18nManager and uses the dir="rtl" attribute on <html> instead.
if (Platform.OS !== 'web') {
  I18nManager.allowRTL(true);
  if (!I18nManager.isRTL) I18nManager.forceRTL(true);
}

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

  // Safety net: if auth + profile never resolve within 10s (e.g. Firestore
  // listener hangs on a stale uid or blocked network), fall through to
  // onboarding so the user never sees a frozen splash.
  useEffect(() => {
    const timer = setTimeout(() => {
      setAppState((prev) => (prev === 'loading' ? 'onboarding' : prev));
    }, 10000);
    return () => clearTimeout(timer);
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
        <Text style={{ color: colors.accent, marginTop: 16, fontSize: 16 }}>טוען…</Text>
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
