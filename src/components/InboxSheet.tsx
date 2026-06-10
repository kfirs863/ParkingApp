import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Sheet } from './Sheet';
import { useInbox, markAllInboxRead, InboxItem } from '../hooks/useNotifications';
import { colors, spacing, radius, typography } from '../theme';

interface InboxSheetProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * Sheet listing recent in-app notifications. Marks everything read on open
 * (best-effort) so the bell badge clears even if the user dismisses without
 * tapping individual rows.
 */
export function InboxSheet({ visible, onClose }: InboxSheetProps) {
  const { items, loading } = useInbox(visible);

  useEffect(() => {
    if (visible && items.length > 0) {
      markAllInboxRead(items).catch(() => {});
    }
  }, [visible, items]);

  return (
    <Sheet visible={visible} onClose={onClose} contentStyle={s.sheet}>
      <View style={s.handle} />
      <Text style={s.title}>התראות</Text>
      <Text style={s.sub}>30 ההודעות האחרונות</Text>

      <ScrollView style={{ maxHeight: 480 }} showsVerticalScrollIndicator={false}>
        {loading ? (
          <Text style={s.empty}>טוען…</Text>
        ) : items.length === 0 ? (
          <Text style={s.empty}>אין התראות עדיין.</Text>
        ) : (
          items.map((it) => <Row key={it.id} item={it} />)
        )}
      </ScrollView>

      <TouchableOpacity onPress={onClose} style={s.cancel} activeOpacity={0.7}>
        <Text style={s.cancelText}>סגור</Text>
      </TouchableOpacity>
    </Sheet>
  );
}

function Row({ item }: { item: InboxItem }) {
  return (
    <View style={[r.row, !item.read && r.rowUnread]}>
      {!item.read && <View style={r.dot} />}
      <View style={r.main}>
        <Text style={r.title} numberOfLines={1}>{item.title}</Text>
        <Text style={r.body} numberOfLines={2}>{item.body}</Text>
      </View>
      <Text style={r.when}>{relativeTime(item.createdAt)}</Text>
    </View>
  );
}

function relativeTime(d: Date): string {
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'עכשיו';
  if (mins < 60) return `לפני ${mins} דק׳`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `לפני ${hrs} ש׳`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `לפני ${days} י׳`;
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
}

const s = StyleSheet.create({
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
  title: { ...typography.title, color: colors.textPrimary, textAlign: 'right' },
  sub: { ...typography.caption, color: colors.textSecondary, textAlign: 'right', marginBottom: spacing.md },
  empty: { ...typography.body, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.xl },
  cancel: { alignItems: 'center', marginTop: spacing.md },
  cancelText: { ...typography.body, color: colors.accent },
});

const r = StyleSheet.create({
  row: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  rowUnread: { backgroundColor: colors.accent + '08' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  main: { flex: 1, alignItems: 'flex-end' },
  title: { ...typography.body, color: colors.textPrimary, fontWeight: '700', textAlign: 'right' },
  body: { ...typography.caption, color: colors.textSecondary, textAlign: 'right', marginTop: 2 },
  when: { ...typography.caption, color: colors.textMuted, fontSize: 11 },
});
