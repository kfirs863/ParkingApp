import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useNavigation, useNavigationState } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, radius, typography } from '../theme';
import { useActiveParking } from '../hooks/useParking';
import { haptics } from '../utils/haptics';

/**
 * Floating "active parking" pill shown above the bottom tab bar on every
 * tab EXCEPT Home (where the full ActiveParkingCard is already rendered
 * inline). Tapping the pill jumps to Home and opens the session sheet via
 * the existing `openActive: true` route param.
 */
export function ActiveSessionPill() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  // Detect the current tab name by walking the navigation state.
  const currentTab = useNavigationState((state) => {
    if (!state) return undefined;
    const route = state.routes[state.index];
    return route?.name;
  });

  const { session } = useActiveParking(true);
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    if (!session) return;
    const tick = () => {
      const ms = session.toTime.getTime() - Date.now();
      if (ms <= 0) return setTimeLeft('הסתיים');
      const mins = Math.floor(ms / 60_000);
      if (mins < 60) return setTimeLeft(`${mins} דק'`);
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      setTimeLeft(m > 0 ? `${h}:${String(m).padStart(2, '0')}` : `${h} ש'`);
    };
    tick();
    const id = setInterval(tick, 30_000); // 30s is plenty for "minutes left"
    return () => clearInterval(id);
  }, [session]);

  if (!session) return null;
  if (currentTab === 'Home') return null; // already shown inline there

  // Bottom-tabs default height is ~56 + safe-area inset.
  const bottom = (insets.bottom ?? 0) + 56 + spacing.sm;

  return (
    <View pointerEvents="box-none" style={[s.layer, { bottom }]}>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => {
          haptics.tap();
          navigation.navigate('Home', { openActive: true });
        }}
        style={s.pill}
      >
        <View style={s.dot} />
        <Text style={s.text} numberOfLines={1}>
          חניה פעילה · {session.spotNumber ?? ''} · {timeLeft}
        </Text>
        <Text style={s.cta}>פרטים ›</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  // Position on top of the navigator without intercepting tab-bar taps.
  layer: {
    position: 'absolute', start: 0, end: 0, alignItems: 'center',
    paddingHorizontal: spacing.md,
    // Tiny shadow on iOS / elevation on Android so the pill floats.
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.25, shadowOffset: { width: 0, height: 4 }, shadowRadius: 8 },
      android: { elevation: 6 },
      default: {},
    }),
  },
  pill: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.bgCard, borderColor: colors.accent + '60',
    borderWidth: 1, borderRadius: radius.full,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    minWidth: 220, maxWidth: 360,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  text: { ...typography.caption, color: colors.textPrimary, flex: 1, textAlign: 'right' },
  cta: { ...typography.caption, color: colors.accent, fontWeight: '700' },
});
