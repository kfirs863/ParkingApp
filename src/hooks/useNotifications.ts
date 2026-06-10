import { useEffect, useState } from 'react';
import {
  collection, query, orderBy, limit, onSnapshot, doc, updateDoc, writeBatch,
} from 'firebase/firestore';
import { db, auth } from '../config/firebase';

export interface InboxItem {
  id: string;
  title: string;
  body: string;
  data: Record<string, string>;
  read: boolean;
  createdAt: Date;
}

/**
 * Subscribes to the latest 30 inbox items for the current user. Returns the
 * items plus a derived unread count for the bell badge.
 */
export function useInbox(enabled: boolean = true) {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const uid = auth.currentUser?.uid ?? null;

  useEffect(() => {
    if (!enabled) return;
    if (!uid) { setLoading(false); setItems([]); return; }
    const q = query(
      collection(db, 'notifications', uid, 'items'),
      orderBy('createdAt', 'desc'),
      limit(30)
    );
    return onSnapshot(q, (snap) => {
      setItems(snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          title: data.title ?? '',
          body: data.body ?? '',
          data: data.data ?? {},
          read: !!data.read,
          createdAt: data.createdAt?.toDate?.() ?? new Date(0),
        };
      }));
      setLoading(false);
    }, (err) => {
      console.error('Inbox snapshot error:', err);
      setLoading(false);
    });
  }, [uid, enabled]);

  const unreadCount = items.filter((i) => !i.read).length;
  return { items, loading, unreadCount };
}

export async function markInboxRead(itemId: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  await updateDoc(doc(db, 'notifications', uid, 'items', itemId), { read: true });
}

export async function markAllInboxRead(items: InboxItem[]): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  const unread = items.filter((i) => !i.read);
  if (unread.length === 0) return;
  const batch = writeBatch(db);
  for (const i of unread) {
    batch.update(doc(db, 'notifications', uid, 'items', i.id), { read: true });
  }
  await batch.commit();
}
