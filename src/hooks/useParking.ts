import { useState, useEffect } from 'react';
import {
  collection, query, where, onSnapshot,
  addDoc, updateDoc, doc, getDocs, serverTimestamp,
  orderBy, Timestamp, runTransaction, getDoc, limit,
} from 'firebase/firestore';
import { db, auth } from '../config/firebase';
import { withTimeout } from '../utils/withTimeout';

// ─── Types ────────────────────────────────────────────────

export type RequestStatus =
  | 'open'
  | 'approved'
  | 'confirmed'
  | 'cancelled'
  | 'expired'
  | 'completed';

export interface ParkingRequest {
  id: string;
  requesterId: string;
  requesterName: string;
  requesterApartment: string;
  requesterTower: string;
  requesterPhone?: string;
  fromTime: Date;
  toTime: Date;
  status: RequestStatus;
  ownerId?: string;
  ownerName?: string;
  ownerApartment?: string;
  ownerTower?: string;
  spotNumber?: string;
  ownerPhone?: string;
  carNumber?: string;
  isGuest?: boolean;
  approvedAt?: Date;
  confirmedAt?: Date;
  createdAt: Date;
}

// ─── Hooks ────────────────────────────────────────────────

export function useOpenRequests() {
  const [requests, setRequests] = useState<ParkingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const q = query(
      collection(db, 'parkingRequests'),
      where('status', '==', 'open'),
      where('toTime', '>', Timestamp.now()),
      orderBy('toTime', 'asc'),
      limit(50)
    );
    return onSnapshot(q, (snap) => {
      setRequests(snap.docs.map(toRequest));
      setLoading(false);
    }, (err) => {
      console.error('Open requests snapshot error:', err);
      setLoading(false);
    });
  }, []);
  return { requests, loading };
}

export function useMyRequests() {
  const [requests, setRequests] = useState<ParkingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const uid = auth.currentUser?.uid ?? null;
  useEffect(() => {
    if (!uid) { setLoading(false); return; }
    const q = query(
      collection(db, 'parkingRequests'),
      where('requesterId', '==', uid),
      orderBy('createdAt', 'desc'),
      limit(30)
    );
    return onSnapshot(q, (snap) => {
      setRequests(snap.docs.map(toRequest));
      setLoading(false);
    }, (err) => {
      console.error('My requests snapshot error:', err);
      setLoading(false);
    });
  }, [uid]);
  return { requests, loading };
}

export function useMyApprovals(enabled: boolean = true) {
  const [requests, setRequests] = useState<ParkingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const uid = auth.currentUser?.uid ?? null;
  useEffect(() => {
    if (!enabled) return;
    if (!uid) { setLoading(false); return; }
    const q = query(
      collection(db, 'parkingRequests'),
      where('ownerId', '==', uid),
      where('status', 'in', ['approved', 'confirmed']),
      orderBy('createdAt', 'desc')
    );
    // Filter out approvals whose window already ended. The scheduled
    // expireRequests cron only transitions 'open'/'approved' → 'expired';
    // 'confirmed' requests stay in 'confirmed' forever, so without this
    // filter the "נתתי (n)" badge would keep counting past sessions.
    let latest: ParkingRequest[] = [];
    const isStillActive = (r: ParkingRequest) => r.toTime.getTime() > Date.now();
    const publish = () => setRequests(latest.filter(isStillActive));
    const unsub = onSnapshot(q, (snap) => {
      latest = snap.docs.map(toRequest);
      publish();
      setLoading(false);
    }, (err) => {
      console.error('My approvals snapshot error:', err);
      setLoading(false);
    });
    // Re-evaluate the filter every minute so the badge clears in real time
    // when a session's toTime passes while the screen is open.
    const tick = setInterval(publish, 60_000);
    return () => { unsub(); clearInterval(tick); };
  }, [uid, enabled]);
  return { requests, loading };
}

