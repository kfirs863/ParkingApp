import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  PhoneAuthProvider,
  signInWithCredential,
  ApplicationVerifier,
  Auth,
} from 'firebase/auth';
import {
  getFirestore, doc, setDoc, getDoc, getDocs,
  collection, query, where, serverTimestamp, onSnapshot,
  Firestore,
} from 'firebase/firestore';
import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: "AIzaSyBZYrynD87K3S7zDW5ctYAMnUX8P3FSyJ0",
  authDomain: "parkingapp-1fb82.firebaseapp.com",
  projectId: "parkingapp-1fb82",
  storageBucket: "parkingapp-1fb82.firebasestorage.app",
  messagingSenderId: "364657925609",
  appId: "1:364657925609:web:da15c5dbeb56e8b2e63f78",
  measurementId: "G-NXDBL6KYN4"
};

// These are set by initializeFirebase() which must be called from App.tsx
// before any component renders.
let _app: FirebaseApp;
let _auth: Auth;
let _db: Firestore;

/**
 * Call this once at the very top of App.tsx (outside any component),
 * after all native modules are registered by the RN runtime.
 */
export function initializeFirebase() {
  if (_app) return; // already initialized (fast-refresh)
  _app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
  _db = getFirestore(_app);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getReactNativePersistence } = require('@firebase/auth/dist/rn/index.js');
    _auth = initializeAuth(_app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    // initializeAuth already called (hot reload) — just grab the existing instance
    _auth = getAuth(_app);
  }
}

export const getAppInstance = () => _app;
export const getAuthInstance = () => _auth;
export const getDbInstance = () => _db;

// Convenience accessors used throughout the app
// Safe to call after initializeFirebase() has run
export const auth: Auth = new Proxy({} as Auth, { get: (_, p) => (_auth as any)[p] });
export const db: Firestore = new Proxy({} as Firestore, { get: (_, p) => (_db as any)[p] });
export const app: FirebaseApp = new Proxy({} as FirebaseApp, { get: (_, p) => (_app as any)[p] });

// ─── OTP ──────────────────────────────────────────────────
const OTP_STORAGE_KEY = 'otp_verification_id';

export async function sendOTP(
  phoneNumber: string,
  verifier: ApplicationVerifier
): Promise<void> {
  const provider = new PhoneAuthProvider(_auth);
  const id = await provider.verifyPhoneNumber(phoneNumber, verifier);
  await AsyncStorage.setItem(OTP_STORAGE_KEY, id);
}

export async function verifyOTP(code: string): Promise<void> {
  const id = await AsyncStorage.getItem(OTP_STORAGE_KEY);
  if (!id) throw new Error('No verification ID — resend the code');
  const credential = PhoneAuthProvider.credential(id, code);
  await signInWithCredential(_auth, credential);
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

export async function checkSpotTaken(
  spotNumber: string
): Promise<{ apartment: string; tower: string } | null> {
  const uid = _auth.currentUser?.uid;
  const trimmed = spotNumber.trim();
  if (!trimmed) return null;
  const snap = await getDocs(
    query(collection(_db, 'users'), where('ownedSpot', '==', trimmed))
  );
  const others = snap.docs.filter((d) => d.id !== uid);
  if (others.length === 0) return null;
  const data = others[0].data();
  return { apartment: data.apartment, tower: data.tower };
}

export async function saveUserProfile(profile: UserProfile): Promise<void> {
  const user = _auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  const ref = doc(_db, 'users', user.uid);
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

  useEffect(() => {
    const uid = _auth.currentUser?.uid;
    if (!uid) { setLoading(false); return; }
    const unsub = onSnapshot(doc(_db, 'users', uid), (snap) => {
      setProfile(snap.exists() ? (snap.data() as UserProfile) : null);
      setLoading(false);
    });
    return unsub;
  }, []);

  return { profile, loading };
}
