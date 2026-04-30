import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { OnboardingStackParamList } from '../../navigation/OnboardingNavigator';
import { Button, Input, ScreenShell, StepIndicator } from '../../components';
import { colors, spacing, radius, typography } from '../../theme';
import { towerLabel } from '../../utils/towerLabel';

type Props = {
  navigation: NativeStackNavigationProp<OnboardingStackParamList, 'Profile'>;
};

type Tower = '1' | '2' | null;

export default function ProfileScreen({ navigation }: Props) {
  const [name, setName] = useState('');
  const [tower, setTower] = useState<Tower>(null);
  const [apartment, setApartment] = useState('');

  const isValid = name.trim().length > 1 && tower !== null && apartment.trim().length > 0;

  const handleNext = () => {
    if (!isValid) return;
    navigation.navigate('CarNumber', { name: name.trim(), tower: tower!, apartment: apartment.trim() });
  };

  return (
    <ScreenShell>
      <StepIndicator total={4} current={2} />

      <Text style={styles.title}>ספר לנו עליך</Text>
      <Text style={styles.sub}>פרטים אלה יופיעו בפרופיל שלך</Text>

      <View style={styles.form}>
        <Input
          label="שם מלא"
          value={name}
          onChangeText={setName}
          placeholder="ישראל ישראלי"
          textAlign="right"
          autoCapitalize="words"
        />

        {/* Tower Selector */}
        <Text style={styles.sectionLabel}>מגדל</Text>
        <View style={styles.toggleRow}>
          {(['1', '2'] as const).map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.toggleBtn, tower === t && styles.toggleBtnActive]}
              onPress={() => setTower(t)}
              activeOpacity={0.7}
            >
              <Text style={[styles.toggleText, tower === t && styles.toggleTextActive]}>
                {towerLabel(t)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Input
          label="מספר דירה"
          value={apartment}
          onChangeText={setApartment}
          placeholder="לדוגמה: 45"
          keyboardType="numeric"
          textAlign="right"
        />
      </View>

      <Button label="המשך" onPress={handleNext} disabled={!isValid} />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.title, color: colors.textPrimary, textAlign: 'right', marginBottom: spacing.sm },
  sub: { ...typography.body, color: colors.textSecondary, textAlign: 'right', marginBottom: spacing.xl },
  form: { flex: 1, gap: spacing.xs },

  sectionLabel: {
    ...typography.label,
    color: colors.textSecondary,
    textAlign: 'right',
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  toggleRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  toggleBtn: {
    flex: 1,
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgInput,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleBtnActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentDim,
  },
  toggleText: { ...typography.body, color: colors.textSecondary },
  toggleTextActive: { color: colors.accent, fontWeight: '700' },
});