export function useActiveParking(enabled: boolean = true) {
  const [session, setSession] = useState<ParkingRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const uid = auth.currentUser?.uid ?? null;
  useEffect(() => {
    if (!enabled) return;
    if (!uid) { setLoading(false); return; }

    const isActive = (r: ParkingRequest) =>
      r.status === 'confirmed' && r.toTime.getTime() > Date.now();

    // Two queries: one as requester, one as owner
    const qRequester = query(
      collection(db, 'parkingRequests'),
      where('status', '==', 'confirmed'),
      where('requesterId', '==', uid),
    );
    const qOwner = query(
      collection(db, 'parkingRequests'),
      where('status', '==', 'confirmed'),
      where('ownerId', '==', uid),
    );

    let requesterResult: ParkingRequest | null = null;
    let ownerResult: ParkingRequest | null = null;
    let requesterReady = false;
    let ownerReady = false;

    const update = () => {
      setSession(requesterResult ?? ownerResult);
      if (requesterReady && ownerReady) setLoading(false);
    };

    const unsub1 = onSnapshot(qRequester, (snap) => {
      requesterResult = snap.docs.map(toRequest).find(isActive) ?? null;
      requesterReady = true;
      update();
    }, (err) => {
      console.error('Active parking requester snapshot error:', err);
      requesterReady = true;
      update();
    });
    const unsub2 = onSnapshot(qOwner, (snap) => {
      ownerResult = snap.docs.map(toRequest).find(isActive) ?? null;
      ownerReady = true;
      update();
    }, (err) => {
      console.error('Active parking owner snapshot error:', err);
      ownerReady = true;
      update();
    });

    return () => { unsub1(); unsub2(); };
  }, [uid, enabled]);
  return { session, loading };
}

// ─── Actions ──────────────────────────────────────────────

/** Post a new parking request — with duplicate guard and time-range validation */
export async function createRequest(params: {
  fromTime: Date;
  toTime: Date;
  requesterProfile: { name: string; apartment: string; tower: string };
  guestCarNumber?: string;
}): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');

  // ── 1. Prevent duplicate active requests ───────────────
  const existing = await withTimeout(getDocs(
    query(
      collection(db, 'parkingRequests'),
      where('requesterId', '==', user.uid),
      where('status', 'in', ['open', 'approved']),
      where('toTime', '>', Timestamp.now())
    )
  ));
  if (!existing.empty) throw new Error('DUPLICATE_REQUEST');

  const ref = await withTimeout(addDoc(collection(db, 'parkingRequests'), {
    requesterId: user.uid,
    requesterName: params.requesterProfile.name,
    requesterApartment: params.requesterProfile.apartment,
    requesterTower: params.requesterProfile.tower,
    requesterPhone: user.phoneNumber ?? '',
    fromTime: Timestamp.fromDate(params.fromTime),
    toTime: Timestamp.fromDate(params.toTime),
    status: 'open',
    ...(params.guestCarNumber
      ? { carNumber: params.guestCarNumber, isGuest: true }
      : { isGuest: false }
    ),
    createdAt: serverTimestamp(),
  }));
  return ref.id;
}

/**
 * Owner approves a request.
 * Uses a Firestore Transaction to prevent race conditions —
 * if two owners tap "approve" simultaneously, only the first succeeds.
 */
export async function approveRequest(
  requestId: string,
  owner: { name: string; apartment: string; tower: string; spotNumber: string }
): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');

  const reqRef = doc(db, 'parkingRequests', requestId);

  await withTimeout(runTransaction(db, async (tx) => {
    const snap = await tx.get(reqRef);
    if (!snap.exists()) throw new Error('NOT_FOUND');

    const data = snap.data();

    // ── Race condition guard ────────────────────────────
    if (data.status !== 'open') throw new Error('ALREADY_TAKEN');

    const alreadyHasCar = data.carNumber && data.isGuest;

    tx.update(reqRef, {
      status: alreadyHasCar ? 'confirmed' : 'approved',
      ownerId: user.uid,
      ownerName: owner.name,
      ownerApartment: owner.apartment,
      ownerTower: owner.tower,
      ownerPhone: user.phoneNumber ?? '',
      spotNumber: owner.spotNumber,
      approvedAt: serverTimestamp(),
      ...(alreadyHasCar ? { confirmedAt: serverTimestamp() } : {}),
    });
  }));
}

/**
 * Owner cancels their own approval at any time, as long as requester hasn't confirmed yet.
 */
export async function cancelApproval(requestId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');

  const reqRef = doc(db, 'parkingRequests', requestId);

  await withTimeout(runTransaction(db, async (tx) => {
    const snap = await tx.get(reqRef);
    if (!snap.exists()) throw new Error('NOT_FOUND');

    const data = snap.data();
    if (data.ownerId !== user.uid) throw new Error('NOT_YOUR_APPROVAL');
    if (data.status !== 'approved') throw new Error('CANNOT_CANCEL');

    // Revert to open so another owner can approve
    tx.update(reqRef, {
      status: 'open',
      ownerId: null,
      ownerName: null,
      ownerApartment: null,
      ownerTower: null,
      ownerPhone: null,
      spotNumber: null,
      approvedAt: null,
    });
  }));
}

