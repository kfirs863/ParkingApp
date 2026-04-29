import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Platform } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { OnboardingStackParamList } from '../../navigation/OnboardingNavigator';
import { Button, ScreenShell } from '../../components';
import { colors, spacing, typography, radius } from '../../theme';
import { auth, db } from '../../config/firebase';
import { doc, getDoc } from 'firebase/firestore';

type Props = {
  navigation: NativeStackNavigationProp<OnboardingStackParamList, 'Done'>;
};

export default function DoneScreen({ navigation }: Props) {
  // See WelcomeScreen: Animated's native driver isn't supported on web and
  // the JS fallback leaves values stuck at 0, so skip the entry animation.
  const isWeb = Platform.OS === 'web';
  const scale = useRef(new Animated.Value(isWeb ? 1 : 0)).current;
  const fade = useRef(new Animated.Value(isWeb ? 1 : 0)).current;

  useEffect(() => {
    if (isWeb) return;
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
              { emoji: '🙋', text: 'לחץ על "בקש חניה" כשאתה צריך מקום' },
              { emoji: '🔔', text: 'תקבל התראה כשמישהו מאשר את הבקשה שלך' },
              { emoji: '🅿️', text: 'יש לך חניה? תוכל לאשר בקשות של שכנים' },
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
          onPress={async () => {
            // App.tsx switches to the main stack from an onSnapshot listener
            // on users/{uid}. If that fires reliably the user never sees this
            // button. If the listener has stalled (transient connectivity),
            // a manual getDoc nudges Firestore's local cache and re-emits.
            const uid = auth.currentUser?.uid;
            if (!uid) return;
            try { await getDoc(doc(db, 'users', uid)); } catch {}
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
