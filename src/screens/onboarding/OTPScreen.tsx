import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, Alert
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { OnboardingStackParamList } from '../../navigation/OnboardingNavigator';
import { Button, ScreenShell, StepIndicator } from '../../components';
import { colors, spacing, radius, typography } from '../../theme';
import { sendOTP, verifyOTP } from '../../config/firebase';

type Props = {
  navigation: NativeStackNavigationProp<OnboardingStackParamList, 'OTP'>;
  route: RouteProp<OnboardingStackParamList, 'OTP'>;
};

const CODE_LENGTH = 6;

export default function OTPScreen({ navigation, route }: Props) {
  const { phone } = route.params;
  const [code, setCode] = useState(Array(CODE_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [countdown, setCountdown] = useState(30);
  const inputRefs = useRef<(TextInput | null)[]>([]);

  // Countdown for resend
  useEffect(() => {
    if (countdown === 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const toLatinDigit = (str: string): string =>
    // Normalize Arabic-Indic (٠-٩) and Extended Arabic-Indic (۰-۹) to ASCII 0-9
    str
      .replace(/[\u0660-\u0669]/g, (c) => String(c.charCodeAt(0) - 0x0660))
      .replace(/[\u06F0-\u06F9]/g, (c) => String(c.charCodeAt(0) - 0x06F0));

  const handleDigit = (text: string, index: number) => {
    const digits = toLatinDigit(text).replace(/\D/g, '');
    if (digits.length > 1) {
      // Autofill paste — distribute digits across all boxes
      const next = Array(CODE_LENGTH).fill('');
      digits.slice(0, CODE_LENGTH).split('').forEach((d, i) => { next[i] = d; });
      setCode(next);
      inputRefs.current[Math.min(digits.length, CODE_LENGTH) - 1]?.focus();
      return;
    }
    const digit = digits;
    const next = [...code];
    next[index] = digit;
    setCode(next);
    if (digit && index < CODE_LENGTH - 1) inputRefs.current[index + 1]?.focus();
  };

  const handleBackspace = (key: string, index: number) => {
    if (key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const fullCode = code.join('');
  const isComplete = code.every((d) => d.length === 1);

  const handleVerify = async () => {
    setLoading(true);
    try {
      await verifyOTP(fullCode);
      navigation.navigate('Profile');
    } catch (e: any) {
      console.error('verifyOTP error:', e?.code, e?.message, e);
      if (e?.message?.includes('No verification in progress')) {
        Alert.alert(
          'תם תוקף האימות',
          'האימות פג תוקף — ייתכן שהאפליקציה נסגרה. לחץ "שלח קוד חדש" ונסה שנית.',
        );
      } else {
        Alert.alert('קוד שגוי', 'הקוד שהזנת אינו תקין, נסה שוב');
      }
      setCode(Array(CODE_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const displayPhone = phone.replace('+972', '0');

  return (
    <ScreenShell>
      <StepIndicator total={4} current={1} />

      <Text style={styles.title}>הכנס קוד אימות</Text>
      <Text style={styles.sub}>
        שלחנו קוד בן 6 ספרות למספר{'\n'}
        <Text style={styles.phone}>{displayPhone}</Text>
      </Text>

      {/* OTP Boxes */}
      <View style={styles.codeRow}>
        {Array(CODE_LENGTH).fill(null).map((_, i) => (
          <TextInput
            key={i}
            ref={(r) => { inputRefs.current[i] = r; }}
            style={[styles.codeBox, code[i] ? styles.codeBoxFilled : null]}
            value={code[i]}
            onChangeText={(t) => handleDigit(t, i)}
            onKeyPress={({ nativeEvent }) => handleBackspace(nativeEvent.key, i)}
            keyboardType="number-pad"
            maxLength={6}
            textAlign="center"
            // iOS: triggers SMS AutoFill on all boxes
            textContentType="oneTimeCode"
            // Android: triggers SMS AutoFill on the first box
            autoComplete={i === 0 ? 'sms-otp' : 'off'}
          />
        ))}
      </View>

      {/* Resend */}
      <TouchableOpacity
        disabled={countdown > 0 || sending}
        onPress={async () => {
          if (sending) return;
          setSending(true);
          try {
            await sendOTP(phone);
            setCountdown(30);
          } catch {
            Alert.alert('שגיאה', 'לא ניתן לשלוח קוד חדש, נסה שוב');
          } finally {
            setSending(false);
          }
        }}
        style={styles.resendWrap}
      >
        <Text style={[styles.resend, (countdown > 0 || sending) && styles.resendDisabled]}>
          {sending ? 'שולח...' : countdown > 0 ? `שלח שוב בעוד ${countdown} שניות` : 'שלח קוד חדש'}
        </Text>
      </TouchableOpacity>

      <View style={styles.bottom}>
        <Button label="אמת קוד" onPress={handleVerify} loading={loading} disabled={!isComplete} />
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
          <Text style={styles.backText}>← שנה מספר</Text>
        </TouchableOpacity>
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.title, color: colors.textPrimary, textAlign: 'right', marginBottom: spacing.sm },
  sub: { ...typography.body, color: colors.textSecondary, textAlign: 'right', marginBottom: spacing.xl, lineHeight: 24 },
  phone: { color: colors.accent, fontWeight: '700' },

  codeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  codeBox: {
    width: 48,
    height: 60,
    backgroundColor: colors.bgInput,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...typography.title,
    color: colors.textPrimary,
    // Force LTR rendering so digit displays correctly on RTL (Hebrew) devices
    writingDirection: 'ltr',
  },
  codeBoxFilled: {
    borderColor: colors.accent,
    backgroundColor: colors.accentDim,
  },

  resendWrap: { alignItems: 'center', marginBottom: spacing.xl },
  resend: { ...typography.body, color: colors.accent },
  resendDisabled: { color: colors.textMuted },

  bottom: { gap: spacing.sm },
  back: { alignItems: 'center', paddingVertical: spacing.sm },
  backText: { ...typography.body, color: colors.textSecondary },
});
