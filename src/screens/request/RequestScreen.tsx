import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Alert,
} from 'react-native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { MainTabParamList } from '../../navigation/MainNavigator';
import { Button, Input } from '../../components';
import { colors, spacing, radius, typography } from '../../theme';
import { createRequest } from '../../hooks/useParking';

type Props = { navigation: BottomTabNavigationProp<MainTabParamList, 'Request'> };
type ParkingType = 'self' | 'guest';

// ─── Time Picker ──────────────────────────────────────────
function TimePicker({ label, value, onChange }: { label: string; value: Date; onChange: (d: Date) => void }) {
  const adjust = (m: number) => onChange(new Date(value.getTime() + m * 60000));
  const fmt = (d: Date) => d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
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
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.bgInput, padding: spacing.md,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md,
  },
  label: { ...typography.body, color: colors.textSecondary },
  controls: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  arrow: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  arrowTxt: { fontSize: 22, color: colors.textPrimary, fontWeight: '300', lineHeight: 26 },
  time: { ...typography.subtitle, color: colors.accent, minWidth: 60, textAlign: 'center' },
});

// ─── RequestScreen ────────────────────────────────────────
export default function RequestScreen({ navigation }: Props) {
  const snap30 = () => {
    const d = new Date(); d.setSeconds(0, 0);
    const rem = d.getMinutes() % 30;
    if (rem) d.setMinutes(d.getMinutes() + (30 - rem));
    return d;
  };

  const [fromTime, setFromTime]     = useState<Date>(snap30());
  const [toTime, setToTime]         = useState<Date>(new Date(snap30().getTime() + 2 * 3600000));
  const [parkingType, setParkingType] = useState<ParkingType>('self');
  const [guestPlate, setGuestPlate] = useState('');
  const [plateError, setPlateError] = useState('');
  const [loading, setLoading]       = useState(false);

  const durationMins = Math.round((toTime.getTime() - fromTime.getTime()) / 60000);

  // Guest plate validation
  const plateNorm = guestPlate.replace(/-/g, '');
  const plateValid = /^\d{7,8}$/.test(plateNorm);

  const maxFrom  = new Date(Date.now() + 6 * 60 * 60 * 1000);
  const tooFarAhead = fromTime > maxFrom;

  const isValid =
    durationMins > 0 &&
    !tooFarAhead &&
    (parkingType === 'self' || (parkingType === 'guest' && plateValid));

  const howSteps = parkingType === 'self'
    ? [
        { step: '1', text: 'שולח/ת את הבקשה' },
        { step: '2', text: 'בעל חניה רואה ומאשר' },
        { step: '3', text: 'מקבל/ת התראה + פרטי חניה' },
        { step: '4', text: 'מכניס/ה מספר רכב ומחנה' },
      ]
    : [
        { step: '1', text: 'מכניס/ה מספר רכב של האורח' },
        { step: '2', text: 'שולח/ת את הבקשה' },
        { step: '3', text: 'בעל חניה מאשר' },
        { step: '4', text: 'האורח חונה מיד — ללא שלבים נוספים' },
      ];

  const handleSubmit = async () => {
    if (parkingType === 'guest' && !plateValid) {
      setPlateError('מספר לוחית תקין: 7-8 ספרות');
      return;
    }

    setLoading(true);
    try {
      await createRequest({
        fromTime,
        toTime,
        requesterProfile: { name: 'שמי', apartment: '45', tower: '1' }, // TODO: from profile context
        guestCarNumber: parkingType === 'guest' ? plateNorm : undefined,
      });

      const msg = parkingType === 'guest'
        ? 'בעלי החניות יקבלו התראה.\nכשמישהו יאשר — האורח שלך יוכל לחנות מיד.'
        : 'בעלי החניות יקבלו התראה.\nכשמישהו יאשר — תקבל/י הודעה.';

      Alert.alert('הבקשה נשלחה!', msg,
        [{ text: 'הבנתי', onPress: () => navigation.navigate('Home') }]
      );
    } catch (e: any) {
      if (e?.message === 'DUPLICATE_REQUEST') {
        Alert.alert(
          'יש לך בקשה פעילה',
          'כבר שלחת בקשת חניה פתוחה. בטל אותה לפני שתשלח בקשה חדשה.',
          [{ text: 'הבנתי' }]
        );
      } else if (e?.message === 'TOO_FAR_AHEAD') {
        Alert.alert(
          'זמן רחוק מדי',
          'ניתן לשלוח בקשות לשעות הקרובות בלבד (עד 6 שעות קדימה).',
          [{ text: 'הבנתי' }]
        );
      } else {
        Alert.alert('שגיאה', 'לא ניתן לשלוח בקשה, נסה שוב');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={s.screen}>
      <View style={s.header}>
        <Text style={s.headerTitle}>בקש חניה</Text>
        <Text style={s.headerSub}>הבקשה תישלח לכל בעלי החניות בבניין</Text>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* ── Type toggle ── */}
        <Text style={s.sectionLabel}>עבור מי?</Text>
        <View style={s.typeRow}>
          <TouchableOpacity
            style={[s.typeBtn, parkingType === 'self' && s.typeBtnActive]}
            onPress={() => { setParkingType('self'); setGuestPlate(''); setPlateError(''); }}
            activeOpacity={0.8}
          >
            <Text style={s.typeEmoji}>🙋</Text>
            <Text style={[s.typeLabel, parkingType === 'self' && s.typeLabelActive]}>עבורי</Text>
            <Text style={[s.typeDesc, parkingType === 'self' && s.typeDescActive]}>
              אכניס מספר רכב{'\n'}אחרי האישור
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.typeBtn, parkingType === 'guest' && s.typeBtnActive]}
            onPress={() => setParkingType('guest')}
            activeOpacity={0.8}
          >
            <Text style={s.typeEmoji}>👥</Text>
            <Text style={[s.typeLabel, parkingType === 'guest' && s.typeLabelActive]}>עבור אורח</Text>
            <Text style={[s.typeDesc, parkingType === 'guest' && s.typeDescActive]}>
              אכניס מספר רכב{'\n'}עכשיו
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Guest plate input ── */}
        {parkingType === 'guest' && (
          <View style={s.guestBox}>
            <View style={s.guestBoxHeader}>
              <Text style={s.guestBoxTitle}>מספר רכב של האורח</Text>
              <Text style={s.guestBoxSub}>לאחר האישור, האורח יוכל לחנות מיד ללא שלבים נוספים</Text>
            </View>
            <Input
              value={guestPlate}
              onChangeText={(t) => { setGuestPlate(t); setPlateError(''); }}
              placeholder="לדוגמה: 1234567"
              keyboardType="numeric"
              textAlign="right"
              maxLength={8}
              error={plateError}
            />
            {plateValid && (
              <View style={s.plateValid}>
                <Text style={s.plateValidText}>✓ {formatPlate(plateNorm)}</Text>
              </View>
            )}
          </View>
        )}

        {/* ── Time ── */}
        <Text style={s.sectionLabel}>לכמה זמן?</Text>
        <TimePicker label="מ-" value={fromTime} onChange={setFromTime} />
        <TimePicker label="עד" value={toTime} onChange={setToTime} />

        {tooFarAhead && (
          <View style={[s.summary, s.summaryWarn]}>
            <Text style={[s.summaryText, { color: colors.error }]}>
              ⚠️ ניתן לשלוח בקשות עד 6 שעות קדימה בלבד
            </Text>
          </View>
        )}

        {durationMins > 0 && !tooFarAhead && (
          <View style={s.summary}>
            <Text style={s.summaryText}>
              {'⏱️ ' + (durationMins < 60
                ? durationMins + " דק'"
                : (durationMins / 60).toFixed(1).replace('.0', '') + ' שעות')}
            </Text>
          </View>
        )}

        {/* ── How it works ── */}
        <View style={s.howWrap}>
          <Text style={s.howTitle}>איך זה עובד?</Text>
          {howSteps.map(({ step, text }) => (
            <View key={step} style={s.howRow}>
              <View style={s.howStep}>
                <Text style={s.howStepText}>{step}</Text>
              </View>
              <Text style={s.howText}>{text}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={s.cta}>
        <Button
          label={parkingType === 'guest' ? 'שלח בקשה עבור האורח 👥' : 'שלח בקשה לכל הבניין 📣'}
          onPress={handleSubmit}
          loading={loading}
          disabled={!isValid}
        />
      </View>
    </View>
  );
}

function formatPlate(d: string): string {
  if (d.length === 7) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`;
  if (d.length === 8) return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
  return d;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: spacing.lg, paddingTop: 60, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderColor: colors.border,
  },
  headerTitle: { ...typography.title, color: colors.textPrimary, textAlign: 'right' },
  headerSub: { ...typography.body, color: colors.textSecondary, textAlign: 'right', marginTop: 4 },
  scroll: { padding: spacing.lg, paddingBottom: 120 },
  sectionLabel: {
    ...typography.label, color: colors.textSecondary, textTransform: 'uppercase',
    textAlign: 'right', marginBottom: spacing.sm, marginTop: spacing.md,
  },

  // Type toggle
  typeRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  typeBtn: {
    flex: 1, alignItems: 'center', gap: spacing.xs,
    padding: spacing.md, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgInput,
  },
  typeBtnActive: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  typeEmoji: { fontSize: 28 },
  typeLabel: { ...typography.body, color: colors.textSecondary, fontWeight: '700' },
  typeLabelActive: { color: colors.accent },
  typeDesc: { ...typography.caption, color: colors.textMuted, textAlign: 'center', lineHeight: 16 },
  typeDescActive: { color: colors.accent + 'CC' },

  // Guest box
  guestBox: {
    backgroundColor: colors.bgCard, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.accent + '50',
    padding: spacing.md, marginBottom: spacing.md,
  },
  guestBoxHeader: { marginBottom: spacing.md },
  guestBoxTitle: { ...typography.subtitle, color: colors.textPrimary, textAlign: 'right' },
  guestBoxSub: {
    ...typography.caption, color: colors.textSecondary, textAlign: 'right',
    marginTop: 4, lineHeight: 18,
  },
  plateValid: {
    backgroundColor: colors.success + '15', borderRadius: radius.sm,
    padding: spacing.sm, alignItems: 'flex-end',
    borderWidth: 1, borderColor: colors.success + '40',
  },
  plateValidText: { ...typography.caption, color: colors.success, fontWeight: '700' },

  // Duration summary
  summary: {
    backgroundColor: colors.accentDim, padding: spacing.md,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.accent + '40',
    alignItems: 'flex-end', marginBottom: spacing.lg,
  },
  summaryText: { ...typography.body, color: colors.accent, fontWeight: '700' },
  summaryWarn: { backgroundColor: colors.error + '15', borderColor: colors.error + '40' },

  // How it works
  howWrap: {
    backgroundColor: colors.bgCard, borderRadius: radius.lg,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border, gap: spacing.md,
  },
  howTitle: { ...typography.label, color: colors.textMuted, textTransform: 'uppercase', textAlign: 'right' },
  howRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md },
  howStep: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center',
  },
  howStepText: { fontSize: 13, fontWeight: '800', color: colors.bg },
  howText: { ...typography.body, color: colors.textSecondary, flex: 1, textAlign: 'right' },

  cta: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: spacing.lg, paddingBottom: 32,
    backgroundColor: colors.bg, borderTopWidth: 1, borderColor: colors.border,
  },
});
