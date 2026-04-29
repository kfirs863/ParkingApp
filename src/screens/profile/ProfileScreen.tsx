import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Switch, Modal,
} from 'react-native';

import { FLOORS, ParkingFloor, buildSpotId, parseSpotId } from '../../utils/spotId';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, signOut, useUserProfile, checkSpotTaken, claimSpot, releaseSpot, SpotTakenError, UserProfile } from '../../config/firebase';
import { towerLabel } from '../../utils/towerLabel';
import { Button, Input } from '../../components';
import { colors, spacing, radius, typography } from '../../theme';
import {
  useMyAvailabilityRules, createAvailabilityRule, updateAvailabilityRule,
  deleteAvailabilityRule, AvailabilityRule,
} from '../../hooks/useAvailabilityRules';
import { durationLabel } from '../../hooks/useParking';
import { showAlert, showConfirm } from '../../utils/alert';

export default function ProfileScreen() {
  const { profile, loading } = useUserProfile();

  const [name, setName]           = useState('');
  const [tower, setTower]         = useState<'1' | '2' | null>(null);
  const [apartment, setApartment] = useState('');
  const [carNumber, setCarNumber] = useState('');
  const [hasSpot, setHasSpot]     = useState<boolean | null>(null);
  const [spotFloor, setSpotFloor] = useState<ParkingFloor | null>(null);
  const [spotNumber, setSpotNumber] = useState('');

  const [spotCheck, setSpotCheck] = useState<
    'idle' | 'checking' | 'available' | 'taken' | 'mine'
  >('idle');
  const [spotTakenBy, setSpotTakenBy] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty]   = useState(false);

  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  useEffect(() => { return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    if (!profile) return;
    setName(profile.name ?? '');
    setTower((profile.tower as '1' | '2') ?? null);
    setApartment(profile.apartment ?? '');
    setCarNumber(profile.carNumbers?.[0] ?? '');
    setHasSpot(profile.ownedSpot !== null && profile.ownedSpot !== undefined);
    const parsed = parseSpotId(profile.ownedSpot ?? '');
    setSpotFloor(parsed.floor);
    setSpotNumber(parsed.number);
    setSpotCheck(profile.ownedSpot ? 'mine' : 'idle');
  }, [profile]);

  const triggerSpotCheck = (floor: ParkingFloor | null, number: string) => {
    if (debounce.current) clearTimeout(debounce.current);
    if (!floor || !number.trim()) { setSpotCheck('idle'); return; }

    const spotId = buildSpotId(floor, number);

    if (spotId === profile?.ownedSpot) {
      setSpotCheck('mine');
      return;
    }

    setSpotCheck('checking');
    debounce.current = setTimeout(async () => {
      try {
        const taken = await checkSpotTaken(spotId);
        if (!mounted.current) return;
        if (taken) {
          setSpotCheck('taken');
          setSpotTakenBy(`דירה ${taken.apartment} ${towerLabel(taken.tower)}`);
        } else {
          setSpotCheck('available');
        }
      } catch {
        if (!mounted.current) return;
        setSpotCheck('idle');
      }
    }, 600);
  };

  const handleFloorSelect = (floor: ParkingFloor) => {
    setSpotFloor(floor);
    setDirty(true);
    triggerSpotCheck(floor, spotNumber);
  };

  const handleSpotChange = (text: string) => {
    setSpotNumber(text);
    setDirty(true);
    triggerSpotCheck(spotFloor, text);
  };

  const plateNorm = carNumber.replace(/-/g, '');
  const carValid  = !carNumber.trim() || /^\d{7,8}$/.test(plateNorm);
  const spotReady =
    hasSpot === false ||
    (hasSpot === true && spotFloor !== null && spotNumber.trim() &&
      (spotCheck === 'available' || spotCheck === 'mine'));
  const canSave = dirty && name.trim().length > 1 && tower && apartment.trim() && carValid && spotReady && spotCheck !== 'checking';

  const handleSave = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setSaving(true);
    const oldSpot = profile?.ownedSpot ?? null;
    const newSpot = hasSpot && spotFloor ? buildSpotId(spotFloor, spotNumber) : null;
    let claimedNewSpot = false;
    try {
      // If switching to a different spot (or first time claiming), try to lock the
      // new sentinel doc before any user-doc write so two users can't end up owners.
      if (newSpot && newSpot !== oldSpot) {
        await claimSpot(newSpot);
        claimedNewSpot = true;
      }
      const updated: Partial<UserProfile> & { updatedAt: any } = {
        name:       name.trim(),
        tower:      tower!,
        apartment:  apartment.trim(),
        carNumbers: carNumber.trim() ? [plateNorm] : [],
        ownedSpot:  newSpot,
        updatedAt:  serverTimestamp(),
      };
      await updateDoc(doc(db, 'users', uid), updated);
      // Release the old lock only after the user doc has been updated, so a
      // crash mid-flow leaves us with a strict superset of locks (safe).
      if (oldSpot && oldSpot !== newSpot) {
        await releaseSpot(oldSpot);
      }
      setDirty(false);
      showAlert('✅ נשמר', 'הפרופיל עודכן בהצלחה');
    } catch (e) {
      if (claimedNewSpot && newSpot) {
        // Roll back the lock we just took so we don't strand it.
        await releaseSpot(newSpot);
      }
      if (e instanceof SpotTakenError) {
        showAlert('חניה תפוסה', 'מישהו אחר רשם את החניה הזו ממש כרגע. בחר חניה אחרת.');
      } else {
        showAlert('שגיאה', 'לא ניתן לשמור, נסה שוב');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = () => {
    showConfirm(
      'יציאה',
      'האם לצאת מהאפליקציה?',
      () => signOut(),
      'כן, צא',
      'ביטול',
      true
    );
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
      <View style={s.header}>
        <View style={s.avatar}>
          <Text style={s.avatarText}>{(name || '?').charAt(0).toUpperCase()}</Text>
        </View>
        <View style={s.headerInfo}>
          <Text style={s.headerName}>{name || '—'}</Text>
          <Text style={s.headerMeta}>
            {tower ? towerLabel(tower) : ''}{apartment ? ` · דירה ${apartment}` : ''}
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
              <Text style={[s.toggleText, tower === t && s.toggleTextActive]}>{towerLabel(t)}</Text>
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

        <SectionTitle>חניה צמודה</SectionTitle>

        <View style={s.toggleRow}>
          {([true, false] as const).map((val) => (
            <TouchableOpacity
              key={String(val)}
              style={[s.toggle, hasSpot === val && s.toggleActive]}
              onPress={() => {
                setHasSpot(val);
                setDirty(true);
                if (!val) { setSpotFloor(null); setSpotNumber(''); setSpotCheck('idle'); }
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
            <Text style={s.spotSubLabel}>קומת חניה</Text>
            <View style={s.floorRow}>
              {FLOORS.map((f) => (
                <TouchableOpacity
                  key={f}
                  style={[s.floorBtn, spotFloor === f && s.floorBtnActive]}
                  onPress={() => handleFloorSelect(f)}
                  activeOpacity={0.8}
                >
                  <Text style={[s.floorBtnText, spotFloor === f && s.floorBtnTextActive]}>{f}</Text>
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
            <SpotStatus
              status={spotCheck}
              takenBy={spotTakenBy}
              spot={spotFloor && spotNumber.trim() ? `${spotFloor}-${spotNumber.trim()}` : spotNumber}
            />
          </>
        )}

        {hasSpot === true && profile?.ownedSpot && (
          <AvailabilitySection profile={profile} />
        )}

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

function AvailabilitySection({ profile }: { profile: UserProfile }) {
  const { rules, loading } = useMyAvailabilityRules();
  const [modalVisible, setModalVisible] = useState(false);
  const [editingRule, setEditingRule] = useState<AvailabilityRule | null>(null);

  const openAdd = () => { setEditingRule(null); setModalVisible(true); };
  const openEdit = (rule: AvailabilityRule) => { setEditingRule(rule); setModalVisible(true); };

  const handleDelete = (rule: AvailabilityRule) => {
    showConfirm(
      'מחיקת כלל',
      `למחוק את הכלל ${rule.fromHHMM}–${rule.toHHMM}?`,
      () => deleteAvailabilityRule(rule.id),
      'מחק',
      'ביטול',
      true
    );
  };

  return (
    <>
      <SectionTitle>זמינות חוזרת</SectionTitle>

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

function RuleCard({
  rule, onEdit, onDelete,
}: {
  rule: AvailabilityRule;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <View style={av.ruleCard}>
      <View style={av.ruleTopRow}>
        <View style={[av.statusBadge, rule.active ? av.statusActive : av.statusInactive]}>
          <Text style={[av.statusText, rule.active ? av.statusTextActive : av.statusTextInactive]}>
            {rule.active ? 'פעיל' : 'מושבת'}
          </Text>
        </View>
        <Text style={av.ruleTime}>{rule.fromHHMM} – {rule.toHHMM}</Text>
      </View>

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
  const safeClose = () => { if (saving) return; onClose(); };

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
      showAlert('שגיאה', 'לא ניתן לשמור, נסה שוב');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={safeClose}>
      <TouchableOpacity style={am.backdrop} activeOpacity={1} onPress={safeClose} disabled={saving} />
      <View style={am.sheet}>
        <View style={am.handle} />

        <Text style={am.title}>הגדר זמינות חוזרת</Text>
        <Text style={am.subtitle}>בחר ימים ושעות שבהם החניה שלך פנויה</Text>

        <View style={am.tip}>
          <Text style={am.tipText}>💡 תקבל התראות רק על בקשות שמתאימות לזמנים האלה</Text>
        </View>

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

        <Text style={am.sectionLabel}>באילו שעות?</Text>
        <View style={am.timePickers}>
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

        {durationText ? (
          <View style={am.durationBadge}>
            <Text style={am.durationText}>{durationText}</Text>
          </View>
        ) : null}

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

        <TouchableOpacity style={am.cancelBtn} onPress={safeClose} disabled={saving} activeOpacity={0.7}>
          <Text style={am.cancelText}>ביטול</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const av = StyleSheet.create({
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
  tip: {
    backgroundColor: colors.bgInput,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
  },
  tipText: { ...typography.caption, color: colors.textSecondary, textAlign: 'right' },
  sectionLabel: {
    ...typography.label,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    textAlign: 'right',
    marginBottom: spacing.sm,
  },
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
  cancelBtn: { alignItems: 'center' },
  cancelText: { ...typography.body, color: colors.textSecondary },
});

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
