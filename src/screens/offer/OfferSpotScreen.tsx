import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Alert, Platform,
} from 'react-native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { MainTabParamList } from '../../navigation/MainNavigator';
import { Button, Input, ScreenShell } from '../../components';
import { colors, spacing, radius, typography } from '../../theme';
import { createOffer } from '../../hooks/useParking';
import { useUserProfile } from '../../config/firebase';

type Props = {
  navigation: BottomTabNavigationProp<MainTabParamList, 'Availability'>;
};

// ─── Quick presets ────────────────────────────────────────
function makePresets() {
  const now = new Date();
  const h = now.getHours();
  const snap = (d: Date) => {
    d.setSeconds(0, 0);
    return d;
  };
  const add = (mins: number) => snap(new Date(now.getTime() + mins * 60000));

  return [
    { label: '1 שעה', from: add(0), to: add(60) },
    { label: '2 שעות', from: add(0), to: add(120) },
    { label: '3 שעות', from: add(0), to: add(180) },
    { label: 'חצי יום', from: add(0), to: add(h < 12 ? (12 - h) * 60 : (22 - h) * 60) },
    { label: 'כל הלילה', from: snap(new Date(now.setHours(22, 0))), to: snap(new Date(now.setHours(8, 0) + 86400000)) },
  ];
}

