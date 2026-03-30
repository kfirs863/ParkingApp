import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, getDocs, collection, query, where, serverTimestamp, onSnapshot } from 'firebase/firestore';
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

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export { app };
export const db = getFirestore(app);

// firebase/auth is required lazily inside functions to avoid triggering
// Firebase Auth's module-level self-registration before the RN runtime is ready.
// DO NOT add `import ... from 'firebase/auth'` at the top of this file or any other file.
function getFirebaseAuth() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getAuth, initializeAuth, inMemoryPersistence } = require('firebase/auth');
  try {
    return initializeAuth(app, { persistence: inMemoryPersistence });
  } catch {
    return getAuth(app);
  }
}

let _auth: ReturnType<typeof getFirebaseAuth> | null = null;
export function getAuth() {
  if (!_auth) _auth = getFirebaseAuth();
  return _auth;
}

// auth proxy so existing code using `auth.currentUser` etc still works
export const auth = new Proxy({} as ReturnType<typeof getFirebaseAuth>, {
  get(_, prop) { return (getAuth() as any)[prop]; },
});

// ─── Auth helpers (used by screens — keeps firebase/auth out of screen imports) ──
export async function signOut() {
  const { signOut: _signOut } = require('firebase/auth');
  return _signOut(getAuth());
}

export function onAuthStateChanged(callback: (user: any) => void) {
  const { onAuthStateChanged: _onAuthStateChanged } = require('firebase/auth');
  return _onAuthStateChanged(getAuth(), callback);
}

// ─── OTP ──────────────────────────────────────────────────
const OTP_STORAGE_KEY = 'otp_verification_id';

export async function sendOTP(phoneNumber: string, verifier: any): Promise<void> {
  const { PhoneAuthProvider } = require('firebase/auth');
  const provider = new PhoneAuthProvider(getAuth());
  const id = await provider.verifyPhoneNumber(phoneNumber, verifier);
  await AsyncStorage.setItem(OTP_STORAGE_KEY, id);
}

export async function verifyOTP(code: string): Promise<void> {
  const { PhoneAuthProvider, signInWithCredential } = require('firebase/auth');
  const id = await AsyncStorage.getItem(OTP_STORAGE_KEY);
  if (!id) throw new Error('No verification ID — resend the code');
  const credential = PhoneAuthProvider.credential(id, code);
  await signInWithCredential(getAuth(), credential);
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
  const uid = getAuth().currentUser?.uid;
  const trimmed = spotNumber.trim();
  if (!trimmed) return null;
  const snap = await getDocs(query(collection(db, 'users'), where('ownedSpot', '==', trimmed)));
  const others = snap.docs.filter((d) => d.id !== uid);
  if (others.length === 0) return null;
  const data = others[0].data();
  return { apartment: data.apartment, tower: data.tower };
}

export async function saveUserProfile(profile: UserProfile): Promise<void> {
  const user = getAuth().currentUser;
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

  useEffect(() => {
    const uid = getAuth().currentUser?.uid;
    if (!uid) { setLoading(false); return; }
    const unsub = onSnapshot(doc(db, 'users', uid), (snap) => {
      setProfile(snap.exists() ? (snap.data() as UserProfile) : null);
      setLoading(false);
    });
    return unsub;
  }, []);

  return { profile, loading };
}
