import { useState, useEffect } from 'react';
import {
  collection, query, where, onSnapshot,
  addDoc, updateDoc, doc, getDocs, serverTimestamp,
  orderBy, Timestamp, runTransaction, getDoc,
} from 'firebase/firestore';
import { db, auth } from '../config/firebase';

// ─── Types ────────────────────────────────────────────────

export type RequestStatus =
  | 'open'
  | 'approved'
  | 'confirmed'
  | 'cancelled'
  | 'expired';

export interface ParkingRequest {
  id: string;
  requesterId: string;
  requesterName: string;
  requesterApartment: string;
  requesterTower: string;
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
      orderBy('toTime', 'asc')
    );
    return onSnapshot(q, (snap) => {
      setRequests(snap.docs.map(toRequest));
      setLoading(false);
    });
  }, []);
  return { requests, loading };
}

export function useMyRequests() {
  const [requests, setRequests] = useState<ParkingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) { setLoading(false); return; }
    const q = query(
      collection(db, 'parkingRequests'),
      where('requesterId', '==', uid),
      orderBy('createdAt', 'desc')
    );
    return onSnapshot(q, (snap) => {
      setRequests(snap.docs.map(toRequest));
      setLoading(false);
    });
  }, []);
  return { requests, loading };
}

export function useMyApprovals() {
  const [requests, setRequests] = useState<ParkingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) { setLoading(false); return; }
    const q = query(
      collection(db, 'parkingRequests'),
      where('ownerId', '==', uid),
      where('status', 'in', ['approved', 'confirmed']),
      orderBy('createdAt', 'desc')
    );
    return onSnapshot(q, (snap) => {
      setRequests(snap.docs.map(toRequest));
      setLoading(false);
    });
  }, []);
  return { requests, loading };
}

export function useActiveParking() {
  const [session, setSession] = useState<ParkingRequest | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) { setLoading(false); return; }
    const q = query(
      collection(db, 'parkingRequests'),
      where('status', '==', 'confirmed'),
      where('toTime', '>', Timestamp.now())
    );
    return onSnapshot(q, (snap) => {
      const mine = snap.docs
        .map(toRequest)
        .find((r) => r.requesterId === uid || r.ownerId === uid) ?? null;
      setSession(mine);
      setLoading(false);
    });
  }, []);
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
  const existing = await getDocs(
    query(
      collection(db, 'parkingRequests'),
      where('requesterId', '==', user.uid),
      where('status', 'in', ['open', 'approved']),
      where('toTime', '>', Timestamp.now())
    )
  );
  if (!existing.empty) throw new Error('DUPLICATE_REQUEST');

  // ── 2. Enforce max 6 hours ahead ───────────────────────
  const maxAllowed = new Date(Date.now() + 6 * 60 * 60 * 1000);
  if (params.fromTime > maxAllowed) throw new Error('TOO_FAR_AHEAD');

  const ref = await addDoc(collection(db, 'parkingRequests'), {
    requesterId: user.uid,
    requesterName: params.requesterProfile.name,
    requesterApartment: params.requesterProfile.apartment,
    requesterTower: params.requesterProfile.tower,
    fromTime: Timestamp.fromDate(params.fromTime),
    toTime: Timestamp.fromDate(params.toTime),
    status: 'open',
    ...(params.guestCarNumber
      ? { carNumber: params.guestCarNumber, isGuest: true }
      : { isGuest: false }
    ),
    createdAt: serverTimestamp(),
  });
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

  await runTransaction(db, async (tx) => {
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
  });
}

/**
 * Owner cancels their own approval within the 2-minute window.
 * After that, only the requester can cancel.
 */
export async function cancelApproval(requestId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');

  const reqRef = doc(db, 'parkingRequests', requestId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(reqRef);
    if (!snap.exists()) throw new Error('NOT_FOUND');

    const data = snap.data();
    if (data.ownerId !== user.uid) throw new Error('NOT_YOUR_APPROVAL');
    if (data.status !== 'approved') throw new Error('CANNOT_CANCEL');

    // ── Enforce 2-minute window ─────────────────────────
    const approvedAt: Date = data.approvedAt?.toDate();
    if (approvedAt) {
      const minsElapsed = (Date.now() - approvedAt.getTime()) / 60000;
      if (minsElapsed > 2) throw new Error('CANCEL_WINDOW_EXPIRED');
    }

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
      cancelledApprovalAt: serverTimestamp(),
    });
  });
}

export async function confirmParking(requestId: string, carNumber: string): Promise<void> {
  await updateDoc(doc(db, 'parkingRequests', requestId), {
    status: 'confirmed',
    carNumber: carNumber.replace(/-/g, '').trim(),
    confirmedAt: serverTimestamp(),
  });
}

export async function cancelRequest(requestId: string): Promise<void> {
  await updateDoc(doc(db, 'parkingRequests', requestId), {
    status: 'cancelled',
    cancelledAt: serverTimestamp(),
  });
}

// ─── Helpers ──────────────────────────────────────────────

function toRequest(d: any): ParkingRequest {
  const data = d.data();
  return {
    id: d.id, ...data,
    fromTime: data.fromTime?.toDate(),
    toTime: data.toTime?.toDate(),
    createdAt: data.createdAt?.toDate(),
    confirmedAt: data.confirmedAt?.toDate(),
    approvedAt: data.approvedAt?.toDate(),
  };
}

export function formatTimeRange(from: Date, to: Date): string {
  const fmt = (d: Date) => d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  const isToday = from.toDateString() === new Date().toDateString();
  const day = isToday ? 'היום' : from.toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'numeric' });
  return `${day} · ${fmt(from)} – ${fmt(to)}`;
}

export function durationLabel(from: Date, to: Date): string {
  const mins = Math.round((to.getTime() - from.getTime()) / 60000);
  if (mins < 60) return `${mins} דק'`;
  return `${(mins / 60).toFixed(1).replace('.0', '')} שעות`;
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
    cancelled: { text: 'בוטל', color: '#8888A0' },
    expired:   { text: 'פג תוקף', color: '#8888A0' },
  };
  return map[status];
}
