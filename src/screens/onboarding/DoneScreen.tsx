import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { OnboardingStackParamList } from '../../navigation/OnboardingNavigator';
import { Button, ScreenShell } from '../../components';
import { colors, spacing, typography, radius } from '../../theme';

type Props = {
  navigation: NativeStackNavigationProp<OnboardingStackParamList, 'Done'>;
};

export default function DoneScreen({ navigation }: Props) {
  const scale = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 60, friction: 7 }),
      Animated.timing(fade, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <ScreenShell>
      <View style={styles.center}>
        <Animated.View style={[styles.checkWrap, { transform: [{ scale }] }]}>
          <Text style={styles.checkMark}>✓</Text>
        </Animated.View>

        <Animated.View style={{ opacity: fade }}>
          <Text style={styles.title}>ברוך הבא לחניון!</Text>
          <Text style={styles.sub}>
            הפרופיל שלך נוצר בהצלחה.{'\n'}
            עכשיו תוכל לשתף ולבקש חניות מהשכנים.
          </Text>

          <View style={styles.tips}>
            {[
              { emoji: '🅿️', text: 'לחץ על "הצע חניה" כשאתה יוצא לנסיעה' },
              { emoji: '🔔', text: 'תקבל התראה כשמישהו מציע חניה' },
              { emoji: '💬', text: 'תאם פרטים דרך הצ\'אט הפנימי' },
            ].map(({ emoji, text }) => (
              <View key={text} style={styles.tip}>
                <Text style={styles.tipEmoji}>{emoji}</Text>
                <Text style={styles.tipText}>{text}</Text>
              </View>
            ))}
          </View>
        </Animated.View>
      </View>

      <Animated.View style={{ opacity: fade }}>
        <Button
          label="כניסה לאפליקציה 🚀"
          onPress={() => {
            // TODO: navigate to MainNavigator
            // navigation.replace('Main')
          }}
        />
      </Animated.View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  checkWrap: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  checkMark: { fontSize: 52, color: colors.bg, fontWeight: '900', lineHeight: 60 },

  title: {
    ...typography.title,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  sub: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: spacing.xl,
  },

  tips: { gap: spacing.sm, width: '100%' },
  tip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.bgCard,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tipEmoji: { fontSize: 20 },
  tipText: { ...typography.body, color: colors.textSecondary, flex: 1, textAlign: 'right' },
});
