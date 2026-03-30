import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { colors, spacing } from '../theme';
import HomeScreen from '../screens/home/HomeScreen';
import RequestScreen from '../screens/request/RequestScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';
import AvailabilityScreen from '../screens/availability/AvailabilityScreen';

export type MainTabParamList = {
  Home: { openConfirm?: string } | undefined;
  Request: undefined;
  Availability: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

function TabIcon({ label, emoji, focused }: { label: string; emoji: string; focused: boolean }) {
  return (
    <View style={[ti.wrap, focused && ti.wrapActive]}>
      <Text style={ti.emoji}>{emoji}</Text>
      <Text style={[ti.label, focused && ti.labelActive]}>{label}</Text>
    </View>
  );
}

const ti = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 2, paddingTop: 8, paddingHorizontal: spacing.md, borderRadius: 12 },
  wrapActive: { backgroundColor: colors.accentDim },
  emoji: { fontSize: 22 },
  label: { fontSize: 10, color: colors.textMuted, fontWeight: '500' },
  labelActive: { color: colors.accent, fontWeight: '700' },
});

export default function MainNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: colors.bgCard,
          borderTopColor: colors.border,
          height: Platform.OS === 'ios' ? 80 : 64,
          paddingBottom: Platform.OS === 'ios' ? 24 : 8,
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon label="ראשי" emoji="🅿️" focused={focused} /> }}
      />
      <Tab.Screen
        name="Request"
        component={RequestScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon label="בקש חניה" emoji="🙋" focused={focused} /> }}
      />
      <Tab.Screen
        name="Availability"
        component={AvailabilityScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon label="זמינות" emoji="🟢" focused={focused} /> }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon label="פרופיל" emoji="👤" focused={focused} /> }}
      />
    </Tab.Navigator>
  );
}
