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
import {
  getAuth as getRNAuth,
  signInWithPhoneNumber as rnSignInWithPhoneNumber,
  signInWithCredential as rnSignInWithCredential,
  GoogleAuthProvider as RNGoogleAuthProvider,
  signOut as rnSignOut,
} from '@react-native-firebase/auth';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

// Web Client ID from Firebase Console → Authentication → Google → Web SDK configuration
// Replace this with your actual Web Client ID
const WEB_CLIENT_ID = 'REPLACE_WITH_YOUR_WEB_CLIENT_ID';

GoogleSignin.configure({ webClientId: WEB_CLIENT_ID });

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

// ─── Google Sign-In ────────────────────────────────────────
export async function signInWithGoogle(): Promise<void> {
  await GoogleSignin.hasPlayServices();
  const { data } = await GoogleSignin.signIn();
  if (!data?.idToken) throw new Error('Google sign-in failed — no ID token returned');

  // Sign into native Firebase auth with Google credential
  const credential = RNGoogleAuthProvider.credential(data.idToken);
  await rnSignInWithCredential(getRNAuth(), credential);

  // Sync JS SDK auth so Firestore security rules have a valid token
  const currentUser = getRNAuth().currentUser;
  if (!currentUser) throw new Error('Google sign-in succeeded but no current user found');
  const idToken = await (currentUser as any).getIdToken(true);
  const mintToken = httpsCallable<{ idToken: string }, { customToken: string }>(fns, 'mintCustomToken');
  const { data: tokenData } = await mintToken({ idToken });
  await _signInWithCustomToken(auth, tokenData.customToken);
}

// ─── OTP (via @react-native-firebase/auth — handles reCAPTCHA natively) ───
// ConfirmationResult is held in memory — it wraps a native session that
// cannot be serialised to AsyncStorage.
let _confirmationResult: Awaited<ReturnType<typeof rnSignInWithPhoneNumber>> | null = null;

export async function sendOTP(phoneNumber: string): Promise<void> {
  _confirmationResult = await rnSignInWithPhoneNumber(getRNAuth(), phoneNumber);
}

export async function verifyOTP(code: string, skipAuthSync = false): Promise<void> {
  if (!_confirmationResult) throw new Error('No verification in progress — resend the code');

  // 1. Confirm OTP via native SDK — uses the native session held in _confirmationResult
  await _confirmationResult.confirm(code);
  _confirmationResult = null;

  if (skipAuthSync) return; // Already signed in (e.g. Google), just needed phone verification

  // 2. Exchange the native user's ID token for a custom token so the JS SDK
  //    auth (used by Firestore security rules) shares the same session.
  const currentUser = getRNAuth().currentUser;
  if (!currentUser) throw new Error('Sign-in succeeded but no current user found');
  const idToken = await (currentUser as any).getIdToken(true);
  const mintToken = httpsCallable<{ idToken: string }, { customToken: string }>(fns, 'mintCustomToken');
  const { data } = await mintToken({ idToken });
  await _signInWithCustomToken(auth, data.customToken);
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
