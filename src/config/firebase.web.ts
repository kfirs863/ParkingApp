import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signOut as _signOut,
  onAuthStateChanged as _onAuthStateChanged,
  User,
  RecaptchaVerifier,
  signInWithPhoneNumber as webSignInWithPhoneNumber,
  ConfirmationResult,
} from 'firebase/auth';
import {
  getFirestore, doc, setDoc, getDoc, getDocs,
  collection, query, where, serverTimestamp, onSnapshot,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { withTimeout } from '../utils/withTimeout';
import { useState, useEffect } from 'react';

export const firebaseConfig = {
  apiKey: "AIzaSyBZYrynD87K3S7zDW5ctYAMnUX8P3FSyJ0",
  authDomain: "parkingapp-1fb82.firebaseapp.com",
  projectId: "parkingapp-1fb82",
  storageBucket: "parkingapp-1fb82.firebasestorage.app",
  messagingSenderId: "364657925609",
  appId: "1:364657925609:web:da15c5dbeb56e8b2e63f78",
  measurementId: "G-NXDBL6KYN4"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export { app };
export const db = getFirestore(app);
const fns = getFunctions(app, 'europe-west1');

export async function signOut() {
  await _signOut(auth);
}

export function onAuthStateChanged(callback: (user: User | null) => void) {
  return _onAuthStateChanged(auth, callback);
}

let _webRecaptchaVerifier: RecaptchaVerifier | null = null;
let _webConfirmationResult: ConfirmationResult | null = null;

export async function sendOTP(phoneNumber: string): Promise<void> {
  if (!_webRecaptchaVerifier) {
    // FIX: Correct argument order for Firebase Web SDK v9+
    // constructor(containerOrId, parameters, auth)
    _webRecaptchaVerifier = new RecaptchaVerifier('recaptcha-container', {
      size: 'invisible',
    }, auth);
  }
  _webConfirmationResult = await webSignInWithPhoneNumber(
    auth,
    phoneNumber,
    _webRecaptchaVerifier,
  );
}

export async function verifyOTP(code: string): Promise<void> {
  if (!_webConfirmationResult) throw new Error('No verification in progress — resend the code');
  await _webConfirmationResult.confirm(code);
  _webConfirmationResult = null;
}

export interface UserProfile {
  name: string;
  tower: string;
  apartment: string;
  carNumbers: string[];
  ownedSpot: string | null;
  updatedAt?: any;
}

export async function checkSpotTaken(spotNumber: string): Promise<{ apartment: string; tower: string } | null> {
  const uid = auth.currentUser?.uid;
  const trimmed = spotNumber.trim();
  if (!trimmed) return null;
  const snap = await withTimeout(getDocs(query(collection(db, 'users'), where('ownedSpot', '==', trimmed))));
  const others = snap.docs.filter((d) => d.id !== uid);
  if (others.length === 0) return null;
  const data = others[0].data();
  return { apartment: data.apartment, tower: data.tower };
}

export async function saveUserProfile(profile: UserProfile): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  const ref = doc(db, 'users', user.uid);
  const existing = await withTimeout(getDoc(ref));
  const existingData = existing.exists() ? existing.data() : null;
  await withTimeout(setDoc(ref, {
    ...profile,
    phone: user.phoneNumber,
    updatedAt: serverTimestamp(),
    ...(!existingData?.createdAt ? { createdAt: serverTimestamp() } : {}),
    ...(existingData?.pushGeneral === undefined ? { pushGeneral: true } : {}),
  }, { merge: true }));
}

export function useUserProfile() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const uid = auth.currentUser?.uid ?? null;

  useEffect(() => {
    if (!uid) { setLoading(false); return; }
    const unsub = onSnapshot(doc(db, 'users', uid), (snap) => {
      setProfile(snap.exists() ? (snap.data() as UserProfile) : null);
      setLoading(false);
    });
    return unsub;
  }, [uid]);

  return { profile, loading };
}
