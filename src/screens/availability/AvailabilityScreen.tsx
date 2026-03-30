import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Alert, ActivityIndicator, Switch,
} from 'react-native';
import {
  collection, addDoc, setDoc, deleteDoc, query, where,
  onSnapshot, updateDoc, doc, serverTimestamp, Timestamp, orderBy, getDocs,
} from 'firebase/firestore';
import { db, auth, useUserProfile } from '../../config/firebase';
import { Button } from '../../components';
import { colors, spacing, radius, typography } from '../../theme';

// ─── Types ────────────────────────────────────────────────
interface AvailabilityWindow {
  id: string;
  ownerId: string;
  spotNumber: string;
  fromTime: Date;
  toTime: Date;
  status: 'active' | 'cancelled';
  isRecurring?: boolean;
  createdAt: Date;
}

interface RecurringRule {
  id: string;
  ownerId: string;
  spotNumber: string;
  fromHHMM: string;   // "08:00"
  toHHMM:   string;   // "17:00"
  days: number[];     // [0,1,2,3,4] = Sun-Thu
  active: boolean;
}

const DAY_LABELS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
const DAY_NAMES  = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

// ─── TimePicker ───────────────────────────────────────────
function HHMMPicker({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  const [h, m] = value.split(':').map(Number);
  const adjust = (deltaMin: number) => {
    const total = h * 60 + m + deltaMin;
    const clamped = Math.max(0, Math.min(23 * 60 + 30, total));
    const nh = Math.floor(clamped / 60);
    const nm = clamped % 60;
    onChange(`${String(nh).padStart(2,'0')}:${String(nm).padStart(2,'0')}`);
  };
  return (
    <View style={tp.row}>
      <Text style={tp.label}>{label}</Text>
      <View style={tp.controls}>
        <TouchableOpacity style={tp.arrow} onPress={() => adjust(-30)} activeOpacity={0.7}>
          <Text style={tp.arrowTxt}>−</Text>
        </TouchableOpacity>
        <Text style={tp.time}>{value}</Text>
        <TouchableOpacity style={tp.arrow} onPress={() => adjust(30)} activeOpacity={0.7}>
          <Text style={tp.arrowTxt}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function DateTimePicker({ label, value, onChange }: {
  label: string; value: Date; onChange: (d: Date) => void;
}) {
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

// ─── Hooks ────────────────────────────────────────────────
function useMyWindows() {
  const [windows, setWindows] = useState<AvailabilityWindow[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) { setLoading(false); return; }
    const q = query(
      collection(db, 'spotAvailability'),
      where('ownerId', '==', uid),
      where('status', '==', 'active'),
      where('toTime', '>', Timestamp.now()),
      orderBy('toTime', 'asc')
    );
    return onSnapshot(q, (snap) => {
      setWindows(snap.docs.map((d) => ({
        id: d.id, ...d.data(),
        fromTime: d.data().fromTime?.toDate(),
        toTime:   d.data().toTime?.toDate(),
        createdAt: d.data().createdAt?.toDate(),
      })) as AvailabilityWindow[]);
      setLoading(false);
    });
  }, []);
  return { windows, loading };
}

function useMyRules() {
  const [rules, setRules] = useState<RecurringRule[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) { setLoading(false); return; }
    const q = query(
      collection(db, 'availabilityRules'),
      where('ownerId', '==', uid)
    );
    return onSnapshot(q, (snap) => {
      setRules(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as RecurringRule[]);
      setLoading(false);
    });
  }, []);
  return { rules, loading };
}

// ─── AvailabilityScreen ───────────────────────────────────
type Tab = 'oneoff' | 'recurring';

