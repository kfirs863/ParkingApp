import React from 'react';
import { Platform } from 'react-native';
// createStackNavigator (JS-based) works on web; createNativeStackNavigator does not.
import { createStackNavigator } from '@react-navigation/stack';

import WelcomeScreen from '../screens/onboarding/WelcomeScreen';
import PhoneScreen from '../screens/onboarding/PhoneScreen';
import OTPScreen from '../screens/onboarding/OTPScreen';
import ProfileScreen from '../screens/onboarding/ProfileScreen';
import CarNumberScreen from '../screens/onboarding/CarNumberScreen';
import DoneScreen from '../screens/onboarding/DoneScreen';

export type OnboardingStackParamList = {
  Welcome: undefined;
  Phone: undefined;
  OTP: { phone: string };
  Profile: undefined;
  CarNumber: { name: string; tower: string; apartment: string };
  Done: undefined;
};

const Stack = createStackNavigator<OnboardingStackParamList>();

export default function OnboardingNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        // slide_from_right is a native-stack-only option; omit on web
        ...(Platform.OS !== 'web' ? { animation: 'slide_from_right' } : {}),
        cardStyle: { backgroundColor: 'transparent' },
      }}
    >
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="Phone" component={PhoneScreen} />
      <Stack.Screen name="OTP" component={OTPScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen name="CarNumber" component={CarNumberScreen} />
      <Stack.Screen name="Done" component={DoneScreen} />
    </Stack.Navigator>
  );
}
