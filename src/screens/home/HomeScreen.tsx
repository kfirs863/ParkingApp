import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
  TouchableOpacity, ActivityIndicator, Alert, Modal,
} from 'react-native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useRoute, RouteProp } from '@react-navigation/native';
import { MainTabParamList } from '../../navigation/MainNavigator';
import { colors, spacing, radius, typography } from '../../theme';
import {
  useOpenRequests, useMyRequests,
  approveRequest, cancelApproval, confirmParking, cancelRequest,
  formatTimeRange, durationLabel, timeUntil, statusMeta,
  ParkingRequest,
} from '../../hooks/useParking';
import { auth, useUserProfile } from '../../config/firebase';
import { Input } from '../../components';
import { ActiveParkingCard } from '../../components/ActiveParkingCard';
import { useActiveParking } from '../../hooks/useParking';

type Props = { navigation: BottomTabNavigationProp<MainTabParamList, 'Home'> };

// ─── Approve Modal ────────────────────────────────────────
// Spot number is read from the owner's saved profile — no manual input
function ApproveModal({
  request, visible, onClose, ownerProfile,
}: {
  request: ParkingRequest | null;
  visible: boolean;
  onClose: () => void;
  ownerProfile: { name: string; apartment: string; tower: string; ownedSpot: string | null } | null;
}) {
  const [loading, setLoading] = useState(false);
  if (!request || !ownerProfile) return null;

  // Owner has no spot registered
  if (!ownerProfile.ownedSpot) {
    return (
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <TouchableOpacity style={m.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={m.sheet}>
          <View style={m.handle} />
          <Text style={m.title}>לא ניתן לאשר</Text>
          <Text style={m.sub}>
            {`לא רשום לך מספר חניה בפרופיל.\nעדכן את הפרופיל שלך כדי לאשר בקשות.`}
          </Text>
          <TouchableOpacity onPress={onClose} style={m.cancel}>
            <Text style={[m.cancelText, { color: colors.accent }]}>סגור</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    );
  }

  const handleApprove = async () => {
    setLoading(true);
    try {
      await approveRequest(request.id, {
        name: ownerProfile.name,
        apartment: ownerProfile.apartment,
        tower: ownerProfile.tower,
        spotNumber: ownerProfile.ownedSpot!,
      });
      onClose();
      Alert.alert('אישרת!', request.requesterName + ' יקבל/ת התראה ויכנס/תכנס מספר רכב.');
    } catch (e: any) {
      if (e?.message === 'ALREADY_TAKEN') {
        Alert.alert('מאוחר מדי', 'מישהו אחר כבר אישר את הבקשה הזו.');
      } else {
        Alert.alert('שגיאה', 'לא ניתן לשלוח אישור');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={m.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={m.sheet}>
        <View style={m.handle} />
        <Text style={m.title}>אשר חניה</Text>
        <Text style={m.sub}>
          {'לבקשה של '}
          <Text style={{ color: colors.accent }}>{request.requesterName}</Text>
          {'\n'}{'דירה ' + request.requesterApartment + ' \u00b7 מגדל ' + request.requesterTower}
          {'\n'}{formatTimeRange(request.fromTime, request.toTime)}
        </Text>

        {/* Spot info — read-only from profile */}
        <View style={m.spotDisplay}>
          <View style={m.spotBadge}>
            <Text style={m.spotBadgeLbl}>חניה</Text>
            <Text style={m.spotBadgeNum}>{ownerProfile.ownedSpot}</Text>
          </View>
          <View style={m.spotInfo}>
            <Text style={m.spotInfoTitle}>החניה שלך</Text>
            <Text style={m.spotInfoSub}>{'מגדל ' + ownerProfile.tower + ' \u00b7 דירה ' + ownerProfile.apartment}</Text>
          </View>
          <View style={m.lockedBadge}>
            <Text style={m.lockedText}>מהפרופיל</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[m.btn, loading && { opacity: 0.5 }]}
          onPress={handleApprove}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color={colors.bg} />
            : <Text style={m.btnText}>אשר ושלח התראה</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={onClose} style={m.cancel}>
          <Text style={m.cancelText}>ביטול</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const m = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#00000080' },
  sheet: {
    backgroundColor: colors.bgCard,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: spacing.lg, paddingBottom: 40,
    borderTopWidth: 1, borderColor: colors.border,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: colors.border, alignSelf: 'center', marginBottom: spacing.lg,
  },
  title: { ...typography.title, color: colors.textPrimary, textAlign: 'right', marginBottom: spacing.sm },
  sub: { ...typography.body, color: colors.textSecondary, textAlign: 'right', lineHeight: 22, marginBottom: spacing.lg },
  label: { ...typography.label, color: colors.textSecondary, textAlign: 'right', textTransform: 'uppercase', marginBottom: spacing.sm },

  // Spot display
  spotDisplay: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.bgInput, padding: spacing.md,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.accent + '40',
    marginBottom: spacing.lg,
  },
  spotBadge: {
    width: 52, height: 52, borderRadius: radius.md,
    backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center',
  },
  spotBadgeLbl: { fontSize: 9, fontWeight: '700', color: colors.bg },
  spotBadgeNum: { fontSize: 20, fontWeight: '900', color: colors.bg },
  spotInfo: { flex: 1, alignItems: 'flex-end' },
  spotInfoTitle: { ...typography.subtitle, color: colors.textPrimary },
  spotInfoSub: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  lockedBadge: {
    backgroundColor: colors.bgCard, paddingHorizontal: spacing.sm,
    paddingVertical: 4, borderRadius: radius.full,
    borderWidth: 1, borderColor: colors.border,
  },
  lockedText: { ...typography.caption, color: colors.textMuted },

  btn: {
    height: 56, borderRadius: radius.lg,
    backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center',
  },
  btnText: { ...typography.subtitle, color: colors.bg },
  cancel: { alignItems: 'center', marginTop: spacing.md },
  cancelText: { ...typography.body, color: colors.textSecondary },
});

// ─── Confirm Car Modal ────────────────────────────────────
function ConfirmCarModal({
  request, visible, onClose,
}: {
  request: ParkingRequest | null;
  visible: boolean;
  onClose: () => void;
}) {
  const [carNumber, setCarNumber] = useState('');
  const [loading, setLoading] = useState(false);

  // Reset form state when a different request is opened
  useEffect(() => {
    if (visible) { setCarNumber(''); setLoading(false); }
  }, [visible, request?.id]);

  if (!request) return null;

  const handleConfirm = async () => {
    if (!carNumber.trim() || carNumber.replace(/-/g, '').length < 7) {
      Alert.alert('שגיאה', 'הכנס מספר לוחית תקין (7-8 ספרות)');
      return;
    }
    setLoading(true);
    try {
      await confirmParking(request.id, carNumber);
      onClose();
      Alert.alert('מעולה!', 'חניה ' + request.spotNumber + ' מאושרת. כנס/י לחנות!');
    } catch {
      Alert.alert('שגיאה', 'לא ניתן לאשר, נסה שוב');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={m.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={m.sheet}>
        <View style={m.handle} />
        <View style={cc.banner}>
          <Text style={cc.bannerEmoji}>🎉</Text>
          <Text style={cc.bannerTitle}>הבקשה אושרה!</Text>
          <Text style={cc.bannerSub}>
            {'חניה '}
            <Text style={{ color: colors.accent, fontWeight: '700' }}>{request.spotNumber}</Text>
            {'\n'}{'של ' + request.ownerName + ' (דירה ' + request.ownerApartment + ', מגדל ' + request.ownerTower + ')'}
          </Text>
        </View>
        <Text style={m.label}>הכנס מספר לוחית הרישוי שלך</Text>
        <Input
          value={carNumber}
          onChangeText={setCarNumber}
          placeholder="לדוגמה: 1234567"
          keyboardType="numeric"
          textAlign="right"
          maxLength={8}
        />
        <TouchableOpacity
          style={[m.btn, loading && { opacity: 0.5 }]}
          onPress={handleConfirm}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color={colors.bg} />
            : <Text style={m.btnText}>אשר ורוץ לחנות! 🚗</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={onClose} style={m.cancel}>
          <Text style={m.cancelText}>אחר כך</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const cc = StyleSheet.create({
  banner: {
    alignItems: 'center', backgroundColor: colors.bgInput,
    borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.lg,
    borderWidth: 1, borderColor: colors.success + '40', gap: spacing.sm,
  },
  bannerEmoji: { fontSize: 36 },
  bannerTitle: { ...typography.subtitle, color: colors.success },
  bannerSub: { ...typography.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },
});

// ─── CancelApprovalRow ────────────────────────────────────
// Shown to owner on their approved request — disappears after 2 minutes
function CancelApprovalRow({ requestId, approvedAt }: { requestId: string; approvedAt?: Date }) {
  const [secsLeft, setSecsLeft] = React.useState(() => {
    if (!approvedAt) return 0;
    return Math.max(0, 120 - Math.floor((Date.now() - approvedAt.getTime()) / 1000));
  });

  useEffect(() => {
    if (secsLeft <= 0) return;
    const t = setInterval(() => setSecsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [secsLeft]);

  if (secsLeft <= 0) return null;

  const handleCancel = () => {
    Alert.alert('בטל אישור', 'לבטל את האישור ולהחזיר את הבקשה לפיד?', [
      { text: 'לא', style: 'cancel' },
      {
        text: 'כן, בטל',
        style: 'destructive',
        onPress: async () => {
          try {
            await cancelApproval(requestId);
          } catch (e: any) {
            const msg = e?.message === 'CANCEL_WINDOW_EXPIRED'
              ? 'חלף חלון הביטול (2 דקות)'
              : 'לא ניתן לבטל';
            Alert.alert('שגיאה', msg);
          }
        },
      },
    ]);
  };

  return (
    <TouchableOpacity style={car.btn} onPress={handleCancel} activeOpacity={0.8}>
      <Text style={car.text}>בטל אישור</Text>
      <View style={car.timer}>
        <Text style={car.timerText}>{secsLeft}שנ'</Text>
      </View>
    </TouchableOpacity>
  );
}

const car = StyleSheet.create({
  btn: {
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, marginTop: spacing.sm,
    borderWidth: 1, borderColor: colors.error + '60',
    borderRadius: radius.md, paddingVertical: spacing.sm,
    backgroundColor: colors.error + '10',
  },
  text: { ...typography.caption, color: colors.error },
  timer: {
    backgroundColor: colors.error + '20', paddingHorizontal: spacing.sm,
    paddingVertical: 2, borderRadius: radius.full,
  },
  timerText: { ...typography.caption, color: colors.error, fontWeight: '700', fontVariant: ['tabular-nums'] },
});

// ─── Helper ───────────────────────────────────────────────
function formatGuestPlate(d: string): string {
  if (d.length === 7) return d.slice(0, 2) + '-' + d.slice(2, 5) + '-' + d.slice(5);
  if (d.length === 8) return d.slice(0, 3) + '-' + d.slice(3, 5) + '-' + d.slice(5);
  return d;
}

// ─── Request Card ─────────────────────────────────────────
function RequestCard({
  req, mode, canApprove, onApprove, onConfirm,
}: {
  req: ParkingRequest;
  mode: 'owner' | 'mine';
  canApprove?: boolean;
  onApprove?: () => void;
  onConfirm?: () => void;
}) {
  const uid = auth.currentUser?.uid;
  const isOwn = req.requesterId === uid;
  const status = statusMeta(req.status);

  const handleCancel = () => {
    Alert.alert('ביטול בקשה', 'האם לבטל את הבקשה?', [
      { text: 'לא', style: 'cancel' },
      { text: 'כן, בטל', style: 'destructive', onPress: () => cancelRequest(req.id) },
    ]);
  };

  return (
    <View style={rc.card}>
      <View style={rc.header}>
        <View style={rc.avatar}>
          <Text style={rc.avatarText}>{req.requesterName.charAt(0)}</Text>
        </View>
        <View style={rc.info}>
          <Text style={rc.name}>{isOwn ? 'הבקשה שלי' : req.requesterName}</Text>
          <Text style={rc.meta}>{'דירה ' + req.requesterApartment + ' \u00b7 מגדל ' + req.requesterTower}</Text>
        </View>
        <View style={rc.durationBadge}>
          <Text style={rc.durationText}>{durationLabel(req.fromTime, req.toTime)}</Text>
        </View>
      </View>

      <View style={rc.timeRow}>
        <Text style={rc.timeIcon}>🕐</Text>
        <Text style={rc.timeText}>{formatTimeRange(req.fromTime, req.toTime)}</Text>
        {req.status === 'open' && <Text style={rc.untilText}>{timeUntil(req.fromTime)}</Text>}
      </View>

      {req.spotNumber && (
        <View style={rc.spotRow}>
          <Text style={rc.spotIcon}>🅿️</Text>
          <Text style={rc.spotText}>{'חניה ' + req.spotNumber + ' של ' + req.ownerName}</Text>
        </View>
      )}
      {req.isGuest && req.carNumber && (
        <View style={[rc.spotRow, { marginTop: -spacing.xs }]}>
          <Text style={rc.spotIcon}>🚗</Text>
          <Text style={[rc.spotText, { color: colors.textSecondary }]}>
            {'אורח · ' + formatGuestPlate(req.carNumber)}
          </Text>
        </View>
      )}

      {mode === 'owner' && req.status === 'open' && !isOwn && (
        canApprove
          ? (
            <TouchableOpacity style={rc.approveBtn} onPress={onApprove} activeOpacity={0.85}>
              <Text style={rc.approveBtnText}>אשר — תן את החניה שלי</Text>
            </TouchableOpacity>
          ) : (
            <View style={rc.noSpotNote}>
              <Text style={rc.noSpotNoteText}>אין לך חניה רשומה — לא ניתן לאשר</Text>
            </View>
          )
      )}

      {/* Owner can cancel their own approval within 2 minutes */}
      {mode === 'owner' && req.status === 'approved' && req.ownerId === uid && (
        <CancelApprovalRow requestId={req.id} approvedAt={req.approvedAt} />
      )}

      {mode === 'mine' && (
        <View style={rc.myStatusRow}>
          <View style={[rc.statusBadge, { borderColor: status.color + '60', backgroundColor: status.color + '15' }]}>
            <Text style={[rc.statusText, { color: status.color }]}>
              {req.isGuest && req.status === 'open' ? 'ממתין לאישור · אורח' : status.text}
            </Text>
          </View>
          {req.status === 'approved' && !req.isGuest && (
            <TouchableOpacity style={rc.confirmBtn} onPress={onConfirm} activeOpacity={0.85}>
              <Text style={rc.confirmBtnText}>הכנס מספר רכב</Text>
            </TouchableOpacity>
          )}
          {req.status === 'open' && (
            <TouchableOpacity onPress={handleCancel}>
              <Text style={rc.cancelText}>בטל</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const rc = StyleSheet.create({
  card: {
    backgroundColor: colors.bgCard, borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  header: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 18, fontWeight: '800', color: colors.bg },
  info: { flex: 1, alignItems: 'flex-end' },
  name: { ...typography.subtitle, color: colors.textPrimary },
  meta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  durationBadge: {
    backgroundColor: colors.bgInput, paddingHorizontal: spacing.sm,
    paddingVertical: 4, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border,
  },
  durationText: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  timeRow: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.bgInput, padding: spacing.sm,
    borderRadius: radius.sm, marginBottom: spacing.sm,
  },
  timeIcon: { fontSize: 14 },
  timeText: { ...typography.caption, color: colors.textSecondary, flex: 1, textAlign: 'right' },
  untilText: { ...typography.caption, color: colors.accent, fontWeight: '700' },
  spotRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  spotIcon: { fontSize: 14 },
  spotText: { ...typography.caption, color: colors.success, fontWeight: '600' },
  approveBtn: {
    backgroundColor: colors.accent, borderRadius: radius.md,
    paddingVertical: 12, alignItems: 'center',
  },
  approveBtnText: { ...typography.body, color: colors.bg, fontWeight: '700' },
  myStatusRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm },
  statusBadge: {
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    borderRadius: radius.full, borderWidth: 1,
  },
  statusText: { ...typography.caption, fontWeight: '700' },
  confirmBtn: {
    backgroundColor: colors.success + '20', borderWidth: 1, borderColor: colors.success,
    paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.full,
  },
  confirmBtnText: { ...typography.caption, color: colors.success, fontWeight: '700' },
  cancelText: { ...typography.caption, color: colors.textMuted },
  noSpotNote: {
    backgroundColor: colors.bgInput,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  noSpotNoteText: { ...typography.caption, color: colors.textMuted },
});

// ─── HomeScreen ───────────────────────────────────────────
export default function HomeScreen({ navigation }: Props) {
  const route = useRoute<RouteProp<{ Home: { openConfirm?: string } }, 'Home'>>();

  const { requests: openReqs, loading: l1 } = useOpenRequests();
  const { requests: myReqs, loading: l2 } = useMyRequests();
  const { profile } = useUserProfile();   // current user's profile, including ownedSpot
  const { session: activeSession } = useActiveParking(); // confirmed parking relevant to me
  const [tab, setTab] = useState<'all' | 'mine'>('all');
  const [approveTarget, setApproveTarget] = useState<ParkingRequest | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<ParkingRequest | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const uid = auth.currentUser?.uid;
  const othersReqs = openReqs.filter((r) => r.requesterId !== uid);
  const pendingConfirm = myReqs.find((r) => r.status === 'approved');

  // Auto-open confirm modal when arriving from a push notification
  useEffect(() => {
    const requestId = route.params?.openConfirm;
    if (!requestId || myReqs.length === 0) return;
    const target = myReqs.find((r) => r.id === requestId && r.status === 'approved');
    if (target) setConfirmTarget(target);
  }, [route.params?.openConfirm, myReqs]);
  const activeMyReqs = myReqs.filter((r) => ['open', 'approved'].includes(r.status));

  return (
    <View style={s.screen}>
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.title}>חניון</Text>
          <Text style={s.sub}>
            {othersReqs.length > 0
              ? othersReqs.length + ' בקשות פתוחות ממתינות'
              : 'אין בקשות פתוחות כרגע'}
          </Text>
        </View>
        {pendingConfirm && (
          <TouchableOpacity
            style={s.alertBadge}
            onPress={() => setConfirmTarget(pendingConfirm)}
            activeOpacity={0.85}
          >
            <Text style={s.alertBadgeText}>🔔 אושרת!</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Active parking — only visible to the two involved parties */}
      {activeSession && (
        <ActiveParkingCard
          requestId={activeSession.id}
          spotNumber={activeSession.spotNumber ?? ''}
          endTime={activeSession.toTime}
        />
      )}

      {/* Tabs */}
      <View style={s.tabs}>
        <TouchableOpacity
          style={[s.tab, tab === 'all' && s.tabActive]}
          onPress={() => setTab('all')}
          activeOpacity={0.8}
        >
          <Text style={[s.tabText, tab === 'all' && s.tabTextActive]}>
            {'כל הבקשות' + (othersReqs.length > 0 ? ' (' + othersReqs.length + ')' : '')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.tab, tab === 'mine' && s.tabActive]}
          onPress={() => setTab('mine')}
          activeOpacity={0.8}
        >
          <Text style={[s.tabText, tab === 'mine' && s.tabTextActive]}>
            {'הבקשות שלי' + (activeMyReqs.length > 0 ? ' (' + activeMyReqs.length + ')' : '')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* List */}
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); setTimeout(() => setRefreshing(false), 600); }}
            tintColor={colors.accent}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {(l1 || l2) ? (
          <View style={s.loader}><ActivityIndicator size="large" color={colors.accent} /></View>
        ) : tab === 'all' ? (
          <>
            {!profile?.ownedSpot && othersReqs.length > 0 && (
              <View style={s.noSpotBanner}>
                <Text style={s.noSpotBannerText}>
                  👀 אתה רואה את הבקשות הפתוחות, אך לא ניתן לאשר אותן ללא חניה רשומה בפרופיל
                </Text>
              </View>
            )}
            {othersReqs.length === 0
              ? <Empty emoji="🅿️" title="אין בקשות פתוחות" sub="כשמישהו יצטרך חניה, הבקשה תופיע כאן" />
              : othersReqs.map((r) => (
                <RequestCard
                  key={r.id} req={r} mode="owner"
                  canApprove={!!profile?.ownedSpot}
                  onApprove={() => setApproveTarget(r)}
                />
              ))
            }
          </>
        ) : (
          myReqs.length === 0
            ? <Empty emoji="🙋" title="לא שלחת בקשות" sub="לחץ על 'בקש חניה' כשאתה צריך מקום" />
            : myReqs.map((r) => (
                <RequestCard key={r.id} req={r} mode="mine" onConfirm={() => setConfirmTarget(r)} />
              ))
        )}
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity
        style={s.fab}
        onPress={() => navigation.navigate('Request')}
        activeOpacity={0.9}
      >
        <Text style={s.fabText}>+ בקש חניה</Text>
      </TouchableOpacity>

      {/* Modals */}
      <ApproveModal
        request={approveTarget}
        visible={!!approveTarget}
        onClose={() => setApproveTarget(null)}
        ownerProfile={profile}
      />
      <ConfirmCarModal
        request={confirmTarget}
        visible={!!confirmTarget}
        onClose={() => setConfirmTarget(null)}
      />
    </View>
  );
}

function Empty({ emoji, title, sub }: { emoji: string; title: string; sub: string }) {
  return (
    <View style={{ alignItems: 'center', marginTop: 80, gap: spacing.md }}>
      <Text style={{ fontSize: 52 }}>{emoji}</Text>
      <Text style={{ ...typography.subtitle, color: colors.textPrimary }}>{title}</Text>
      <Text style={{ ...typography.body, color: colors.textSecondary, textAlign: 'center' }}>{sub}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingTop: 60, paddingBottom: spacing.md,
  },
  title: { ...typography.title, color: colors.textPrimary, textAlign: 'right' },
  sub: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  alertBadge: {
    backgroundColor: colors.success, paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm, borderRadius: radius.full,
  },
  alertBadgeText: { ...typography.label, color: colors.bg, textTransform: 'none', fontSize: 13 },
  tabs: {
    flexDirection: 'row', marginHorizontal: spacing.lg,
    backgroundColor: colors.bgCard, borderRadius: radius.lg,
    padding: 4, marginBottom: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  tab: { flex: 1, paddingVertical: 10, borderRadius: radius.md, alignItems: 'center' },
  tabActive: { backgroundColor: colors.accent },
  tabText: { ...typography.label, color: colors.textSecondary, textTransform: 'none', fontSize: 13 },
  tabTextActive: { color: colors.bg },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: spacing.lg, paddingBottom: 100 },
  loader: { alignItems: 'center', marginTop: 80 },
  fab: {
    position: 'absolute', bottom: 90, alignSelf: 'center',
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
    borderRadius: radius.full,
    shadowColor: colors.accent, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
  },
  fabText: { ...typography.body, color: colors.bg, fontWeight: '800' },
  noSpotBanner: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  noSpotBannerText: { ...typography.caption, color: colors.textSecondary, textAlign: 'right', lineHeight: 18 },
});
