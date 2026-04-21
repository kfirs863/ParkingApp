import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView,
  ActivityIndicator,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { OnboardingStackParamList } from '../../navigation/OnboardingNavigator';
import { Button, Input, ScreenShell, StepIndicator } from '../../components';
import { colors, spacing, radius, typography } from '../../theme';
import { saveUserProfile, checkSpotTaken } from '../../config/firebase';
import { towerLabel } from '../../utils/towerLabel';
import { FLOORS, ParkingFloor, buildSpotId, parseSpotId } from '../../utils/spotId';

type Props = {
  navigation: NativeStackNavigationProp<OnboardingStackParamList, 'CarNumber'>;
  route: RouteProp<OnboardingStackParamList, 'CarNumber'>;
};

type SpotCheckState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available' }
  | { status: 'taken'; apartment: string; tower: string }
  | { status: 'error' };

export default function CarNumberScreen({ navigation, route }: Props) {
  const { name, tower, apartment } = route.params;

  const [carNumber, setCarNumber] = useState('');
  const [carError, setCarError] = useState('');

  const [hasSpot, setHasSpot] = useState<boolean | null>(null);
  const [spotFloor, setSpotFloor] = useState<ParkingFloor | null>(null);
  const [spotNumber, setSpotNumber] = useState('');
  const [spotCheck, setSpotCheck] = useState<SpotCheckState>({ status: 'idle' });

  const [loading, setLoading] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  useEffect(() => { return () => { mounted.current = false; }; }, []);

  // ─── Spot uniqueness check (debounced) ───────────────────
  const triggerSpotCheck = (floor: ParkingFloor | null, number: string) => {
    setSpotCheck({ status: 'idle' });
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (!floor || !number.trim()) return;

    const spotId = buildSpotId(floor, number);
    setSpotCheck({ status: 'checking' });
    debounceTimer.current = setTimeout(async () => {
      try {
        const taken = await checkSpotTaken(spotId);
        if (!mounted.current) return;
        if (taken) {
          setSpotCheck({ status: 'taken', apartment: taken.apartment, tower: taken.tower });
        } else {
          setSpotCheck({ status: 'available' });
        }
      } catch {
        if (!mounted.current) return;
        setSpotCheck({ status: 'error' });
      }
    }, 600);
  };

  const handleFloorSelect = (floor: ParkingFloor) => {
    setSpotFloor(floor);
    triggerSpotCheck(floor, spotNumber);
  };

  const handleSpotChange = (text: string) => {
    setSpotNumber(text);
    triggerSpotCheck(spotFloor, text);
  };

  // ─── Validation ───────────────────────────────────────────
  const normalizedPlate = carNumber.replace(/-/g, '');

  const validateCar = () => {
    if (!carNumber.trim()) return true;
    if (!/^\d{7,8}$/.test(normalizedPlate)) {
      setCarError('מספר לוחית תקין: 7-8 ספרות (לדוגמה: 1234567)');
      return false;
    }
    return true;
  };

  const spotIsValid =
    hasSpot === false ||
    (hasSpot === true &&
      spotFloor !== null &&
      spotNumber.trim().length > 0 &&
      spotCheck.status === 'available');

  const canFinish = hasSpot !== null && spotIsValid && spotCheck.status !== 'checking';

  // ─── Submit ───────────────────────────────────────────────
  const handleFinish = async () => {
    if (!validateCar()) return;
    if (hasSpot && spotCheck.status === 'taken') {
      Alert.alert('חניה תפוסה', 'מספר חניה זה כבר רשום על שם דייר אחר');
      return;
    }
    setLoading(true);
    try {
      await saveUserProfile({
        name,
        tower,
        apartment,
        carNumbers: carNumber.trim() ? [normalizedPlate] : [],
        ownedSpot: hasSpot && spotFloor ? buildSpotId(spotFloor, spotNumber) : null,
      });
      navigation.navigate('Done');
    } catch {
      Alert.alert('שגיאה', 'לא ניתן לשמור פרופיל, נסה שוב');
    } finally {
      setLoading(false);
    }
  };

  // ─── Spot status indicator ────────────────────────────────
  const spotDisplayName = spotFloor && spotNumber.trim()
    ? `${spotFloor}-${spotNumber.trim()}`
    : spotNumber.trim();

  const SpotStatusIndicator = () => {
    if (!spotFloor || !spotNumber.trim()) return null;
    switch (spotCheck.status) {
      case 'checking':
        return (
          <View style={st.row}>
            <ActivityIndicator size="small" color={colors.textMuted} />
            <Text style={st.checking}>בודק זמינות...</Text>
          </View>
        );
      case 'available':
        return (
          <View style={[st.banner, st.bannerGreen]}>
            <Text style={st.bannerIcon}>✓</Text>
            <Text style={[st.bannerText, { color: colors.success }]}>
              חניה {spotDisplayName} פנויה — לא רשומה על שם אף אחד
            </Text>
          </View>
        );
      case 'taken':
        return (
          <View style={[st.banner, st.bannerRed]}>
            <Text style={st.bannerIcon}>✕</Text>
            <Text style={[st.bannerText, { color: colors.error }]}>
              חניה {spotDisplayName} כבר רשומה על שם דירה {spotCheck.apartment}
              {' '}{towerLabel(spotCheck.tower)}.{'\n'}
              אם זו טעות, פנה למנהל הבניין.
            </Text>
          </View>
        );
      case 'error':
        return (
          <View style={[st.banner, st.bannerWarn]}>
            <Text style={[st.bannerText, { color: colors.warning }]}>
              לא ניתן לבדוק כרגע — נסה שוב
            </Text>
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <ScreenShell>
      <StepIndicator total={4} current={3} />
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>פרטי רכב וחניה</Text>
        <Text style={styles.sub}>ניתן לעדכן בהמשך בפרופיל שלך</Text>

        {/* Car Number */}
        <Input
          label="מספר לוחית רישוי (אופציונלי)"
          value={carNumber}
          onChangeText={(t) => { setCarNumber(t); setCarError(''); }}
          placeholder="לדוגמה: 1234567"
          keyboardType="numeric"
          error={carError}
          textAlign="right"
          maxLength={8}
        />

        {/* Has Parking Spot? */}
        <Text style={styles.sectionLabel}>יש לך חניה צמודה?</Text>
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[styles.toggleBtn, hasSpot === true && styles.toggleBtnActive]}
            onPress={() => { setHasSpot(true); }}
            activeOpacity={0.8}
          >
            <Text style={styles.toggleIcon}>✅</Text>
            <Text style={[styles.toggleText, hasSpot === true && styles.toggleTextActive]}>
              כן, יש לי
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.toggleBtn, hasSpot === false && styles.toggleBtnActive]}
            onPress={() => { setHasSpot(false); setSpotFloor(null); setSpotNumber(''); setSpotCheck({ status: 'idle' }); }}
            activeOpacity={0.8}
          >
            <Text style={styles.toggleIcon}>❌</Text>
            <Text style={[styles.toggleText, hasSpot === false && styles.toggleTextActive]}>
              אין לי
            </Text>
          </TouchableOpacity>
        </View>

        {hasSpot === true && (
          <View style={styles.spotReveal}>
            <Text style={styles.spotSubLabel}>קומת חניה</Text>
            <View style={styles.floorRow}>
              {FLOORS.map((f) => (
                <TouchableOpacity
                  key={f}
                  style={[styles.floorBtn, spotFloor === f && styles.floorBtnActive]}
                  onPress={() => handleFloorSelect(f)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.floorBtnText, spotFloor === f && styles.floorBtnTextActive]}>
                    {f}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Input
              label="מספר חניה"
              value={spotNumber}
              onChangeText={handleSpotChange}
              placeholder="לדוגמה: 42"
              keyboardType="numeric"
              textAlign="right"
            />
            <SpotStatusIndicator />
            {(!spotFloor || (!spotNumber.trim() && spotCheck.status === 'idle')) && (
              <View style={styles.hintBox}>
                <Text style={styles.hintText}>
                  💡 בחר קומה והזן מספר חניה — ייבדק אוטומטית מול כל הדיירים
                </Text>
              </View>
            )}
          </View>
        )}

        {hasSpot === false && (
          <View style={styles.noSpotNote}>
            <Text style={styles.noSpotText}>
              לא נורא! תוכל לבקש חניה מהשכנים כשתצטרך 🙂
            </Text>
          </View>
        )}
      </ScrollView>

      <Button
        label="סיים הרשמה"
        onPress={handleFinish}
        loading={loading}
        disabled={!canFinish}
        style={styles.cta}
      />
    </ScreenShell>
  );
}

// ─── Status banner styles ─────────────────────────────────
const st = StyleSheet.create({
  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  checking: { ...typography.caption, color: colors.textMuted },
  banner: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  bannerGreen: { backgroundColor: colors.success + '15', borderColor: colors.success + '50' },
  bannerRed:   { backgroundColor: colors.error + '15',   borderColor: colors.error + '50'   },
  bannerWarn:  { backgroundColor: colors.warning + '15', borderColor: colors.warning + '50' },
  bannerIcon:  { fontSize: 14, fontWeight: '800' },
  bannerText:  { ...typography.caption, flex: 1, textAlign: 'right', lineHeight: 18 },
});

const styles = StyleSheet.create({
  scrollView: { flex: 1 },
  scroll: { paddingBottom: spacing.xl },
  title: { ...typography.title, color: colors.textPrimary, textAlign: 'right', marginBottom: spacing.sm },
  sub: { ...typography.body, color: colors.textSecondary, textAlign: 'right', marginBottom: spacing.xl },

  sectionLabel: {
    ...typography.label,
    color: colors.textSecondary,
    textAlign: 'right',
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },

  toggleRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  toggleBtn: {
    flex: 1, paddingVertical: spacing.md,
    borderRadius: radius.md, borderWidth: 1,
    borderColor: colors.border, backgroundColor: colors.bgInput,
    alignItems: 'center', gap: spacing.xs,
  },
  toggleBtnActive: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  toggleIcon: { fontSize: 20 },
  toggleText: { ...typography.body, color: colors.textSecondary },
  toggleTextActive: { color: colors.accent, fontWeight: '700' },

  spotReveal: { marginTop: spacing.sm },
  spotSubLabel: {
    ...typography.label,
    color: colors.textSecondary,
    textAlign: 'right',
    marginBottom: spacing.sm,
  },
  floorRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  floorBtn: {
    flex: 1, paddingVertical: spacing.sm,
    borderRadius: radius.md, borderWidth: 1,
    borderColor: colors.border, backgroundColor: colors.bgInput,
    alignItems: 'center',
  },
  floorBtnActive: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  floorBtnText: { ...typography.body, color: colors.textSecondary, fontWeight: '600' },
  floorBtnTextActive: { color: colors.accent },
  hintBox: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  hintText: { ...typography.caption, color: colors.textSecondary, textAlign: 'right' },

  noSpotNote: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  noSpotText: { ...typography.body, color: colors.textSecondary, textAlign: 'right' },

  cta: { marginTop: spacing.md },
});
