import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { sendOTP } from '../../config/firebase';
import { colors } from '../../theme';

export default function PhoneScreen({ navigation }: any) {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const toInternational = (local: string): string => {
    const digits = local.replace(/\D/g, '');
    if (digits.startsWith('0')) return `+972${digits.slice(1)}`;
    if (digits.startsWith('972')) return `+${digits}`;
    return `+972${digits}`;
  };

  const isValidPhone = /^05\d{8}$/.test(phoneNumber.replace(/\D/g, ''));

  const handleSendCode = async () => {
    if (!isValidPhone) {
      setError('הכנס מספר טלפון ישראלי תקין (05XXXXXXXX)');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const fullPhone = toInternational(phoneNumber);
      await sendOTP(fullPhone);
      navigation.navigate('OTP', { phone: fullPhone });
    } catch (err: any) {
      console.error('Send OTP error:', err);
      const msg: string = err?.message ?? '';
      if (msg.includes('unauthorized-domain') || msg.includes('auth/unauthorized-domain')) {
        setError('הדומיין לא מורשה — יש להוסיף אותו ב-Firebase Auth Authorized Domains');
      } else if (msg.includes('too-many-requests')) {
        setError('יותר מדי ניסיונות, נסה שוב מאוחר יותר');
      } else {
        setError(msg || 'לא ניתן לשלוח קוד, נסה שוב');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.content}>
        <Text style={styles.title}>מה המספר שלך?</Text>
        <Text style={styles.subtitle}>נשלח לך קוד אימות ב-SMS</Text>

        <TextInput
          style={styles.input}
          placeholder="05XXXXXXXX"
          placeholderTextColor={colors.textMuted}
          keyboardType="phone-pad"
          value={phoneNumber}
          onChangeText={setPhoneNumber}
          maxLength={10}
        />

        {!!error && <Text style={styles.errorText}>{error}</Text>}

        <TouchableOpacity
          style={[styles.button, !isValidPhone && styles.buttonDisabled]}
          onPress={handleSendCode}
          disabled={loading || !isValidPhone}
        >
          {loading
            ? <ActivityIndicator color={colors.bg} />
            : <Text style={styles.buttonText}>שלח קוד</Text>
          }
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    marginBottom: 32,
    textAlign: 'center',
  },
  input: {
    width: '100%',
    height: 56,
    backgroundColor: colors.bgInput,
    borderRadius: 12,
    paddingHorizontal: 16,
    color: colors.textPrimary,
    fontSize: 18,
    marginBottom: 24,
    textAlign: 'right',
  },
  button: {
    width: '100%',
    height: 56,
    backgroundColor: colors.accent,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 12,
  },
  buttonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.bg,
  },
});
