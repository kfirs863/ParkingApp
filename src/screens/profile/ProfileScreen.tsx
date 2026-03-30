import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, Switch,
} from 'react-native';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { auth, db, useUserProfile, checkSpotTaken, UserProfile } from '../../config/firebase';
import { Button, Input } from '../../components';
import { colors, spacing, radius, typography } from '../../theme';

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
      { text: 'כן, צא', style: 'destructive', onPress: () => signOut(auth) },
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
              const { doc: fDoc, updateDoc: fUpdate } = await import('firebase/firestore');
              const { db: fDb } = await import('../../config/firebase');
              await fUpdate(fDoc(fDb, 'users', uid), { pushGeneral: val });
              setDirty(false); // preference saved immediately, not via main save
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
