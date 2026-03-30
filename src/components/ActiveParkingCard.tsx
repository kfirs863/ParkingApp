import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Linking, Alert, Modal, AppState, AppStateStatus,
} from 'react-native';
import {
  doc, updateDoc, increment, addDoc,
  collection, serverTimestamp,
} from 'firebase/firestore';
import { colors, spacing, radius, typography } from '../theme';
import { ParkingRequest, cancelRequest } from '../hooks/useParking';
import { auth, db } from '../config/firebase';

// ─── Countdown hook — AppState-aware ─────────────────────
// Re-calculates from Date.now() when app returns to foreground,
// so a sleeping interval doesn't cause drift.
function useCountdown(toTime: Date) {
  const calc = () => Math.max(0, toTime.getTime() - Date.now());
  const [msLeft, setMsLeft] = useState(calc);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const restart = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setMsLeft(calc());
    intervalRef.current = setInterval(() => setMsLeft(calc()), 1000);
  };

  useEffect(() => {
    restart();

    // When app comes back to foreground, recalculate immediately
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') restart();
    });

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      sub.remove();
    };
  }, [toTime]);

  const totalSecs = Math.floor(msLeft / 1000);
  const hours   = Math.floor(totalSecs / 3600);
  const minutes = Math.floor((totalSecs % 3600) / 60);
  const seconds = totalSecs % 60;

  return {
    hours, minutes, seconds, msLeft,
    expired: msLeft === 0,
    urgency: msLeft < 10 * 60 * 1000,   // last 10 minutes
    display: hours > 0
      ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
      : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
  };
}

// ─── Phone call helper ────────────────────────────────────
function callPhone(phone: string) {
  const url = `tel:${phone}`;
  Linking.canOpenURL(url).then((can) => {
    if (can) Linking.openURL(url);
    else Alert.alert('שגיאה', 'לא ניתן לחייג ממכשיר זה');
  });
}

// ─── Send Thanks ──────────────────────────────────────────
async function sendThanks(session: ParkingRequest): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid || !session.ownerId) return;
  await updateDoc(doc(db, 'users', session.ownerId), {
    thanksCount: increment(1),
  });
  await addDoc(collection(db, 'thanks'), {
    fromUid: uid,
    toUid: session.ownerId,
    toName: session.ownerName,
    requestId: session.id,
    spotNumber: session.spotNumber,
    createdAt: serverTimestamp(),
  });
  // TODO: FCM push to owner: "תודה מ-[שם]!"
}

// ─── Send Ping (reminder to vacate) ──────────────────────
// Owner sends a gentle nudge to the requester in the last 10 minutes
const PING_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes between pings

async function sendPing(session: ParkingRequest): Promise<void> {
  // Write a ping document — Cloud Function picks it up and sends push
  await addDoc(collection(db, 'parkingPings'), {
    requestId: session.id,
    toUid:     session.requesterId,
    fromUid:   auth.currentUser?.uid,
    spotNumber: session.spotNumber,
    toTime:    session.toTime,
    createdAt: serverTimestamp(),
  });
}

// ─── ActiveParkingCard ────────────────────────────────────
interface Props { session: ParkingRequest }