export async function confirmParking(requestId: string, carNumber: string): Promise<void> {
  const reqRef = doc(db, 'parkingRequests', requestId);
  await withTimeout(runTransaction(db, async (tx) => {
    const snap = await tx.get(reqRef);
    if (!snap.exists()) throw new Error('NOT_FOUND');
    if (snap.data().status !== 'approved') throw new Error('NOT_APPROVED');
    tx.update(reqRef, {
      status: 'confirmed',
      carNumber: carNumber.replace(/-/g, '').trim(),
      confirmedAt: serverTimestamp(),
    });
  }));
}

export async function cancelRequest(requestId: string): Promise<void> {
  await withTimeout(updateDoc(doc(db, 'parkingRequests', requestId), {
    status: 'cancelled',
    cancelledAt: serverTimestamp(),
  }));
}

export async function completeParking(requestId: string): Promise<void> {
  await withTimeout(updateDoc(doc(db, 'parkingRequests', requestId), {
    status: 'completed',
    completedAt: serverTimestamp(),
  }));
}

/** Publish a one-off availability window (owner offers their spot) */

// ─── Helpers ──────────────────────────────────────────────

function toRequest(d: any): ParkingRequest {
  const data = d.data();
  return {
    id: d.id, ...data,
    fromTime: data.fromTime?.toDate() ?? new Date(0),
    toTime: data.toTime?.toDate() ?? new Date(0),
    createdAt: data.createdAt?.toDate() ?? new Date(),
    confirmedAt: data.confirmedAt?.toDate?.() ?? undefined,
    approvedAt: data.approvedAt?.toDate?.() ?? undefined,
  };
}

export function formatTimeRange(from: Date, to: Date): string {
  const fmtTime = (d: Date) => d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  const fmtDate = (d: Date) => d.toLocaleDateString('he-IL', { weekday: 'short', day: '2-digit', month: '2-digit' });
  const today = new Date();
  const sameDay = from.toDateString() === to.toDateString();
  if (sameDay) {
    const isToday = from.toDateString() === today.toDateString();
    const dayLabel = isToday ? 'היום' : fmtDate(from);
    return `${dayLabel} · ${fmtTime(from)} – ${fmtTime(to)}`;
  }
  const fromIsToday = from.toDateString() === today.toDateString();
  const fromLabel = fromIsToday ? 'היום' : fmtDate(from);
  return `${fromLabel} ${fmtTime(from)} – ${fmtDate(to)} ${fmtTime(to)}`;
}

export function durationLabel(from: Date, to: Date): string {
  const totalMins = Math.round((to.getTime() - from.getTime()) / 60000);
  if (totalMins <= 0) return '';
  if (totalMins < 60) return `${totalMins} דק'`;
  const totalHours = Math.floor(totalMins / 60);
  const remMins = totalMins % 60;
  if (totalHours < 24) {
    return remMins > 0 ? `${totalHours}:${String(remMins).padStart(2, '0')} שע'` : `${totalHours} שעות`;
  }
  const days = Math.floor(totalHours / 24);
  const remHours = totalHours % 24;
  const dayWord = days === 1 ? 'יום אחד' : `${days} ימים`;
  if (remHours === 0 && remMins === 0) return dayWord;
  if (remHours === 0) return `${dayWord} ${remMins} דק'`;
  return `${dayWord} ${remHours} שע'`;
}

export function timeUntil(date: Date): string {
  const diff = date.getTime() - Date.now();
  if (diff <= 0) return 'עכשיו';
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `עוד ${mins} דק'`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `עוד ${hrs}:${String(rem).padStart(2, '0')} ש'` : `עוד ${hrs} ש'`;
}

export function statusMeta(status: RequestStatus): { text: string; color: string } {
  const map: Record<RequestStatus, { text: string; color: string }> = {
    open:      { text: 'ממתין לאישור', color: '#F5A623' },
    approved:  { text: 'אושר! הכנס מספר רכב', color: '#34C98A' },
    confirmed: { text: 'חניה פעילה ✓', color: '#34C98A' },
    cancelled:  { text: 'בוטל', color: '#8888A0' },
    expired:    { text: 'פג תוקף', color: '#8888A0' },
    completed:  { text: 'הסתיימה', color: '#34C98A' },
  };
  return map[status];
}
