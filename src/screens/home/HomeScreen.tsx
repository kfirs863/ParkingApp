import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
  TouchableOpacity, ActivityIndicator, Alert, Modal, Linking,
} from 'react-native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useRoute, RouteProp } from '@react-navigation/native';
import { MainTabParamList } from '../../navigation/MainNavigator';
import { colors, spacing, radius, typography } from '../../theme';
import {
  useOpenRequests, useMyRequests, useMyApprovals,
  approveRequest, cancelApproval, confirmParking, cancelRequest, completeParking,
  formatTimeRange, durationLabel, timeUntil, statusMeta,
  ParkingRequest,
} from '../../hooks/useParking';
import { auth, useUserProfile } from '../../config/firebase';
import { Input } from '../../components';
import { ActiveParkingCard } from '../../components/ActiveParkingCard';
import { useActiveParking } from '../../hooks/useParking';
import { towerLabel } from '../../utils/towerLabel';

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
          {'\n'}{'דירה ' + request.requesterApartment + ' \u00b7 ' + towerLabel(request.requesterTower)}
          {'\n'}{formatTimeRange(request.fromTime, request.toTime)}
        </Text>
        {request.requesterPhone ? (
          <View style={{ marginBottom: spacing.lg }}>
            <Text style={m.label}>טלפון הדייר</Text>
            <Text style={{ ...typography.body, color: colors.accent, textAlign: 'right', marginBottom: 4 }}>
              {request.requesterPhone}
            </Text>
            <ContactButtons phone={request.requesterPhone} />
          </View>
        ) : null}

        {/* Spot info — read-only from profile */}
        <View style={m.spotDisplay}>
          <View style={m.spotBadge}>
            <Text style={m.spotBadgeLbl}>חניה</Text>
            <Text style={m.spotBadgeNum}>{ownerProfile.ownedSpot}</Text>
          </View>
          <View style={m.spotInfo}>
            <Text style={m.spotInfoTitle}>החניה שלך</Text>
            <Text style={m.spotInfoSub}>{towerLabel(ownerProfile.tower) + ' \u00b7 דירה ' + ownerProfile.apartment}</Text>
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
    padding: spacing.lg, paddingBottom: 60,
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
  request, visible, onClose, userCarNumbers,
}: {
  request: ParkingRequest | null;
  visible: boolean;
  onClose: () => void;
  userCarNumbers?: string[];
}) {
  const [carNumber, setCarNumber] = useState('');
  const [loading, setLoading] = useState(false);

  // Pre-fill with first car from profile, reset when request changes
  useEffect(() => {
    if (visible) {
      setCarNumber(userCarNumbers?.[0] ?? '');
      setLoading(false);
    }
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
    } catch (e: any) {
      const message = e?.message;
      if (message === 'NOT_APPROVED' || message === 'NOT_FOUND' || e?.code === 'permission-denied') {
        Alert.alert('לא ניתן לאשר', 'הבקשה כבר לא פעילה — ייתכן שפג תוקפה או שבעל החניה ביטל.');
      } else {
        Alert.alert('שגיאה', 'לא ניתן לאשר, נסה שוב');
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
        <View style={cc.banner}>
          <Text style={cc.bannerEmoji}>🎉</Text>
          <Text style={cc.bannerTitle}>הבקשה אושרה!</Text>
          <Text style={cc.bannerSub}>
            {'חניה '}
            <Text style={{ color: colors.accent, fontWeight: '700' }}>{request.spotNumber}</Text>
            {'\n'}{'של ' + request.ownerName + ' (דירה ' + request.ownerApartment + ', ' + towerLabel(request.ownerTower) + ')'}
          </Text>
          {request.ownerPhone ? <ContactButtons phone={request.ownerPhone} style={{ width: '100%' }} /> : null}
        </View>
        <Text style={m.label}>מספר לוחית הרישוי שלך</Text>
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
function CancelApprovalRow({ requestId }: { requestId: string }) {
  const handleCancel = () => {
    Alert.alert('בטל אישור', 'לבטל את האישור ולהחזיר את הבקשה לפיד?', [
      { text: 'לא', style: 'cancel' },
      {
        text: 'כן, בטל',
        style: 'destructive',
        onPress: async () => {
          try {
            await cancelApproval(requestId);
          } catch {
            Alert.alert('שגיאה', 'לא ניתן לבטל');
          }
        },
      },
    ]);
  };

  return (
    <TouchableOpacity style={car.btn} onPress={handleCancel} activeOpacity={0.8}>
      <Text style={car.text}>בטל אישור</Text>
    </TouchableOpacity>
  );
}

const car = StyleSheet.create({
  btn: {
    alignItems: 'center', justifyContent: 'center',
    marginTop: spacing.sm,
    borderWidth: 1, borderColor: colors.error + '60',
    borderRadius: radius.md, paddingVertical: spacing.sm,
    backgroundColor: colors.error + '10',
  },
  text: { ...typography.caption, color: colors.error },
});

// ─── Contact helpers ──────────────────────────────────────
function callPhone(phone: string) {
  Linking.openURL(`tel:${phone}`);
}
function openWhatsApp(phone: string) {
  // Remove leading + for wa.me URL
  const clean = phone.replace(/^\+/, '');
  Linking.openURL(`https://wa.me/${clean}`);
}

function ContactButtons({ phone, style }: { phone: string; style?: object }) {
  return (
    <View style={[ct.row, style]}>
      <TouchableOpacity style={ct.btn} onPress={() => callPhone(phone)} activeOpacity={0.8}>
        <Text style={ct.btnText}>📞 התקשר</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[ct.btn, ct.waBtn]} onPress={() => openWhatsApp(phone)} activeOpacity={0.8}>
        <Text style={ct.btnText}>💬 WhatsApp</Text>
      </TouchableOpacity>
    </View>
  );
}

const ct = StyleSheet.create({
  row: { flexDirection: 'row-reverse', gap: spacing.sm, marginTop: spacing.sm },
  btn: {
    flex: 1, paddingVertical: 10, borderRadius: radius.md,
    backgroundColor: colors.bgInput, alignItems: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  waBtn: { borderColor: '#25D366' + '60', backgroundColor: '#25D36615' },
  btnText: { ...typography.caption, color: colors.textPrimary, fontWeight: '600' },
});

// ─── Active Session Modal ─────────────────────────────────
function ActiveSessionModal({
  session, visible, onClose, isOwner,
}: {
  session: any;
  visible: boolean;
  onClose: () => void;
  isOwner: boolean;
}) {
  if (!session) return null;

  const otherName    = isOwner ? session.requesterName    : session.ownerName;
  const otherApt     = isOwner ? session.requesterApartment : session.ownerApartment;
  const otherTower   = isOwner ? session.requesterTower   : session.ownerTower;
  const otherPhone   = isOwner ? session.requesterPhone   : session.ownerPhone;
  const carNumber    = session.carNumber;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={m.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={m.sheet}>
        <View style={m.handle} />
        <Text style={m.title}>פרטי חניה פעילה</Text>

        <View style={as.section}>
          <Text style={as.sectionLabel}>חניה</Text>
          <Text style={as.bigNum}>{session.spotNumber}</Text>
        </View>

        <View style={as.section}>
          <Text style={as.sectionLabel}>{isOwner ? 'החונה' : 'בעל החניה'}</Text>
          <Text style={as.name}>{otherName}</Text>
          <Text style={as.meta}>{'דירה ' + otherApt + ' · ' + towerLabel(otherTower)}</Text>
          {otherPhone ? (
            <>
              <Text style={as.phone}>{otherPhone}</Text>
              <ContactButtons phone={otherPhone} />
            </>
          ) : null}
        </View>

        {carNumber && (
          <View style={as.section}>
            <Text style={as.sectionLabel}>רכב</Text>
            <Text style={as.name}>{formatGuestPlate(carNumber)}</Text>
          </View>
        )}

        {isOwner && otherPhone ? (
          <TouchableOpacity
            style={as.urgentBtn}
            activeOpacity={0.85}
            onPress={() => {
              const msg = `שלום ${otherName}, אני צריך את החניה שלי בדחיפות. אשמח אם תוכל/י לפנות אותה בהקדם. תודה!`;
              Linking.openURL(`https://wa.me/${otherPhone.replace(/^\+/, '')}?text=${encodeURIComponent(msg)}`);
            }}
          >
            <Text style={as.urgentBtnText}>🚨 בקש לפנות את החניה בדחיפות</Text>
          </TouchableOpacity>
        ) : null}

        {!isOwner && (
          <TouchableOpacity
            style={as.urgentBtn}
            activeOpacity={0.85}
            onPress={() => {
              Alert.alert(
                'יציאה מוקדמת',
                'לסמן שסיימת את החניה ולסגור את הבקשה?',
                [
                  { text: 'ביטול', style: 'cancel' },
                  {
                    text: 'כן, סיימתי',
                    style: 'destructive',
                    onPress: async () => {
                      try {
                        await completeParking(session.id);
                        onClose();
                      } catch (e: any) {
                        console.error('completeParking error:', e);
                        Alert.alert('שגיאה', e?.message ?? 'לא ניתן לסגור את הבקשה');
                      }
                    },
                  },
                ]
              );
            }}
          >
            <Text style={as.urgentBtnText}>🚗 יצאתי מוקדם — סגור את החניה</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity onPress={onClose} style={m.cancel}>
          <Text style={[m.cancelText, { color: colors.accent }]}>סגור</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const as = StyleSheet.create({
  section: {
    backgroundColor: colors.bgInput, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.md,
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'flex-end',
  },
  sectionLabel: { ...typography.caption, color: colors.textMuted, marginBottom: 4, textTransform: 'uppercase' },
  bigNum: { fontSize: 36, fontWeight: '900', color: colors.accent },
  name: { ...typography.subtitle, color: colors.textPrimary },
  meta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  phone: { ...typography.body, color: colors.accent, marginTop: spacing.sm, fontWeight: '600' },
  urgentBtn: {
    backgroundColor: colors.error + '15', borderWidth: 1, borderColor: colors.error + '60',
    borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', marginBottom: spacing.md,
  },
  urgentBtnText: { ...typography.body, color: colors.error, fontWeight: '700' },
});

// ─── Helper ───────────────────────────────────────────────
function formatGuestPlate(d: string): string {
  if (d.length === 7) return d.slice(0, 2) + '-' + d.slice(2, 5) + '-' + d.slice(5);
  if (d.length === 8) return d.slice(0, 3) + '-' + d.slice(3, 5) + '-' + d.slice(5);
  return d;
}

// ─── Gave Parking Modal ───────────────────────────────────
function GaveModal({ request, visible, onClose }: {
  request: ParkingRequest | null;
  visible: boolean;
  onClose: () => void;
}) {
  if (!request) return null;
  const phone = request.requesterPhone;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={m.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={m.sheet}>
        <View style={m.handle} />
        <Text style={m.title}>פרטי החונה</Text>

        <View style={as.section}>
          <Text style={as.sectionLabel}>שם</Text>
          <Text style={as.name}>{request.requesterName}</Text>
          <Text style={as.meta}>{'דירה ' + request.requesterApartment + ' · ' + towerLabel(request.requesterTower)}</Text>
        </View>

        <View style={as.section}>
          <Text style={as.sectionLabel}>חניה · זמן</Text>
          <Text style={as.name}>{request.spotNumber}</Text>
          <Text style={as.meta}>{formatTimeRange(request.fromTime, request.toTime)}</Text>
        </View>

        {request.carNumber && (
          <View style={as.section}>
            <Text style={as.sectionLabel}>רכב</Text>
            <Text style={as.name}>{formatGuestPlate(request.carNumber)}</Text>
          </View>
        )}

        {phone ? (
          <View style={as.section}>
            <Text style={as.sectionLabel}>טלפון</Text>
            <Text style={as.phone}>{phone}</Text>
            <ContactButtons phone={phone} />
          </View>
        ) : null}

        {phone ? (
          <TouchableOpacity
            style={as.urgentBtn}
            activeOpacity={0.85}
            onPress={() => {
              const msg = `שלום ${request.requesterName}, אני צריך את החניה שלי בדחיפות. אשמח אם תוכל/י לפנות אותה בהקדם. תודה!`;
              Linking.openURL(`https://wa.me/${phone.replace(/^\+/, '')}?text=${encodeURIComponent(msg)}`);
            }}
          >
            <Text style={as.urgentBtnText}>🚨 בקש לפנות את החניה בדחיפות</Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity onPress={onClose} style={m.cancel}>
          <Text style={[m.cancelText, { color: colors.accent }]}>סגור</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
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
          <Text style={rc.meta}>{'דירה ' + req.requesterApartment + ' \u00b7 ' + towerLabel(req.requesterTower)}</Text>
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
        <CancelApprovalRow requestId={req.id} />
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
  const route = useRoute<RouteProp<{ Home: { openConfirm?: string; openApprove?: string; openActive?: boolean } }, 'Home'>>();

  const { requests: openReqs, loading: l1 } = useOpenRequests();
  const { requests: myReqs, loading: l2 } = useMyRequests();
  const { requests: myApprovals, loading: l3 } = useMyApprovals();
  const { profile } = useUserProfile();
  const { session: activeSession } = useActiveParking();
  const [tab, setTab] = useState<'all' | 'mine' | 'gave'>('all');
  const [approveTarget, setApproveTarget] = useState<ParkingRequest | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<ParkingRequest | null>(null);
  const [sessionModalOpen, setSessionModalOpen] = useState(false);
  const [gaveTarget, setGaveTarget] = useState<ParkingRequest | null>(null);
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

  // Auto-open approve modal from push notification
  useEffect(() => {
    const requestId = route.params?.openApprove;
    if (!requestId || openReqs.length === 0) return;
    const target = openReqs.find((r) => r.id === requestId && r.status === 'open');
    if (target) {
      setTab('all');
      setApproveTarget(target);
    }
  }, [route.params?.openApprove, openReqs]);

  // Auto-open active session modal from push notification
  useEffect(() => {
    if (route.params?.openActive && activeSession) {
      setSessionModalOpen(true);
    }
  }, [route.params?.openActive, activeSession]);

  const activeMyReqs = myReqs.filter((r) => ['open', 'approved'].includes(r.status));

  return (
    <View style={s.screen}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity
          style={s.requestBtn}
          onPress={() => navigation.navigate('Request')}
          activeOpacity={0.9}
        >
          <Text style={s.requestBtnText}>+ בקש חניה</Text>
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.title}>Upper House Parking</Text>
          <Text style={s.sub}>
            {othersReqs.length > 0
              ? othersReqs.length + ' בקשות פתוחות ממתינות'
              : 'אין בקשות פתוחות כרגע'}
          </Text>
        </View>
        {pendingConfirm ? (
          <TouchableOpacity
            style={s.alertBadge}
            onPress={() => setConfirmTarget(pendingConfirm)}
            activeOpacity={0.85}
          >
            <Text style={s.alertBadgeText}>🔔 אושרת!</Text>
          </TouchableOpacity>
        ) : <View style={{ width: 80 }} />}
      </View>

      {/* Active parking — only visible to the two involved parties */}
      {activeSession && (
        <ActiveParkingCard
          requestId={activeSession.id}
          spotNumber={activeSession.spotNumber ?? ''}
          endTime={activeSession.toTime}
          onPress={() => setSessionModalOpen(true)}
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
            {'בקשות' + (othersReqs.length > 0 ? ' (' + othersReqs.length + ')' : '')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.tab, tab === 'mine' && s.tabActive]}
          onPress={() => setTab('mine')}
          activeOpacity={0.8}
        >
          <Text style={[s.tabText, tab === 'mine' && s.tabTextActive]}>
            {'ביקשתי' + (activeMyReqs.length > 0 ? ' (' + activeMyReqs.length + ')' : '')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.tab, tab === 'gave' && s.tabActive]}
          onPress={() => setTab('gave')}
          activeOpacity={0.8}
        >
          <Text style={[s.tabText, tab === 'gave' && s.tabTextActive]}>
            {'נתתי' + (myApprovals.length > 0 ? ' (' + myApprovals.length + ')' : '')}
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
        {(l1 || l2 || l3) ? (
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
            {profile?.ownedSpot && myApprovals.length > 0 && (
              <View style={s.noSpotBanner}>
                <Text style={s.noSpotBannerText}>
                  🅿️ החניה שלך כבר תפוסה — לא ניתן לאשר בקשה נוספת
                </Text>
              </View>
            )}
            {othersReqs.length === 0
              ? <Empty emoji="🅿️" title="אין בקשות פתוחות" sub="כשמישהו יצטרך חניה, הבקשה תופיע כאן" />
              : othersReqs.map((r) => (
                <RequestCard
                  key={r.id} req={r} mode="owner"
                  canApprove={!!profile?.ownedSpot && myApprovals.length === 0}
                  onApprove={() => setApproveTarget(r)}
                />
              ))
            }
          </>
        ) : tab === 'mine' ? (
          myReqs.length === 0
            ? <Empty emoji="🙋" title="לא שלחת בקשות" sub="לחץ על 'בקש חניה' כשאתה צריך מקום" />
            : myReqs.map((r) => (
                <RequestCard key={r.id} req={r} mode="mine" onConfirm={() => setConfirmTarget(r)} />
              ))
        ) : (
          myApprovals.length === 0
            ? <Empty emoji="🤝" title="לא אישרת בקשות" sub="כשתאשר חניה למישהו, היא תופיע כאן" />
            : myApprovals.map((r) => (
                <TouchableOpacity key={r.id} onPress={() => setGaveTarget(r)} activeOpacity={0.85}>
                  <RequestCard req={r} mode="owner" canApprove={false} />
                </TouchableOpacity>
              ))
        )}
      </ScrollView>

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
        userCarNumbers={profile?.carNumbers}
      />
      <ActiveSessionModal
        session={activeSession}
        visible={sessionModalOpen}
        onClose={() => setSessionModalOpen(false)}
        isOwner={activeSession?.ownerId === uid}
      />
      <GaveModal
        request={gaveTarget}
        visible={!!gaveTarget}
        onClose={() => setGaveTarget(null)}
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
  headerCenter: { flex: 1, alignItems: 'center' },
  title: { ...typography.title, color: colors.textPrimary, textAlign: 'center' },
  sub: { ...typography.caption, color: colors.textSecondary, marginTop: 2, textAlign: 'center' },
  requestBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.full, width: 80, alignItems: 'center',
  },
  requestBtnText: { ...typography.caption, color: colors.bg, fontWeight: '800', fontSize: 12 },
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
  scrollContent: { paddingHorizontal: spacing.lg, paddingBottom: 24 },
  loader: { alignItems: 'center', marginTop: 80 },
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