export default function ActiveParkingCard({ session }: Props) {
  const uid          = auth.currentUser?.uid;
  const isOwner      = session.ownerId    === uid;
  const isRequester  = session.requesterId === uid;

  const { display, urgency, expired, hours, minutes, seconds } = useCountdown(session.toTime);
  const [expanded, setExpanded]     = useState(false);
  const [thanksSent, setThanksSent] = useState(false);
  const [lastPingAt, setLastPingAt] = useState<number>(0);
  const canPing = urgency && isOwner && (Date.now() - lastPingAt > PING_COOLDOWN_MS);

  // ─── Collapsed pill ───────────────────────────────────
  const CollapsedPill = () => (
    <TouchableOpacity
      style={[styles.pill, urgency && styles.pillUrgent]}
      onPress={() => setExpanded(true)}
      activeOpacity={0.85}
    >
      <View style={[styles.pillDot, urgency && styles.pillDotUrgent]} />
      <Text style={styles.pillLabel}>
        {isOwner ? `חניה ${session.spotNumber} תפוסה` : `חניה ${session.spotNumber} שלך`}
      </Text>
      <View style={styles.pillSpacer} />
      <Text style={[styles.pillTimer, urgency && styles.pillTimerUrgent]}>
        {expired ? 'הסתיים' : display}
      </Text>
      <Text style={styles.pillChevron}>›</Text>
    </TouchableOpacity>
  );

  // ─── Expanded Modal ───────────────────────────────────
  const ExpandedModal = () => (
    <Modal visible={expanded} transparent animationType="slide" onRequestClose={() => setExpanded(false)}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setExpanded(false)} />
      <View style={styles.sheet}>
        <View style={styles.handle} />

        <Text style={styles.sheetTitle}>
          {isOwner ? 'מי חונה אצלך?' : 'פרטי החניה שלך'}
        </Text>

        {/* Clock */}
        <View style={[styles.clock, urgency && styles.clockUrgent]}>
          <Text style={styles.clockLabel}>{expired ? 'הסתיים' : 'זמן שנותר'}</Text>
          <View style={styles.clockDigits}>
            {hours > 0 && (
              <>
                <DigitBlock value={hours} unit="ש'" urgency={urgency} />
                <Text style={styles.clockColon}>:</Text>
              </>
            )}
            <DigitBlock value={minutes} unit="דק'" urgency={urgency} />
            <Text style={styles.clockColon}>:</Text>
            <DigitBlock value={seconds} unit="שנ'" urgency={urgency} />
          </View>
          <Text style={styles.clockUntil}>
            {'עד ' + session.toTime.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>

        {/* Ping button — only for owner in last 10 mins */}
        {isOwner && urgency && (
          <TouchableOpacity
            style={[styles.pingBtn, !canPing && styles.pingBtnDisabled]}
            onPress={async () => {
              if (!canPing) return;
              try {
                await sendPing(session);
                setLastPingAt(Date.now());
                Alert.alert('נשלחה תזכורת', 'הדייר קיבל בקשה עדינה לפנות את החניה.');
              } catch {
                Alert.alert('שגיאה', 'לא ניתן לשלוח תזכורת');
              }
            }}
            activeOpacity={canPing ? 0.85 : 1}
          >
            <Text style={styles.pingBtnText}>
              {canPing ? '🔔 שלח תזכורת עדינה לפינוי' : '🔔 תזכורת נשלחה'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Details */}
        <View style={styles.detailsCard}>
          <DetailRow icon="🅿️" label="מספר חניה" value={session.spotNumber ?? '—'} accent />
          <View style={styles.divider} />
          {isOwner ? (
            <>
              <DetailRow icon="👤" label="החונה"      value={session.requesterName} />
              <DetailRow icon="🚗" label="מספר רכב"   value={formatPlate(session.carNumber ?? '')} accent />
              <DetailRow icon="🏠" label="דירה"       value={`דירה ${session.requesterApartment} · מגדל ${session.requesterTower}`} />
            </>
          ) : (
            <>
              <DetailRow icon="👤" label="בעל החניה"  value={session.ownerName ?? '—'} />
              <DetailRow icon="🏠" label="דירה"       value={`דירה ${session.ownerApartment} · מגדל ${session.ownerTower}`} />
              {session.ownerPhone && (
                <TouchableOpacity onPress={() => callPhone(session.ownerPhone!)}>
                  <DetailRow icon="📞" label="טלפון" value={formatPhone(session.ownerPhone)} tappable />
                </TouchableOpacity>
              )}
              <View style={styles.divider} />
              <DetailRow icon="🚗" label="הרכב שלך" value={formatPlate(session.carNumber ?? '')} accent />
            </>
          )}
        </View>

        {/* Thanks — requester only */}
        {isRequester && !isOwner && (
          <TouchableOpacity
            style={[styles.thanksBtn, thanksSent && styles.thanksBtnSent]}
            disabled={thanksSent}
            onPress={async () => {
              try {
                await sendThanks(session);
                setThanksSent(true);
              } catch {
                Alert.alert('שגיאה', 'לא ניתן לשלוח תודה');
              }
            }}
            activeOpacity={0.85}
          >
            <Text style={styles.thanksBtnText}>
              {thanksSent ? 'תודה נשלחה!' : `תודה ל-${session.ownerName}!`}
            </Text>
          </TouchableOpacity>
        )}

        {/* End early */}
        <TouchableOpacity
          style={styles.endBtn}
          onPress={() => {
            Alert.alert(
              'סיום מוקדם',
              isOwner ? 'לסיים את השימוש בחניה?' : 'לבטל ולפנות את החניה?',
              [
                { text: 'ביטול', style: 'cancel' },
                { text: 'כן, סיים', style: 'destructive', onPress: () => cancelRequest(session.id) },
              ]
            );
          }}
          activeOpacity={0.8}
        >
          <Text style={styles.endBtnText}>
            {isOwner ? 'החניה פנויה שוב' : 'יצאתי מהחניה'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setExpanded(false)} style={styles.closeBtn}>
          <Text style={styles.closeBtnText}>סגור</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );

  return (
    <>
      <CollapsedPill />
      <ExpandedModal />
    </>
  );
}

// ─── Sub-components ───────────────────────────────────────

function DigitBlock({ value, unit, urgency }: { value: number; unit: string; urgency: boolean }) {
  return (
    <View style={db.wrap}>
      <Text style={[db.num, urgency && db.numUrgent]}>{String(value).padStart(2, '0')}</Text>
      <Text style={db.unit}>{unit}</Text>
    </View>
  );
}
const db = StyleSheet.create({
  wrap: { alignItems: 'center', minWidth: 52 },
  num: { fontSize: 40, fontWeight: '800', color: colors.textPrimary, lineHeight: 44 },
  numUrgent: { color: colors.error },
  unit: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
});

function DetailRow({ icon, label, value, accent, tappable }: {
  icon: string; label: string; value: string; accent?: boolean; tappable?: boolean;
}) {
  return (
    <View style={dr.row}>
      <View style={dr.left}>
        <Text style={dr.label}>{label}</Text>
        <Text style={[dr.value, accent && dr.valueAccent, tappable && dr.valueTappable]}>
          {value}
        </Text>
      </View>
      <Text style={dr.icon}>{icon}</Text>
    </View>
  );
}
const dr = StyleSheet.create({
  row: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm },
  icon: { fontSize: 20, width: 30, textAlign: 'center' },
  left: { flex: 1, alignItems: 'flex-end', paddingRight: spacing.sm },
  label: { ...typography.caption, color: colors.textMuted },
  value: { ...typography.subtitle, color: colors.textPrimary, marginTop: 2 },
  valueAccent: { color: colors.accent },
  valueTappable: { color: colors.success, textDecorationLine: 'underline' },
});

// ─── Format helpers ───────────────────────────────────────

function formatPlate(raw: string): string {
  const d = raw.replace(/\D/g, '');
  if (d.length === 7) return `${d.slice(0,2)}-${d.slice(2,5)}-${d.slice(5)}`;
  if (d.length === 8) return `${d.slice(0,3)}-${d.slice(3,5)}-${d.slice(5)}`;
  return raw;
}

function formatPhone(raw: string): string {
  const local = raw.startsWith('+972') ? '0' + raw.slice(4) : raw;
  if (local.length === 10) return `${local.slice(0,3)}-${local.slice(3,6)}-${local.slice(6)}`;
  return local;
}

// ─── Styles ───────────────────────────────────────────────
const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row-reverse', alignItems: 'center',
    backgroundColor: colors.bgCard, marginHorizontal: spacing.lg, marginBottom: spacing.md,
    padding: spacing.md, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.success + '60', gap: spacing.sm,
  },
  pillUrgent: { borderColor: colors.error + '80', backgroundColor: colors.error + '10' },
  pillDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  pillDotUrgent: { backgroundColor: colors.error },
  pillLabel: { ...typography.body, color: colors.textPrimary, fontWeight: '600' },
  pillSpacer: { flex: 1 },
  pillTimer: { ...typography.subtitle, color: colors.success, fontVariant: ['tabular-nums'] },
  pillTimerUrgent: { color: colors.error },
  pillChevron: { fontSize: 20, color: colors.textMuted, fontWeight: '300' },

  backdrop: { flex: 1, backgroundColor: '#00000080' },
  sheet: {
    backgroundColor: colors.bgCard,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: spacing.lg, paddingBottom: 40,
    borderTopWidth: 1, borderColor: colors.border,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: colors.border, alignSelf: 'center', marginBottom: spacing.lg,
  },
  sheetTitle: { ...typography.title, color: colors.textPrimary, textAlign: 'right', marginBottom: spacing.lg },

  clock: {
    alignItems: 'center', backgroundColor: colors.bgInput,
    borderRadius: radius.lg, paddingVertical: spacing.lg, paddingHorizontal: spacing.xl,
    marginBottom: spacing.md, borderWidth: 1, borderColor: colors.success + '40', gap: spacing.sm,
  },
  clockUrgent: { borderColor: colors.error + '60', backgroundColor: colors.error + '10' },
  clockLabel: { ...typography.label, color: colors.textMuted, textTransform: 'uppercase' },
  clockDigits: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  clockColon: { fontSize: 32, fontWeight: '800', color: colors.textMuted, marginBottom: 8 },
  clockUntil: { ...typography.caption, color: colors.textSecondary },

  pingBtn: {
    backgroundColor: colors.error + '20', borderWidth: 1, borderColor: colors.error + '60',
    borderRadius: radius.lg, paddingVertical: spacing.md,
    alignItems: 'center', marginBottom: spacing.sm,
  },
  pingBtnDisabled: { opacity: 0.45 },
  pingBtnText: { ...typography.body, color: colors.error, fontWeight: '600' },

  detailsCard: {
    backgroundColor: colors.bgInput, borderRadius: radius.lg,
    paddingHorizontal: spacing.md, marginBottom: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xs },

  thanksBtn: {
    borderRadius: radius.lg, paddingVertical: spacing.md,
    alignItems: 'center', marginBottom: spacing.sm, backgroundColor: colors.accent,
  },
  thanksBtnSent: { backgroundColor: colors.accentDim, borderWidth: 1, borderColor: colors.accent },
  thanksBtnText: { ...typography.subtitle, color: colors.bg },

  endBtn: {
    borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg, paddingVertical: spacing.md,
    alignItems: 'center', marginBottom: spacing.sm,
  },
  endBtnText: { ...typography.body, color: colors.textSecondary, fontWeight: '600' },
  closeBtn: { alignItems: 'center', paddingVertical: spacing.sm },
  closeBtnText: { ...typography.body, color: colors.textMuted },
});
