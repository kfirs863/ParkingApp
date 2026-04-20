import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
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

const toLatinDigit = (str: string): string =>
  str
    .replace(/[\u0660-\u0669]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (c) => String(c.charCodeAt(0) - 0x06F0));

export default function OTPScreen({ navigation, route }: Props) {
  const { phone } = route.params;
  // Single string — the hidden TextInput is the source of truth
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [countdown, setCountdown] = useState(30);
  const [error, setError] = useState('');
  const inputRef = useRef<TextInput | null>(null);

  // Countdown for resend
  useEffect(() => {
    if (countdown === 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const handleChange = (text: string) => {
    const digits = toLatinDigit(text).replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(digits);
  };

  const isComplete = code.length === CODE_LENGTH;

  const handleVerify = async () => {
    setError('');
    setLoading(true);
    try {
      await verifyOTP(code);
      navigation.navigate('Profile');
    } catch (e: any) {
      console.error('verifyOTP error:', e?.code, e?.message, e);
      if (e?.message?.includes('No verification in progress')) {
        setError('האימות פג תוקף — לחץ "שלח קוד חדש" ונסה שנית');
      } else {
        setError('הקוד שהזנת אינו תקין, נסה שוב');
      }
      setCode('');
      inputRef.current?.focus();
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

      {/* Visual boxes — tapping them focuses the hidden input */}
      <TouchableOpacity
        activeOpacity={1}
        onPress={() => inputRef.current?.focus()}
        style={styles.codeRow}
      >
        {Array(CODE_LENGTH).fill(null).map((_, i) => {
          const digit = code[i] ?? '';
          const isFocused = code.length === i;
          return (
            <View
              key={i}
              style={[
                styles.codeBox,
                digit ? styles.codeBoxFilled : null,
                isFocused ? styles.codeBoxFocused : null,
              ]}
            >
              <Text style={styles.codeDigit}>{digit}</Text>
            </View>
          );
        })}
      </TouchableOpacity>

      {/* Hidden real input — handles keyboard + SMS AutoFill */}
      <TextInput
        ref={inputRef}
        style={styles.hiddenInput}
        value={code}
        onChangeText={handleChange}
        keyboardType="number-pad"
        maxLength={CODE_LENGTH}
        autoFocus
        // Android SMS AutoFill
        autoComplete="sms-otp"
        // iOS SMS AutoFill
        textContentType="oneTimeCode"
      />

      {!!error && <Text style={styles.errorText}>{error}</Text>}

      {/* Resend */}
      <TouchableOpacity
        disabled={countdown > 0 || sending}
        onPress={async () => {
          if (sending) return;
          setSending(true);
          try {
            await sendOTP(phone);
            setCountdown(30);
            setError('');
          } catch (e: any) {
            setError(e?.message || 'לא ניתן לשלוח קוד חדש, נסה שוב');
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeBoxFilled: {
    borderColor: colors.accent,
    backgroundColor: colors.accentDim,
  },
  codeBoxFocused: {
    borderColor: colors.accent,
    borderWidth: 2,
  },
  codeDigit: {
    ...typography.title,
    color: colors.textPrimary,
    // Force LTR so digit renders correctly on RTL (Hebrew) devices
    writingDirection: 'ltr',
  },

  // Visually hidden — positioned off-screen so it can still receive input and AutoFill
  hiddenInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },

  errorText: {
    color: '#FF6B6B',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  resendWrap: { alignItems: 'center', marginBottom: spacing.xl },
  resend: { ...typography.body, color: colors.accent },
  resendDisabled: { color: colors.textMuted },

  bottom: { gap: spacing.sm },
  back: { alignItems: 'center', paddingVertical: spacing.sm },
  backText: { ...typography.body, color: colors.textSecondary },
});
