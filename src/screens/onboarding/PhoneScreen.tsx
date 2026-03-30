import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { OnboardingStackParamList } from '../../navigation/OnboardingNavigator';
import { Button, Input, ScreenShell, StepIndicator } from '../../components';
import { colors, spacing, typography } from '../../theme';
import { sendOTP } from '../../config/firebase';

type Props = {
  navigation: NativeStackNavigationProp<OnboardingStackParamList, 'Phone'>;
};

export default function PhoneScreen({ navigation }: Props) {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isValid = /^05\d{8}$/.test(phone);

  const handleSend = async () => {
    if (!isValid) {
      setError('הכנס מספר טלפון ישראלי תקין (05XXXXXXXX)');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const fullPhone = `+972${phone.slice(1)}`; // 05X → +9725X
      await sendOTP(fullPhone);
      navigation.navigate('OTP', { phone: fullPhone });
    } catch (e) {
      Alert.alert('שגיאה', 'לא ניתן לשלוח קוד, נסה שוב');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenShell>
      <StepIndicator total={4} current={0} />

      <Text style={styles.title}>מה המספר שלך?</Text>
      <Text style={styles.sub}>נשלח לך קוד אימות ב-SMS</Text>

      <View style={styles.form}>
        <Input
          label="מספר טלפון"
          value={phone}
          onChangeText={(t) => { setPhone(t); setError(''); }}
          placeholder="05XXXXXXXX"
          keyboardType="phone-pad"
          maxLength={10}
          error={error}
          textAlign="right"
        />
      </View>

      <View style={styles.bottom}>
        <Button
          label="שלח קוד אימות"
          onPress={handleSend}
          loading={loading}
          disabled={!isValid}
        />
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
          <Text style={styles.backText}>← חזור</Text>
        </TouchableOpacity>
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.title, color: colors.textPrimary, textAlign: 'right', marginBottom: spacing.sm },
  sub: { ...typography.body, color: colors.textSecondary, textAlign: 'right', marginBottom: spacing.xl },
  form: { flex: 1 },
  bottom: { gap: spacing.sm },
  back: { alignItems: 'center', paddingVertical: spacing.sm },
  backText: { ...typography.body, color: colors.textSecondary },
});
