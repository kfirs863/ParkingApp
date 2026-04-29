import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Platform } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { OnboardingStackParamList } from '../../navigation/OnboardingNavigator';
import { Button, ScreenShell } from '../../components';
import { colors, spacing, typography } from '../../theme';

type Props = {
  navigation: NativeStackNavigationProp<OnboardingStackParamList, 'Welcome'>;
};

export default function WelcomeScreen({ navigation }: Props) {
  // On web the Animated native driver isn't available and the JS fallback
  // leaves opacity stuck at 0, hiding the entire screen. Start at the final
  // values on web so content is visible without relying on Animated.
  const isWeb = Platform.OS === 'web';
  const fade = useRef(new Animated.Value(isWeb ? 1 : 0)).current;
  const slideUp = useRef(new Animated.Value(isWeb ? 0 : 30)).current;
  useEffect(() => {
    if (isWeb) return;
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(slideUp, { toValue: 0, duration: 700, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <ScreenShell>
      <Animated.View style={[styles.content, { opacity: fade, transform: [{ translateY: slideUp }] }]}>
        {/* Logo Mark */}
        <View style={styles.logoWrap}>
          <View style={styles.logoOuter}>
            <View style={styles.logoInner}>
              <Text style={styles.logoP}>P</Text>
            </View>
          </View>
        </View>

        {/* Headline */}
        <Text style={styles.hero}>Upper House{'\n'}Parking</Text>
        <Text style={styles.sub}>
          ניהול חניות משותף לשכנים —{'\n'}ללא קבוצות וואטסאפ, בלחיצה אחת.
        </Text>

        {/* Features */}
        <View style={styles.features}>
          {[
            { icon: '🙋', text: 'בקש חניה כשאתה צריך מקום' },
            { icon: '🅿️', text: 'יש לך חניה? אשר בקשות של שכנים' },
            { icon: '🔔', text: 'קבל התראה כשהבקשה שלך אושרה' },
          ].map(({ icon, text }) => (
            <View key={text} style={styles.featureRow}>
              <Text style={styles.featureIcon}>{icon}</Text>
              <Text style={styles.featureText}>{text}</Text>
            </View>
          ))}
        </View>
      </Animated.View>

      {/* CTA */}
      <Animated.View style={{ opacity: fade }}>
        <Button label="הירשם עם מספר טלפון" onPress={() => navigation.navigate('Phone')} />
        <Text style={styles.legal}>
          בלחיצה על "הירשם" אתה מסכים לתנאי השימוש ומדיניות הפרטיות
        </Text>
      </Animated.View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, justifyContent: 'center' },

  logoWrap: { marginBottom: spacing.xl, alignItems: 'flex-start' },
  logoOuter: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoInner: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoP: { fontSize: 32, fontWeight: '900', color: colors.accent },

  hero: {
    ...typography.hero,
    color: colors.textPrimary,
    marginBottom: spacing.md,
    writingDirection: 'rtl',
  },
  sub: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
    lineHeight: 24,
    textAlign: 'right',
  },

  features: { gap: spacing.md },
  featureRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.bgCard,
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  featureIcon: { fontSize: 22 },
  featureText: { ...typography.body, color: colors.textPrimary, flex: 1, textAlign: 'right' },

  legal: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.md,
    lineHeight: 18,
  },
});
