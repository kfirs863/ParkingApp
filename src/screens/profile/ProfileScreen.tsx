import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, Switch, Modal,
} from 'react-native';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, signOut, useUserProfile, checkSpotTaken, UserProfile } from '../../config/firebase';
import { Button, Input } from '../../components';
import { colors, spacing, radius, typography } from '../../theme';
import {
  useMyAvailabilityRules, createAvailabilityRule, updateAvailabilityRule,
  deleteAvailabilityRule, AvailabilityRule,
} from '../../hooks/useAvailabilityRules';
import { durationLabel } from '../../hooks/useParking';

export default function ProfileScreen() {
  const { profile, loading } = useUserProfile();

  const [name, setName]           = useState('');
  const [tower, setTower]         = useState<'1' | '2' | null>(null);
  const [apartment, setApartment] = useState('');
  const [carNumber, setCarNumber] = useState('');
  const [hasSpot, setHasSpot]     = useState<boolean | null>(null);
  const [spotNumber, setSpotNumber] = useState('');

  const [spotCheck, setSpotCheck] = useState<
    'idle' | 'checking' | 'available' | 'taken' | 'mine'
  >('idle');
  const [spotTakenBy, setSpotTakenBy] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty]   = useState(false);

  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Populate fields from profile ───────────────────────
  useEffect(() => {
    if (!profile) return;
    setName(profile.name ?? '');
    setTower((profile.tower as '1' | '2') ?? null);
    setApartment(profile.apartment ?? '');
    setCarNumber(profile.carNumbers?.[0] ?? '');
    setHasSpot(profile.ownedSpot !== null && profile.ownedSpot !== undefined);
    setSpotNumber(profile.ownedSpot ?? '');
    setSpotCheck(profile.ownedSpot ? 'mine' : 'idle');
  }, [profile]);

  // ── Spot uniqueness check (debounced) ──────────────────
  const handleSpotChange = (text: string) => {
    setSpotNumber(text);
    setDirty(true);

    if (debounce.current) clearTimeout(debounce.current);

    // If same as current saved spot → no need to check
    if (text.trim() === profile?.ownedSpot) {
      setSpotCheck('mine');
      return;
    }

    if (!text.trim()) { setSpotCheck('idle'); return; }

    setSpotCheck('checking');
    debounce.current = setTimeout(async () => {
      try {
        const taken = await checkSpotTaken(text.trim());
        if (taken) {
          setSpotCheck('taken');
          setSpotTakenBy(`דירה ${taken.apartment} מגדל ${taken.tower}`);
        } else {
          setSpotCheck('available');
        }
      } catch {
        setSpotCheck('idle');
      }
    }, 600);
  };

  // ── Validation ─────────────────────────────────────────
  const plateNorm = carNumber.replace(/-/g, '');
  const carValid  = !carNumber.trim() || /^\d{7,8}$/.test(plateNorm);
  const spotReady =
    hasSpot === false ||
    (hasSpot === true && spotNumber.trim() &&
      (spotCheck === 'available' || spotCheck === 'mine'));
  const canSave = dirty && name.trim().length > 1 && tower && apartment.trim() && carValid && spotReady && spotCheck !== 'checking';

  // ── Save ───────────────────────────────────────────────
  const handleSave = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setSaving(true);
    try {
      const updated: Partial<UserProfile> & { updatedAt: any } = {
        name:       name.trim(),
        tower:      tower!,
        apartment:  apartment.trim(),
        carNumbers: carNumber.trim() ? [plateNorm] : [],
        ownedSpot:  hasSpot ? spotNumber.trim() : null,
        updatedAt:  serverTimestamp(),
      };
      await updateDoc(doc(db, 'users', uid), updated);
      setDirty(false);
      Alert.alert('✅ נשמר', 'הפרופיל עודכן בהצלחה');
    } catch {
      Alert.alert('שגיאה', 'לא ניתן לשמור, נסה שוב');
    } finally {
      setSaving(false);
    }
  };

  // ── Sign out ───────────────────────────────────────────
  const handleSignOut = () => {
    Alert.alert('יציאה', 'האם לצאת מהאפליקציה?', [
      { text: 'ביטול', style: 'cancel' },
      { text: 'כן, צא', style: 'destructive', onPress: () => signOut() },
    ]);
  };

  if (loading) {
    return (
      <View style={s.loader}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={s.screen}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.avatar}>
          <Text style={s.avatarText}>{(name || '?').charAt(0).toUpperCase()}</Text>
        </View>
        <View style={s.headerInfo}>
          <Text style={s.headerName}>{name || '—'}</Text>
          <Text style={s.headerMeta}>
            {tower ? `מגדל ${tower}` : ''}{apartment ? ` · דירה ${apartment}` : ''}
          </Text>
          {(profile as any)?.thanksCount > 0 && (
            <View style={s.thanksBadge}>
              <Text style={s.thanksBadgeText}>
                {'🙏 ' + (profile as any).thanksCount + ' תודות'}
              </Text>
            </View>
          )}
        </View>
        <TouchableOpacity onPress={handleSignOut} style={s.signOutBtn}>
          <Text style={s.signOutText}>יציאה</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Personal details ── */}
        <SectionTitle>פרטים אישיים</SectionTitle>

        <Input
          label="שם מלא"
          value={name}
          onChangeText={(t) => { setName(t); setDirty(true); }}
          placeholder="ישראל ישראלי"
          textAlign="right"
          autoCapitalize="words"
        />

        <Text style={s.label}>מגדל</Text>
        <View style={s.toggleRow}>
          {(['1', '2'] as const).map((t) => (
            <TouchableOpacity
              key={t}
              style={[s.toggle, tower === t && s.toggleActive]}
              onPress={() => { setTower(t); setDirty(true); }}
              activeOpacity={0.8}
            >
              <Text style={[s.toggleText, tower === t && s.toggleTextActive]}>מגדל {t}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Input
          label="מספר דירה"
          value={apartment}
          onChangeText={(t) => { setApartment(t); setDirty(true); }}
          placeholder="לדוגמה: 45"
          keyboardType="numeric"
          textAlign="right"
        />

        {/* ── Vehicle ── */}
        <SectionTitle>רכב</SectionTitle>

        <Input
          label="מספר לוחית רישוי (אופציונלי)"
          value={carNumber}
          onChangeText={(t) => { setCarNumber(t); setDirty(true); }}
          placeholder="לדוגמה: 1234567"
          keyboardType="numeric"
          textAlign="right"
          maxLength={8}
          error={carNumber && !carValid ? 'מספר תקין: 7-8 ספרות' : ''}
        />

        {/* ── Parking spot ── */}
        <SectionTitle>חניה צמודה</SectionTitle>

        <View style={s.toggleRow}>
          {([true, false] as const).map((val) => (
            <TouchableOpacity
              key={String(val)}
              style={[s.toggle, hasSpot === val && s.toggleActive]}
              onPress={() => {
                setHasSpot(val);
                setDirty(true);
                if (!val) { setSpotNumber(''); setSpotCheck('idle'); }
              }}
              activeOpacity={0.8}
            >
              <Text style={[s.toggleText, hasSpot === val && s.toggleTextActive]}>
                {val ? '✅ יש לי' : '❌ אין לי'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {hasSpot === true && (
          <>
            <Input
              label="מספר חניה"
              value={spotNumber}
              onChangeText={handleSpotChange}
              placeholder="לדוגמה: 42"
              keyboardType="numeric"
              textAlign="right"
            />
            <SpotStatus status={spotCheck} takenBy={spotTakenBy} spot={spotNumber} />
          </>
        )}

        {/* ── Recurring availability ── */}
        {hasSpot === true && profile?.ownedSpot && (
          <AvailabilitySection profile={profile} />
        )}

        {/* ── Push preferences ── */}
        <SectionTitle>התראות</SectionTitle>
        <View style={s.prefRow}>
          <View style={s.prefInfo}>
            <Text style={s.prefLabel}>התראות כלליות</Text>
            <Text style={s.prefDesc}>קבל התראה כשמישהו מחפש חניה (גם ללא חלון זמינות)</Text>
          </View>
          <Switch
            value={(profile as any)?.pushGeneral !== false}
            onValueChange={async (val) => {
              const uid = auth.currentUser?.uid;
              if (!uid) return;
              await updateDoc(doc(db, 'users', uid), { pushGeneral: val });
            }}
            trackColor={{ true: colors.accent, false: colors.border }}
            thumbColor={colors.textPrimary}
          />
        </View>

        {/* ── Phone (read-only, from auth) ── */}
        <SectionTitle>טלפון</SectionTitle>
        <View style={s.readOnlyRow}>
          <Text style={s.readOnlyLabel}>מספר מאומת</Text>
          <Text style={s.readOnlyValue}>
            {auth.currentUser?.phoneNumber?.replace('+972', '0') ?? '—'}
          </Text>
        </View>
        <Text style={s.readOnlyHint}>לשינוי מספר טלפון יש להתקין מחדש את האפליקציה</Text>

        <View style={{ height: spacing.xl }} />
      </ScrollView>

      {/* Save bar */}
      {dirty && (
        <View style={s.saveBar}>
          <Button
            label="שמור שינויים"
            onPress={handleSave}
            loading={saving}
            disabled={!canSave}
          />
        </View>
      )}
    </View>
  );
}

// ── Availability helpers ───────────────────────────────────

const DAY_LABELS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

function hhmmToDate(hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

function addMinutes(hhmm: string, delta: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  let total = h * 60 + m + delta;
  // clamp to 00:00–23:30
  total = Math.max(0, Math.min(23 * 60 + 30, total));
  const hh = String(Math.floor(total / 60)).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

function isValidTimeRange(from: string, to: string): boolean {
  const [fh, fm] = from.split(':').map(Number);
  const [th, tm] = to.split(':').map(Number);
  return fh * 60 + fm < th * 60 + tm;
}

// ── Availability Section ───────────────────────────────────

function AvailabilitySection({ profile }: { profile: UserProfile }) {
  const { rules, loading } = useMyAvailabilityRules();
  const [modalVisible, setModalVisible] = useState(false);
  const [editingRule, setEditingRule] = useState<AvailabilityRule | null>(null);

  const openAdd = () => { setEditingRule(null); setModalVisible(true); };
  const openEdit = (rule: AvailabilityRule) => { setEditingRule(rule); setModalVisible(true); };

  const handleDelete = (rule: AvailabilityRule) => {
    Alert.alert(
      'מחיקת כלל',
      `למחוק את הכלל ${rule.fromHHMM}–${rule.toHHMM}?`,
      [
        { text: 'ביטול', style: 'cancel' },
        {
          text: 'מחק',
          style: 'destructive',
          onPress: () => deleteAvailabilityRule(rule.id),
        },
      ],
    );
  };

  return (
    <>
      <SectionTitle>זמינות חוזרת</SectionTitle>

      {/* Explanation banner */}
      <View style={av.explanationCard}>
        <View style={av.explanationIconRow}>
          <Text style={av.explanationIcon}>🔔</Text>
        </View>
        <Text style={av.explanationTitle}>למה כדאי להגדיר זמינות?</Text>
        <Text style={av.explanationBody}>
          {'כרגע, כל בקשת חניה שולחת התראה לכל בעלי החניות בבניין.\n\n'}
          {'כשתגדיר מתי החניה שלך פנויה — תקבל התראות רק על בקשות שמתאימות לזמנים שלך, ובשאר הזמן לא תוטרד. השכנים שלא הגדירו זמינות ימשיכו לקבל את כל ההתראות.'}
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginVertical: spacing.md }} />
      ) : rules.length === 0 ? (
        /* Empty state */
        <View style={av.emptyState}>
          <Text style={av.emptyEmoji}>📅</Text>
          <Text style={av.emptyTitle}>לא הגדרת זמינות</Text>
          <Text style={av.emptySubtitle}>הגדר את הזמנים הקבועים שבהם החניה שלך פנויה</Text>
          <TouchableOpacity style={av.addBtn} onPress={openAdd} activeOpacity={0.8}>
            <Text style={av.addBtnText}>+ הוסף כלל זמינות</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {rules.map((rule) => (
            <RuleCard
              key={rule.id}
              rule={rule}
              onEdit={() => openEdit(rule)}
              onDelete={() => handleDelete(rule)}
            />
          ))}
          <TouchableOpacity style={av.addBtn} onPress={openAdd} activeOpacity={0.8}>
            <Text style={av.addBtnText}>+ הוסף כלל זמינות</Text>
          </TouchableOpacity>
        </>
      )}

      <AvailabilityModal
        visible={modalVisible}
        editingRule={editingRule}
        profile={profile}
        onClose={() => setModalVisible(false)}
      />
    </>
  );
}

// ── Rule Card ──────────────────────────────────────────────

function RuleCard({
  rule, onEdit, onDelete,
}: {
  rule: AvailabilityRule;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <View style={av.ruleCard}>
      {/* Top row: time range + status badge */}
      <View style={av.ruleTopRow}>
        <View style={[av.statusBadge, rule.active ? av.statusActive : av.statusInactive]}>
          <Text style={[av.statusText, rule.active ? av.statusTextActive : av.statusTextInactive]}>
            {rule.active ? 'פעיל' : 'מושבת'}
          </Text>
        </View>
        <Text style={av.ruleTime}>{rule.fromHHMM} – {rule.toHHMM}</Text>
      </View>

      {/* Day circles */}
      <View style={av.dayRow}>
        {DAY_LABELS.map((label, idx) => {
          const selected = rule.days.includes(idx);
          return (
            <View
              key={idx}
              style={[av.dayCircle, selected ? av.dayCircleSelected : av.dayCircleUnselected]}
            >
              <Text style={[av.dayCircleText, selected ? av.dayCircleTextSelected : av.dayCircleTextUnselected]}>
                {label}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Action buttons */}
      <View style={av.ruleActions}>
        <TouchableOpacity style={[av.ruleBtn, av.ruleBtnEdit]} onPress={onEdit} activeOpacity={0.8}>
          <Text style={av.ruleBtnEditText}>ערוך</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[av.ruleBtn, av.ruleBtnDelete]} onPress={onDelete} activeOpacity={0.8}>
          <Text style={av.ruleBtnDeleteText}>מחק</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Availability Modal ─────────────────────────────────────

function AvailabilityModal({
  visible, editingRule, profile, onClose,
}: {
  visible: boolean;
  editingRule: AvailabilityRule | null;
  profile: UserProfile;
  onClose: () => void;
}) {
  const [selectedDays, setSelectedDays] = useState<Set<number>>(new Set());
  const [fromTime, setFromTime] = useState('08:00');
  const [toTime, setToTime] = useState('17:00');
  const [saving, setSaving] = useState(false);

  // Populate from editing rule
  useEffect(() => {
    if (editingRule) {
      setSelectedDays(new Set(editingRule.days));
      setFromTime(editingRule.fromHHMM);
      setToTime(editingRule.toHHMM);
    } else {
      setSelectedDays(new Set());
      setFromTime('08:00');
      setToTime('17:00');
    }
  }, [editingRule, visible]);

  const toggleDay = (day: number) => {
    setSelectedDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  };

  const handleDayLongPress = (day: number) => {
    // א׳ (0) → select weekdays 0-4; ו׳ (5) → select weekend 5-6
    if (day === 0) setSelectedDays(new Set([0, 1, 2, 3, 4]));
    else if (day === 5) setSelectedDays(new Set([5, 6]));
  };

  const canSave = selectedDays.size > 0 && isValidTimeRange(fromTime, toTime);

  const durationText = (() => {
    if (!isValidTimeRange(fromTime, toTime)) return '';
    const label = durationLabel(hhmmToDate(fromTime), hhmmToDate(toTime));
    return label ? `${label} ביום` : '';
  })();

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const days = Array.from(selectedDays).sort();
      if (editingRule) {
        await updateAvailabilityRule(editingRule.id, days, fromTime, toTime);
      } else {
        await createAvailabilityRule(
          {
            name: profile.name ?? '',
            apartment: profile.apartment ?? '',
            tower: profile.tower ?? '',
            ownedSpot: profile.ownedSpot ?? '',
          },
          days,
          fromTime,
          toTime,
        );
      }
      onClose();
    } catch {
      Alert.alert('שגיאה', 'לא ניתן לשמור, נסה שוב');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={am.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={am.sheet}>
        <View style={am.handle} />

        <Text style={am.title}>הגדר זמינות חוזרת</Text>
        <Text style={am.subtitle}>בחר ימים ושעות שבהם החניה שלך פנויה</Text>

        {/* Inline tip */}
        <View style={am.tip}>
          <Text style={am.tipText}>💡 תקבל התראות רק על בקשות שמתאימות לזמנים האלה</Text>
        </View>

        {/* Day picker */}
        <Text style={am.sectionLabel}>באילו ימים?</Text>
        <View style={am.dayRow}>
          {DAY_LABELS.map((label, idx) => {
            const selected = selectedDays.has(idx);
            return (
              <TouchableOpacity
                key={idx}
                style={[am.dayCircle, selected ? am.dayCircleSelected : am.dayCircleUnselected]}
                onPress={() => toggleDay(idx)}
                onLongPress={() => handleDayLongPress(idx)}
                activeOpacity={0.7}
              >
                <Text style={[am.dayCircleText, selected ? am.dayCircleTextSelected : am.dayCircleTextUnselected]}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Time picker */}
        <Text style={am.sectionLabel}>באילו שעות?</Text>
        <View style={am.timePickers}>
          {/* toTime on the left (RTL) */}
          <View style={am.timePicker}>
            <Text style={am.timePickerLabel}>עד</Text>
            <View style={am.timeControls}>
              <TouchableOpacity
                style={am.timeArrow}
                onPress={() => setToTime((t) => addMinutes(t, 30))}
                activeOpacity={0.7}
              >
                <Text style={am.timeArrowTxt}>+</Text>
              </TouchableOpacity>
              <Text style={am.timeValue}>{toTime}</Text>
              <TouchableOpacity
                style={am.timeArrow}
                onPress={() => setToTime((t) => addMinutes(t, -30))}
                activeOpacity={0.7}
              >
                <Text style={am.timeArrowTxt}>−</Text>
              </TouchableOpacity>
            </View>
          </View>
          {/* fromTime on the right (RTL) */}
          <View style={am.timePicker}>
            <Text style={am.timePickerLabel}>מ-</Text>
            <View style={am.timeControls}>
              <TouchableOpacity
                style={am.timeArrow}
                onPress={() => setFromTime((t) => addMinutes(t, 30))}
                activeOpacity={0.7}
              >
                <Text style={am.timeArrowTxt}>+</Text>
              </TouchableOpacity>
              <Text style={am.timeValue}>{fromTime}</Text>
              <TouchableOpacity
                style={am.timeArrow}
                onPress={() => setFromTime((t) => addMinutes(t, -30))}
                activeOpacity={0.7}
              >
                <Text style={am.timeArrowTxt}>−</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Duration badge */}
        {durationText ? (
          <View style={am.durationBadge}>
            <Text style={am.durationText}>{durationText}</Text>
          </View>
        ) : null}

        {/* Save button */}
        <TouchableOpacity
          style={[am.saveBtn, !canSave && am.saveBtnDisabled]}
          onPress={handleSave}
          disabled={!canSave || saving}
          activeOpacity={0.8}
        >
          {saving
            ? <ActivityIndicator color={colors.bg} />
            : <Text style={am.saveBtnText}>{editingRule ? 'עדכן כלל' : 'שמור כלל'}</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity style={am.cancelBtn} onPress={onClose} activeOpacity={0.7}>
          <Text style={am.cancelText}>ביטול</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// ── Availability styles ────────────────────────────────────

const av = StyleSheet.create({
  // Explanation banner
  explanationCard: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.accent + '30',
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  explanationIconRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: spacing.sm,
  },
  explanationIcon: { fontSize: 24 },
  explanationTitle: {
    ...typography.body,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'right',
    marginBottom: spacing.sm,
  },
  explanationBody: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 20,
    textAlign: 'right',
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  emptyEmoji: { fontSize: 52 },
  emptyTitle: { ...typography.subtitle, color: colors.textPrimary },
  emptySubtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },

  // Add button
  addBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  addBtnText: { ...typography.body, fontWeight: '700', color: colors.bg },

  // Rule card
  ruleCard: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  ruleTopRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  ruleTime: { ...typography.body, fontWeight: '700', color: colors.textPrimary },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  statusActive: { backgroundColor: colors.success + '20', borderColor: colors.success + '60' },
  statusInactive: { backgroundColor: colors.bgInput, borderColor: colors.border },
  statusText: { ...typography.caption, fontWeight: '600' },
  statusTextActive: { color: colors.success },
  statusTextInactive: { color: colors.textSecondary },

  // Day circles (rule card)
  dayRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  dayCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  dayCircleSelected: { backgroundColor: colors.accentDim, borderColor: colors.accent + '60' },
  dayCircleUnselected: { backgroundColor: 'transparent', borderColor: colors.border },
  dayCircleText: { ...typography.caption, fontWeight: '600' },
  dayCircleTextSelected: { color: colors.accent },
  dayCircleTextUnselected: { color: colors.textSecondary },

  // Rule action buttons
  ruleActions: { flexDirection: 'row', gap: spacing.sm },
  ruleBtn: {
    flex: 1,
    height: 36,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ruleBtnEdit: { backgroundColor: 'transparent', borderColor: colors.border },
  ruleBtnDelete: { backgroundColor: colors.error + '10', borderColor: colors.error + '60' },
  ruleBtnEditText: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  ruleBtnDeleteText: { ...typography.caption, color: colors.error, fontWeight: '600' },
});

// ── Modal styles ───────────────────────────────────────────

const am = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#00000080' },
  sheet: {
    backgroundColor: colors.bgCard,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.lg,
    paddingBottom: 60,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  title: { ...typography.title, color: colors.textPrimary, textAlign: 'right', marginBottom: spacing.sm },
  subtitle: { ...typography.body, color: colors.textSecondary, textAlign: 'right', marginBottom: spacing.md },

  // Tip
  tip: {
    backgroundColor: colors.bgInput,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
  },
  tipText: { ...typography.caption, color: colors.textSecondary, textAlign: 'right' },

  // Section label
  sectionLabel: {
    ...typography.label,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    textAlign: 'right',
    marginBottom: spacing.sm,
  },

  // Day picker
  dayRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  dayCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    flex: 1,
  },
  dayCircleSelected: { backgroundColor: colors.accentDim, borderColor: colors.accent },
  dayCircleUnselected: { backgroundColor: 'transparent', borderColor: colors.border },
  dayCircleText: { ...typography.caption, fontWeight: '700' },
  dayCircleTextSelected: { color: colors.accent },
  dayCircleTextUnselected: { color: colors.textSecondary },

  // Time pickers
  timePickers: {
    flexDirection: 'row-reverse',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  timePicker: {
    flex: 1,
    backgroundColor: colors.bgInput,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: 'center',
    gap: spacing.sm,
  },
  timePickerLabel: { ...typography.caption, color: colors.textSecondary },
  timeControls: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  timeArrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeArrowTxt: { fontSize: 20, color: colors.textPrimary, fontWeight: '300', lineHeight: 24 },
  timeValue: { ...typography.subtitle, color: colors.accent, minWidth: 52, textAlign: 'center' },

  // Duration badge
  durationBadge: {
    alignSelf: 'center',
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: colors.accent + '40',
    borderRadius: radius.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
  },
  durationText: { ...typography.caption, color: colors.accent },

  // Save button
  saveBtn: {
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { ...typography.subtitle, color: colors.bg },

  // Cancel
  cancelBtn: { alignItems: 'center' },
  cancelText: { ...typography.body, color: colors.textSecondary },
});

// ── SpotStatus indicator ───────────────────────────────────
function SpotStatus({
  status, takenBy, spot,
}: {
  status: 'idle' | 'checking' | 'available' | 'taken' | 'mine';
  takenBy: string;
  spot: string;
}) {
  if (!spot.trim() || status === 'idle') return null;
  if (status === 'checking') {
    return (
      <View style={ss.row}>
        <ActivityIndicator size="small" color={colors.textMuted} />
        <Text style={ss.checking}>בודק זמינות...</Text>
      </View>
    );
  }
  const configs = {
    available: { color: colors.success, icon: '✓', text: `חניה ${spot} פנויה` },
    mine:      { color: colors.accent,  icon: '🅿️', text: `חניה ${spot} — החניה שלך` },
    taken:     { color: colors.error,   icon: '✕', text: `חניה ${spot} רשומה על ${takenBy}` },
  } as const;
  const cfg = configs[status as keyof typeof configs];
  if (!cfg) return null;
  return (
    <View style={[ss.banner, { borderColor: cfg.color + '50', backgroundColor: cfg.color + '15' }]}>
      <Text style={[ss.icon, { color: cfg.color }]}>{cfg.icon}</Text>
      <Text style={[ss.text, { color: cfg.color }]}>{cfg.text}</Text>
    </View>
  );
}

const ss = StyleSheet.create({
  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  checking: { ...typography.caption, color: colors.textMuted },
  banner: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm,
    padding: spacing.md, borderRadius: radius.md, borderWidth: 1, marginBottom: spacing.md,
  },
  icon: { fontSize: 14, fontWeight: '800' },
  text: { ...typography.caption, flex: 1, textAlign: 'right' },
});

// ── Helpers ────────────────────────────────────────────────
function SectionTitle({ children }: { children: string }) {
  return <Text style={st.title}>{children}</Text>;
}

const st = StyleSheet.create({
  title: {
    ...typography.label, color: colors.textMuted,
    textTransform: 'uppercase', textAlign: 'right',
    marginTop: spacing.lg, marginBottom: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1, borderColor: colors.border,
  },
});

// ── Styles ─────────────────────────────────────────────────
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  loader: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingTop: 60, paddingBottom: spacing.lg,
    borderBottomWidth: 1, borderColor: colors.border,
  },
  avatar: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 22, fontWeight: '800', color: colors.bg },
  headerInfo: { flex: 1, alignItems: 'flex-end' },
  headerName: { ...typography.subtitle, color: colors.textPrimary },
  headerMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  thanksBadge: {
    marginTop: 4,
    backgroundColor: colors.accent + '20',
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: colors.accent + '60',
    alignSelf: 'flex-end',
  },
  thanksBadgeText: { ...typography.caption, color: colors.accent, fontWeight: '700' },
  signOutBtn: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.full, borderWidth: 1, borderColor: colors.border,
  },
  signOutText: { ...typography.caption, color: colors.textSecondary },

  scroll: { paddingHorizontal: spacing.lg, paddingBottom: 120 },

  label: {
    ...typography.label, color: colors.textSecondary,
    textTransform: 'uppercase', textAlign: 'right', marginBottom: spacing.sm,
  },
  toggleRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  toggle: {
    flex: 1, paddingVertical: spacing.md, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgInput,
    alignItems: 'center',
  },
  toggleActive: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  toggleText: { ...typography.body, color: colors.textSecondary },
  toggleTextActive: { color: colors.accent, fontWeight: '700' },

  readOnlyRow: {
    flexDirection: 'row-reverse', justifyContent: 'space-between',
    alignItems: 'center', backgroundColor: colors.bgInput,
    padding: spacing.md, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm,
  },
  readOnlyLabel: { ...typography.caption, color: colors.textMuted },
  readOnlyValue: { ...typography.body, color: colors.textSecondary },
  readOnlyHint: { ...typography.caption, color: colors.textMuted, textAlign: 'right' },
  prefRow: {
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.bgInput, padding: spacing.md,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm,
    gap: spacing.md,
  },
  prefInfo: { flex: 1, alignItems: 'flex-end' },
  prefLabel: { ...typography.body, color: colors.textPrimary, fontWeight: '600' },
  prefDesc: { ...typography.caption, color: colors.textSecondary, textAlign: 'right', marginTop: 2 },

  saveBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: spacing.lg, paddingBottom: 32,
    backgroundColor: colors.bg, borderTopWidth: 1, borderColor: colors.border,
  },
});
