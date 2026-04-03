import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  signInWithCustomToken as _signInWithCustomToken,
  signOut as _signOut,
  onAuthStateChanged as _onAuthStateChanged,
  User,
  Persistence,
} from 'firebase/auth';
// getReactNativePersistence is only in the RN build — metro.config.js resolves
// firebase/auth to the RN build at runtime via the react-native export condition.
// We cast here since the browser-build types don't declare it.
const { getReactNativePersistence } = require('firebase/auth') as {
  getReactNativePersistence: (s: typeof AsyncStorage) => Persistence;
};
import {
  getFirestore, doc, setDoc, getDoc, getDocs,
  collection, query, where, serverTimestamp, onSnapshot,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
// Native Firebase SDK — handles reCAPTCHA/app verification silently on device
import rnFirebaseAuth, {
  getAuth as getRNAuth,
  signInWithPhoneNumber as rnSignInWithPhoneNumber,
  signInWithCredential as rnSignInWithCredential,
  signOut as rnSignOut,
} from '@react-native-firebase/auth';

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

let auth: ReturnType<typeof getAuth>;
try {
  auth = initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
} catch {
  auth = getAuth(app);
}

export { auth, app };
export const db = getFirestore(app);
const fns = getFunctions(app, 'europe-west1');

// ─── Auth helpers ──────────────────────────────────────────
export async function signOut() {
  await rnSignOut(getRNAuth());
  return _signOut(auth);
}

export function onAuthStateChanged(callback: (user: User | null) => void) {
  return _onAuthStateChanged(auth, callback);
}

// ─── OTP (via @react-native-firebase/auth — handles reCAPTCHA natively) ───
const OTP_STORAGE_KEY = 'otp_confirmation_id';

export async function sendOTP(phoneNumber: string): Promise<void> {
  const confirmation = await rnSignInWithPhoneNumber(getRNAuth(), phoneNumber);
  await AsyncStorage.setItem(OTP_STORAGE_KEY, confirmation.verificationId);
}

export async function verifyOTP(code: string): Promise<void> {
  const verificationId = await AsyncStorage.getItem(OTP_STORAGE_KEY);
  if (!verificationId) throw new Error('No verification ID — resend the code');

  // 1. Sign in via native SDK — validates the OTP, handles reCAPTCHA natively
  const nativeCredential = rnFirebaseAuth.PhoneAuthProvider.credential(verificationId, code);
  const nativeResult = await rnSignInWithCredential(getRNAuth(), nativeCredential);

  // 2. Get native user's ID token and exchange it for a custom token via Cloud Function.
  //    This lets the JS SDK auth (used by Firestore) share the same session.
  const idToken = await nativeResult.user.getIdToken();
  const mintCustomToken = httpsCallable<{ idToken: string }, { customToken: string }>(fns, 'mintCustomToken');
  const { data } = await mintCustomToken({ idToken });
  await _signInWithCustomToken(auth, data.customToken);

  await AsyncStorage.removeItem(OTP_STORAGE_KEY);
}

// ─── User Profile ─────────────────────────────────────────
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
  const snap = await getDocs(query(collection(db, 'users'), where('ownedSpot', '==', trimmed)));
  const others = snap.docs.filter((d) => d.id !== uid);
  if (others.length === 0) return null;
  const data = others[0].data();
  return { apartment: data.apartment, tower: data.tower };
}

export async function saveUserProfile(profile: UserProfile): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  const ref = doc(db, 'users', user.uid);
  const existing = await getDoc(ref);
  await setDoc(ref, {
    ...profile,
    phone: user.phoneNumber,
    updatedAt: serverTimestamp(),
    ...(!existing.exists() ? { createdAt: serverTimestamp() } : {}),
  }, { merge: true });
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
