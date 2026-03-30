import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
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

type AppState = 'loading' | 'onboarding' | 'main';

export default function App() {
  const [appState, setAppState] = useState<AppState>('loading');
  const [uid, setUid] = useState<string | null>(null);
  usePushNotifications(uid);

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
      <NavigationContainer ref={navigationRef}>
        <StatusBar style="light" backgroundColor={colors.bg} />
        {appState === 'onboarding' ? <OnboardingNavigator /> : <MainNavigator />}
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
