import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

import { auth, db } from './src/config/firebase';
import { navigationRef } from './src/navigation/navigationRef';
import OnboardingNavigator from './src/navigation/OnboardingNavigator';
import MainNavigator from './src/navigation/MainNavigator';
import { usePushNotifications } from './src/hooks/usePushNotifications';
import { colors } from './src/theme';

type AppState = 'loading' | 'onboarding' | 'main';

export default function App() {
  const [appState, setAppState] = useState<AppState>('loading');
  usePushNotifications();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user: User | null) => {
      if (!user) { setAppState('onboarding'); return; }
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        setAppState(snap.exists() && snap.data().name ? 'main' : 'onboarding');
      } catch {
        setAppState('onboarding');
      }
    });
    return unsub;
  }, []);

  if (appState === 'loading') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <StatusBar style="light" backgroundColor={colors.bg} />
      {appState === 'onboarding' ? <OnboardingNavigator /> : <MainNavigator />}
    </NavigationContainer>
  );
}
