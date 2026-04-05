import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Alert } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { OnboardingStackParamList } from '../../navigation/OnboardingNavigator';
import { Button, ScreenShell } from '../../components';
import { colors, spacing, typography } from '../../theme';
import { signInWithGoogle } from '../../config/firebase';

type Props = {
  navigation: NativeStackNavigationProp<OnboardingStackParamList, 'Welcome'>;
};

export default function WelcomeScreen({ navigation }: Props) {
  const fade = useRef(new Animated.Value(0)).current;
  const slideUp = useRef(new Animated.Value(30)).current;
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(slideUp, { toValue: 0, duration: 700, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
      // Google sign-in succeeded — phone number is still required
      navigation.navigate('Phone', { afterGoogle: true });
    } catch (e: any) {
      if (e?.code !== 'SIGN_IN_CANCELLED') {
        Alert.alert('שגיאה', e?.message || 'כניסה עם Google נכשלה, נסה שוב');
      }
    } finally {
      setGoogleLoading(false);
    }
  };

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
        <Text style={styles.hero}>חניון{'\n'}החנייה שלנו</Text>
        <Text style={styles.sub}>
          ניהול חניות משותף לשכנים —{'\n'}ללא קבוצות וואטסאפ, בלחיצה אחת.
        </Text>

        {/* Features */}
        <View style={styles.features}>
          {[
            { icon: '🅿️', text: 'הצע את החניה שלך לשכנים' },
            { icon: '🔔', text: 'קבל התראה כשיש חניה פנויה' },
            { icon: '💬', text: 'תאם ישירות עם הבעלים' },
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
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>או</Text>
          <View style={styles.dividerLine} />
        </View>
        <Button
          label="המשך עם Google"
          onPress={handleGoogleSignIn}
          loading={googleLoading}
          variant="ghost"
        />
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

  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.md,
    gap: spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  legal: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.md,
    lineHeight: 18,
  },
});
