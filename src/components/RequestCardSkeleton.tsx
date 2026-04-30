import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import { colors, spacing, radius } from '../theme';

/**
 * Pulsing placeholder shaped like a RequestCard. Replaces the bare
 * ActivityIndicator while the Firestore listener is hydrating, so the
 * layout doesn't shift on data arrival and the wait feels intentional.
 */
export function RequestCardSkeleton() {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.4, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <View style={s.card}>
      <View style={s.row}>
        <Animated.View style={[s.title, { opacity }]} />
        <Animated.View style={[s.badge, { opacity }]} />
      </View>
      <Animated.View style={[s.line, { opacity, width: '70%' }]} />
      <Animated.View style={[s.line, { opacity, width: '50%' }]} />
      <Animated.View style={[s.button, { opacity }]} />
    </View>
  );
}

export function RequestListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <View>
      {Array.from({ length: count }).map((_, i) => (
        <RequestCardSkeleton key={i} />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  row: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  title: { width: '55%', height: 18, borderRadius: 4, backgroundColor: colors.border },
  badge: { width: 64, height: 22, borderRadius: 11, backgroundColor: colors.border },
  line: { height: 12, borderRadius: 4, backgroundColor: colors.border, marginTop: spacing.xs },
  button: { height: 36, borderRadius: radius.md, backgroundColor: colors.border, marginTop: spacing.sm },
});