export default function AvailabilityScreen() {
  const { profile }                = useUserProfile();
  const { windows, loading: wl }   = useMyWindows();
  const { rules,   loading: rl }   = useMyRules();
  const [tab, setTab]              = useState<Tab>('oneoff');

  // One-off state
  const snap30 = () => {
    const d = new Date(); d.setSeconds(0,0);
    const rem = d.getMinutes() % 30;
    if (rem) d.setMinutes(d.getMinutes() + (30 - rem));
    return d;
  };
  const [fromTime, setFromTime] = useState<Date>(snap30());
  const [toTime, setToTime]     = useState<Date>(new Date(snap30().getTime() + 2 * 3600000));
  const [saving, setSaving]     = useState(false);

  // Recurring state
  const [rFromHH, setRFromHH]   = useState('08:00');
  const [rToHH, setRToHH]       = useState('17:00');
  const [rDays, setRDays]        = useState<number[]>([0,1,2,3,4]); // Sun-Thu
  const [rSaving, setRSaving]   = useState(false);

  const durationMins = Math.round((toTime.getTime() - fromTime.getTime()) / 60000);

  const toggleDay = (day: number) =>
    setRDays((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort());

  const fmt = (d: Date) => d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });

  // ── Add one-off window ─────────────────────────────────
  const handleAddOneOff = async () => {
    if (!profile?.ownedSpot) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'spotAvailability'), {
        ownerId:        auth.currentUser!.uid,
        ownerName:      profile.name,
        ownerApartment: profile.apartment,
        ownerTower:     profile.tower,
        spotNumber:     profile.ownedSpot,
        fromTime:       Timestamp.fromDate(fromTime),
        toTime:         Timestamp.fromDate(toTime),
        status:         'active',
        isRecurring:    false,
        createdAt:      serverTimestamp(),
      });
      Alert.alert('נשמר!', 'תקבל התראה ממוקדת כשמישהו יבקש חניה בטווח הזה.');
    } catch {
      Alert.alert('שגיאה', 'לא ניתן לשמור, נסה שוב');
    } finally {
      setSaving(false);
    }
  };

  // ── Add/update recurring rule ──────────────────────────
  const handleAddRecurring = async () => {
    if (!profile?.ownedSpot || rDays.length === 0) return;
    const [fh, fm] = rFromHH.split(':').map(Number);
    const [th, tm] = rToHH.split(':').map(Number);
    if (fh * 60 + fm >= th * 60 + tm) {
      Alert.alert('שגיאה', 'שעת סיום חייבת להיות אחרי שעת התחלה');
      return;
    }
    setRSaving(true);
    try {
      // Use owner uid as doc id — one rule per owner (can be extended)
      const ruleId = `${auth.currentUser!.uid}_default`;
      await setDoc(doc(db, 'availabilityRules', ruleId), {
        ownerId:        auth.currentUser!.uid,
        ownerName:      profile.name,
        ownerApartment: profile.apartment,
        ownerTower:     profile.tower,
        spotNumber:     profile.ownedSpot,
        fromHHMM:       rFromHH,
        toHHMM:         rToHH,
        days:           rDays,
        active:         true,
        updatedAt:      serverTimestamp(),
      });
      Alert.alert(
        'כלל קבוע נשמר!',
        `החניה תסומן כפנויה אוטומטית כל ${rDays.map((d) => DAY_NAMES[d]).join(', ')} בין ${rFromHH} ל-${rToHH}.`
      );
    } catch {
      Alert.alert('שגיאה', 'לא ניתן לשמור, נסה שוב');
    } finally {
      setRSaving(false);
    }
  };

  const handleToggleRule = async (rule: RecurringRule) => {
    await updateDoc(doc(db, 'availabilityRules', rule.id), { active: !rule.active });
  };

  const handleDeleteRule = (rule: RecurringRule) => {
    Alert.alert('מחק כלל', 'למחוק את הכלל הקבוע?', [
      { text: 'ביטול', style: 'cancel' },
      { text: 'מחק', style: 'destructive', onPress: () =>
        deleteDoc(doc(db, 'availabilityRules', rule.id))
      },
    ]);
  };

  const handleCancelWindow = (windowId: string) => {
    Alert.alert('ביטול', 'לבטל את חלון הזמינות?', [
      { text: 'לא', style: 'cancel' },
      { text: 'כן', style: 'destructive', onPress: () =>
        updateDoc(doc(db, 'spotAvailability', windowId), { status: 'cancelled', cancelledAt: serverTimestamp() })
      },
    ]);
  };

  if (profile && !profile.ownedSpot) {
    return (
      <View style={s.screen}>
        <View style={s.header}><Text style={s.title}>הזמינות שלי</Text></View>
        <View style={s.noSpot}>
          <Text style={{ fontSize: 52 }}>🅿️</Text>
          <Text style={s.noSpotTitle}>אין לך חניה רשומה</Text>
          <Text style={s.noSpotSub}>רשום מספר חניה בפרופיל כדי להגדיר זמינות</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={s.screen}>
      <View style={s.header}>
        <Text style={s.title}>הזמינות שלי</Text>
        <Text style={s.sub}>{'חניה ' + (profile?.ownedSpot ?? '—') + ' · מגדל ' + (profile?.tower ?? '—')}</Text>
      </View>

      {/* Tab switch */}
      <View style={s.tabs}>
        <TouchableOpacity style={[s.tab, tab === 'oneoff' && s.tabActive]} onPress={() => setTab('oneoff')} activeOpacity={0.8}>
          <Text style={[s.tabText, tab === 'oneoff' && s.tabTextActive]}>חד-פעמי</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.tab, tab === 'recurring' && s.tabActive]} onPress={() => setTab('recurring')} activeOpacity={0.8}>
          <Text style={[s.tabText, tab === 'recurring' && s.tabTextActive]}>קבוע</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {tab === 'oneoff' ? (
          <>
            {/* Explainer */}
            <View style={s.explainer}>
              <Text style={s.explainerEmoji}>💡</Text>
              <Text style={s.explainerText}>
                סמן מתי החניה פנויה — כשתהיה בקשה תואמת תקבל התראה ממוקדת, לפני כולם.
              </Text>
            </View>

            <Text style={s.sectionLabel}>הוסף חלון</Text>
            <DateTimePicker label="מ-" value={fromTime} onChange={setFromTime} />
            <DateTimePicker label="עד" value={toTime}   onChange={setToTime} />

            {durationMins > 0 && (
              <View style={s.summary}>
                <Text style={s.summaryText}>
                  {'⏱️ ' + (durationMins < 60
                    ? durationMins + " דק'"
                    : (durationMins/60).toFixed(1).replace('.0','') + ' שעות')}
                </Text>
              </View>
            )}
            <Button label="הוסף זמינות" onPress={handleAddOneOff} loading={saving} disabled={durationMins <= 0} />

            {/* Active one-off windows */}
            {(wl || windows.filter((w) => !w.isRecurring).length > 0) && (
              <>
                <Text style={[s.sectionLabel, { marginTop: spacing.xl }]}>פעיל כרגע</Text>
                {wl
                  ? <ActivityIndicator color={colors.accent} />
                  : windows.filter((w) => !w.isRecurring).map((w) => (
                      <View key={w.id} style={s.windowCard}>
                        <View style={s.windowInfo}>
                          <Text style={s.windowTime}>{fmt(w.fromTime)} – {fmt(w.toTime)}</Text>
                        </View>
                        <TouchableOpacity style={s.windowCancel} onPress={() => handleCancelWindow(w.id)} activeOpacity={0.8}>
                          <Text style={s.windowCancelText}>בטל</Text>
                        </TouchableOpacity>
                      </View>
                    ))
                }
              </>
            )}
          </>
        ) : (
          <>
            {/* Recurring explainer */}
            <View style={[s.explainer, { borderColor: colors.success + '40', backgroundColor: colors.success + '10' }]}>
              <Text style={s.explainerEmoji}>🔁</Text>
              <Text style={[s.explainerText, { color: colors.success }]}>
                הגדר ימים ושעות קבועים — החניה תסומן כפנויה אוטומטית מדי יום ללא צורך בהזנה ידנית.
              </Text>
            </View>

            {/* Day selector */}
            <Text style={s.sectionLabel}>ימים</Text>
            <View style={s.daysRow}>
              {DAY_LABELS.map((label, i) => (
                <TouchableOpacity
                  key={i}
                  style={[s.dayBtn, rDays.includes(i) && s.dayBtnActive]}
                  onPress={() => toggleDay(i)}
                  activeOpacity={0.8}
                >
                  <Text style={[s.dayBtnText, rDays.includes(i) && s.dayBtnTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.sectionLabel}>שעות</Text>
            <HHMMPicker label="מ-" value={rFromHH} onChange={setRFromHH} />
            <HHMMPicker label="עד" value={rToHH}   onChange={setRToHH} />

            <Button
              label="שמור כלל קבוע"
              onPress={handleAddRecurring}
              loading={rSaving}
              disabled={rDays.length === 0}
            />

            {/* Existing rules */}
            {rules.length > 0 && (
              <>
                <Text style={[s.sectionLabel, { marginTop: spacing.xl }]}>כללים קבועים</Text>
                {rules.map((rule) => (
                  <View key={rule.id} style={s.ruleCard}>
                    <View style={s.ruleInfo}>
                      <Text style={s.ruleDays}>
                        {rule.days.map((d) => DAY_LABELS[d]).join(' ')}
                      </Text>
                      <Text style={s.ruleTime}>{rule.fromHHMM} – {rule.toHHMM}</Text>
                    </View>
                    <View style={s.ruleActions}>
                      <Switch
                        value={rule.active}
                        onValueChange={() => handleToggleRule(rule)}
                        trackColor={{ true: colors.accent, false: colors.border }}
                        thumbColor={colors.textPrimary}
                      />
                      <TouchableOpacity onPress={() => handleDeleteRule(rule)} style={s.deleteBtn}>
                        <Text style={s.deleteBtnText}>מחק</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: spacing.lg, paddingTop: 60, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderColor: colors.border,
  },
  title: { ...typography.title, color: colors.textPrimary, textAlign: 'right' },
  sub: { ...typography.caption, color: colors.textSecondary, textAlign: 'right', marginTop: 4 },

  tabs: {
    flexDirection: 'row', marginHorizontal: spacing.lg, marginTop: spacing.md,
    backgroundColor: colors.bgCard, borderRadius: radius.lg,
    padding: 4, borderWidth: 1, borderColor: colors.border,
  },
  tab: { flex: 1, paddingVertical: 10, borderRadius: radius.md, alignItems: 'center' },
  tabActive: { backgroundColor: colors.accent },
  tabText: { ...typography.label, color: colors.textSecondary, textTransform: 'none', fontSize: 14 },
  tabTextActive: { color: colors.bg },

  scroll: { padding: spacing.lg, paddingBottom: 60 },

  explainer: {
    flexDirection: 'row-reverse', gap: spacing.md, alignItems: 'flex-start',
    backgroundColor: colors.accentDim, borderRadius: radius.lg, padding: spacing.md,
    borderWidth: 1, borderColor: colors.accent + '40', marginBottom: spacing.lg,
  },
  explainerEmoji: { fontSize: 20 },
  explainerText: { ...typography.body, color: colors.accent, flex: 1, textAlign: 'right', lineHeight: 22 },

  sectionLabel: {
    ...typography.label, color: colors.textSecondary, textTransform: 'uppercase',
    textAlign: 'right', marginBottom: spacing.sm,
  },
  summary: {
    backgroundColor: colors.accentDim, padding: spacing.md,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.accent + '40',
    alignItems: 'flex-end', marginBottom: spacing.md,
  },
  summaryText: { ...typography.body, color: colors.accent, fontWeight: '700' },

  // Day selector
  daysRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md, justifyContent: 'center' },
  dayBtn: {
    width: 40, height: 40, borderRadius: 20,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgInput,
    alignItems: 'center', justifyContent: 'center',
  },
  dayBtnActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  dayBtnText: { ...typography.body, color: colors.textSecondary, fontWeight: '700' },
  dayBtnTextActive: { color: colors.bg },

  // One-off windows
  windowCard: {
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.bgCard, borderRadius: radius.md, padding: spacing.md,
    borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm,
  },
  windowInfo: { alignItems: 'flex-end' },
  windowTime: { ...typography.subtitle, color: colors.textPrimary },
  windowCancel: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.full, borderWidth: 1, borderColor: colors.error + '60',
  },
  windowCancelText: { ...typography.caption, color: colors.error },

  // Rules
  ruleCard: {
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.bgCard, borderRadius: radius.md, padding: spacing.md,
    borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm,
  },
  ruleInfo: { alignItems: 'flex-end', gap: 4 },
  ruleDays: { ...typography.subtitle, color: colors.textPrimary, letterSpacing: 2 },
  ruleTime: { ...typography.body, color: colors.accent },
  ruleActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  deleteBtn: { padding: spacing.sm },
  deleteBtnText: { ...typography.caption, color: colors.error },

  noSpot: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  noSpotTitle: { ...typography.subtitle, color: colors.textPrimary },
  noSpotSub: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
});