// ─── Time Picker Row ──────────────────────────────────────
function TimePicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Date;
  onChange: (d: Date) => void;
}) {
  const adjust = (deltaMin: number) => {
    const d = new Date(value.getTime() + deltaMin * 60000);
    onChange(d);
  };

  const fmt = (d: Date) =>
    d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });

  return (
    <View style={tp.row}>
      <Text style={tp.label}>{label}</Text>
      <View style={tp.controls}>
        <TouchableOpacity style={tp.arrow} onPress={() => adjust(-30)} activeOpacity={0.7}>
          <Text style={tp.arrowTxt}>−</Text>
        </TouchableOpacity>
        <Text style={tp.time}>{fmt(value)}</Text>
        <TouchableOpacity style={tp.arrow} onPress={() => adjust(30)} activeOpacity={0.7}>
          <Text style={tp.arrowTxt}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const tp = StyleSheet.create({
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bgInput,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  label: { ...typography.body, color: colors.textSecondary },
  controls: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  arrow: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowTxt: { fontSize: 22, color: colors.textPrimary, fontWeight: '300', lineHeight: 26 },
  time: { ...typography.subtitle, color: colors.accent, minWidth: 60, textAlign: 'center' },
});

// ─── OfferSpotScreen ──────────────────────────────────────
export default function OfferSpotScreen({ navigation }: Props) {
  const { profile } = useUserProfile();

  const snap30 = () => {
    const d = new Date();
    d.setSeconds(0, 0);
    const rem = d.getMinutes() % 30;
    if (rem !== 0) d.setMinutes(d.getMinutes() + (30 - rem));
    return d;
  };

  const [spotNumber, setSpotNumber] = useState(''); // pre-filled from user profile in real app
  const [fromTime, setFromTime] = useState<Date>(snap30());
  const [toTime, setToTime] = useState<Date>(new Date(snap30().getTime() + 2 * 3600000));
  const [loading, setLoading] = useState(false);
  const [spotError, setSpotError] = useState('');

  const presets = makePresets();

  const applyPreset = (from: Date, to: Date) => {
    setFromTime(from);
    setToTime(to);
  };

  const durationMins = Math.round((toTime.getTime() - fromTime.getTime()) / 60000);
  const durationLabel =
    durationMins <= 0
      ? '⚠️ שעת סיום חייבת להיות אחרי שעת התחלה'
      : durationMins < 60
      ? `${durationMins} דקות`
      : `${(durationMins / 60).toFixed(1).replace('.0', '')} שעות`;

  const isValid = !!profile && (profile.ownedSpot || spotNumber.trim().length > 0) && durationMins > 0;

  const handleSubmit = async () => {
    if (!spotNumber.trim()) {
      setSpotError('הכנס מספר חניה');
      return;
    }
    if (durationMins <= 0) {
      Alert.alert('שגיאה', 'שעת הסיום חייבת להיות אחרי שעת ההתחלה');
      return;
    }

    setLoading(true);
    try {
      await createOffer({
        spotNumber: profile?.ownedSpot ?? spotNumber.trim(),
        fromTime,
        toTime,
        ownerProfile: {
          name: profile!.name,
          apartment: profile!.apartment,
          tower: profile!.tower,
        },
      });

      Alert.alert(
        '✅ החניה פורסמה!',
        `חניה ${spotNumber.trim()} זמינה עכשיו עבור השכנים.\nתקבל/י התראה כשמישהו יבקש אותה.`,
        [{ text: 'מעולה', onPress: () => navigation.navigate('Home') }]
      );
    } catch {
      Alert.alert('שגיאה', 'לא ניתן לפרסם את החניה, נסה שוב');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>הצע חניה</Text>
        <Text style={styles.headerSub}>פרסם את החניה הפנויה שלך לשכנים</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* Spot Number */}
        <Text style={styles.sectionLabel}>מספר חניה</Text>
        <Input
          value={spotNumber}
          onChangeText={(t) => { setSpotNumber(t); setSpotError(''); }}
          placeholder="לדוגמה: 42"
          keyboardType="numeric"
          error={spotError}
          textAlign="right"
        />

        {/* Quick Presets */}
        <Text style={styles.sectionLabel}>משך זמן מהיר</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presetsScroll}>
          <View style={styles.presets}>
            {presets.map((p) => (
              <TouchableOpacity
                key={p.label}
                style={styles.preset}
                onPress={() => applyPreset(p.from, p.to)}
                activeOpacity={0.8}
              >
                <Text style={styles.presetText}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {/* Time Pickers */}
        <Text style={styles.sectionLabel}>שעות</Text>
        <TimePicker label="מ-" value={fromTime} onChange={setFromTime} />
        <TimePicker label="עד" value={toTime} onChange={setToTime} />

        {/* Duration Summary */}
        <View style={[styles.summary, durationMins <= 0 && styles.summaryWarn]}>
          <Text style={styles.summaryEmoji}>{durationMins > 0 ? '⏱️' : '⚠️'}</Text>
          <Text style={[styles.summaryText, durationMins <= 0 && styles.summaryTextWarn]}>
            {durationLabel}
          </Text>
        </View>

        {/* Preview Card */}
        {isValid && (
          <View style={styles.preview}>
            <Text style={styles.previewLabel}>תצוגה מקדימה</Text>
            <View style={styles.previewCard}>
              <View style={styles.previewBadge}>
                <Text style={styles.previewBadgeSm}>חניה</Text>
                <Text style={styles.previewBadgeNum}>{spotNumber}</Text>
              </View>
              <View style={styles.previewInfo}>
                <Text style={styles.previewName}>החניה שלך</Text>
                <Text style={styles.previewTime}>
                  {fromTime.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                  {' – '}
                  {toTime.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                  {' · '}
                  {durationLabel}
                </Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* CTA */}
      <View style={styles.cta}>
        <Button
          label="פרסם חניה פנויה 🅿️"
          onPress={handleSubmit}
          loading={loading}
          disabled={!isValid}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },

  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: 60,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  headerTitle: { ...typography.title, color: colors.textPrimary, textAlign: 'right' },
  headerSub: { ...typography.body, color: colors.textSecondary, textAlign: 'right', marginTop: 4 },

  scroll: { padding: spacing.lg, paddingBottom: 120 },

  sectionLabel: {
    ...typography.label,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    textAlign: 'right',
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },

  presetsScroll: { marginBottom: spacing.md },
  presets: { flexDirection: 'row', gap: spacing.sm },
  preset: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  presetText: { ...typography.body, color: colors.textPrimary },

  summary: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.accentDim,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent + '40',
    marginBottom: spacing.lg,
  },
  summaryWarn: {
    backgroundColor: colors.error + '15',
    borderColor: colors.error + '40',
  },
  summaryEmoji: { fontSize: 18 },
  summaryText: { ...typography.body, color: colors.accent, fontWeight: '700', textAlign: 'right' },
  summaryTextWarn: { color: colors.error },

  preview: { marginTop: spacing.sm },
  previewLabel: {
    ...typography.label,
    color: colors.textMuted,
    textTransform: 'uppercase',
    textAlign: 'right',
    marginBottom: spacing.sm,
  },
  previewCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.bgCard,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  previewBadge: {
    width: 56,
    height: 56,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewBadgeSm: { fontSize: 9, fontWeight: '700', color: colors.bg },
  previewBadgeNum: { fontSize: 20, fontWeight: '900', color: colors.bg },
  previewInfo: { flex: 1, alignItems: 'flex-end' },
  previewName: { ...typography.subtitle, color: colors.textPrimary },
  previewTime: { ...typography.caption, color: colors.textSecondary, marginTop: 2, textAlign: 'right' },

  cta: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.lg,
    paddingBottom: 32,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
});
