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
  Alert
} from 'react-native';
import { sendOTP } from '../../config/firebase';

// הגדרת צבעים מקומית למניעת שגיאות undefined
const THEME_COLORS = {
  background: '#0A0A0F',
  primary: '#F5A623',
  text: '#FFFFFF',
  textSecondary: '#8E8E93',
  inputBackground: '#1C1C1E'
};

export default function PhoneScreen({ navigation }: any) {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(false);

  // Convert local Israeli number (05XXXXXXXX) to international format (+9725XXXXXXXX)
  const toInternational = (local: string): string => {
    const digits = local.replace(/\D/g, '');
    if (digits.startsWith('0')) {
      return `+972${digits.slice(1)}`;
    }
    if (digits.startsWith('972')) {
      return `+${digits}`;
    }
    return `+972${digits}`;
  };

  const isValidPhone = /^05\d{8}$/.test(phoneNumber.replace(/\D/g, ''));

  const handleSendCode = async () => {
    if (!phoneNumber) return;

    if (!isValidPhone) {
      Alert.alert('שגיאה', 'הכנס מספר טלפון ישראלי תקין (05XXXXXXXX)');
      return;
    }

    setLoading(true);
    try {
      const fullPhone = toInternational(phoneNumber);
      await sendOTP(fullPhone);
      navigation.navigate('OTP', { phone: fullPhone });
    } catch (error: any) {
      console.error('Send OTP error:', error);
      Alert.alert('שגיאה', error?.message || 'לא ניתן לשלוח קוד, נסה שוב');
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
          placeholderTextColor="#666"
          keyboardType="phone-pad"
          value={phoneNumber}
          onChangeText={setPhoneNumber}
          maxLength={10}
        />

        <TouchableOpacity
          style={[styles.button, !isValidPhone && styles.buttonDisabled]}
          onPress={handleSendCode}
          disabled={loading || !isValidPhone}
        >
          {loading ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.buttonText}>שלח קוד</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME_COLORS.background,
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
    color: THEME_COLORS.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: THEME_COLORS.textSecondary,
    marginBottom: 32,
    textAlign: 'center',
  },
  input: {
    width: '100%',
    height: 56,
    backgroundColor: THEME_COLORS.inputBackground,
    borderRadius: 12,
    paddingHorizontal: 16,
    color: THEME_COLORS.text,
    fontSize: 18,
    marginBottom: 24,
    textAlign: 'right',
  },
  button: {
    width: '100%',
    height: 56,
    backgroundColor: THEME_COLORS.primary,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
  },
});
