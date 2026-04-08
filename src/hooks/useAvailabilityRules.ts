import { useState, useEffect } from 'react';
import {
  collection, query, where, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '../config/firebase';

export interface AvailabilityRule {
  id: string;
  ownerId: string;
  days: number[];
  fromHHMM: string;
  toHHMM: string;
  active: boolean;
}

export function useMyAvailabilityRules() {
  const [rules, setRules] = useState<AvailabilityRule[]>([]);
  const [loading, setLoading] = useState(true);
  const uid = auth.currentUser?.uid ?? null;

  useEffect(() => {
    if (!uid) { setLoading(false); return; }
    const q = query(
      collection(db, 'availabilityRules'),
      where('ownerId', '==', uid),
    );
    return onSnapshot(q, (snap) => {
      setRules(snap.docs.map((d) => ({ id: d.id, ...d.data() } as AvailabilityRule)));
      setLoading(false);
    }, (err) => {
      console.error('Availability rules snapshot error:', err);
      setLoading(false);
    });
  }, [uid]);

  return { rules, loading };
}

export async function createAvailabilityRule(
  profile: {
    name: string;
    apartment: string;
    tower: string;
    ownedSpot: string;
  },
  days: number[],
  fromHHMM: string,
  toHHMM: string,
) {
  await addDoc(collection(db, 'availabilityRules'), {
    ownerId: auth.currentUser!.uid,
    ownerName: profile.name,
    ownerApartment: profile.apartment,
    ownerTower: profile.tower,
    spotNumber: profile.ownedSpot,
    days,
    fromHHMM,
    toHHMM,
    active: true,
    createdAt: serverTimestamp(),
  });
}

export async function updateAvailabilityRule(
  ruleId: string,
  days: number[],
  fromHHMM: string,
  toHHMM: string,
) {
  await updateDoc(doc(db, 'availabilityRules', ruleId), { days, fromHHMM, toHHMM });
}

export async function toggleAvailabilityRule(ruleId: string, active: boolean) {
  await updateDoc(doc(db, 'availabilityRules', ruleId), { active });
}

export async function deleteAvailabilityRule(ruleId: string) {
  await deleteDoc(doc(db, 'availabilityRules', ruleId));
}
