import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  signInWithCustomToken as _signInWithCustomToken,
  signOut as _signOut,
  onAuthStateChanged as _onAuthStateChanged,
  User,
  Persistence,
  RecaptchaVerifier,
  signInWithPhoneNumber as webSignInWithPhoneNumber,
  ConfirmationResult,
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
import { withTimeout } from '../utils/withTimeout';
import { useState, useEffect } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
if (Platform.OS === 'web') {
  // On web, firebase/auth resolves to the browser build which uses
  // localStorage persistence by default — no AsyncStorage needed.
  auth = getAuth(app);
} else {
  try {
    auth = initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
  } catch {
    auth = getAuth(app);
  }
}

export { auth, app };
export const db = getFirestore(app);
const fns = getFunctions(app, 'europe-west1');

// ─── Auth helpers ──────────────────────────────────────────
export async function signOut() {
  if (Platform.OS !== 'web') {
    // Also sign out of the native Firebase SDK session
    try {
      const { getAuth: getRNAuth, signOut: rnSignOut } = require('@react-native-firebase/auth');
      await rnSignOut(getRNAuth());
    } catch (e) {
      console.warn('Native sign-out error (non-fatal):', e);
    }
  }
  await _signOut(auth);
}

export function onAuthStateChanged(callback: (user: User | null) => void) {
  return _onAuthStateChanged(auth, callback);
}

// ─── OTP — Web (firebase/auth web SDK + RecaptchaVerifier) ───
// On web there is only one SDK session, so no custom-token sync is needed.
let _webRecaptchaVerifier: RecaptchaVerifier | null = null;
let _webConfirmationResult: ConfirmationResult | null = null;

// ─── OTP — Native (@react-native-firebase/auth) ──────────────
// ConfirmationResult is held in memory — it wraps a native session that
// cannot be serialised to AsyncStorage.
let _nativeConfirmationResult: any = null;

export async function sendOTP(phoneNumber: string): Promise<void> {
  if (Platform.OS === 'web') {
    // Lazily create the RecaptchaVerifier pointing at the mount div in App.tsx.
    // Re-use the existing verifier across calls to avoid duplicate widgets.
    if (!_webRecaptchaVerifier) {
      _webRecaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
        size: 'invisible',
      });
    }
    _webConfirmationResult = await webSignInWithPhoneNumber(
      auth,
      phoneNumber,
      _webRecaptchaVerifier,
    );
  } else {
    // Native: use @react-native-firebase/auth which handles reCAPTCHA silently
    const { getAuth: getRNAuth, signInWithPhoneNumber: rnSignInWithPhoneNumber } =
      require('@react-native-firebase/auth');
    _nativeConfirmationResult = await rnSignInWithPhoneNumber(getRNAuth(), phoneNumber);
  }
}

export async function verifyOTP(code: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (!_webConfirmationResult) throw new Error('No verification in progress — resend the code');
    const result = _webConfirmationResult;
    // confirm() signs the user into the web SDK directly — no custom token sync needed
    await result.confirm(code);
    _webConfirmationResult = null;
  } else {
    if (!_nativeConfirmationResult) throw new Error('No verification in progress — resend the code');
    const result = _nativeConfirmationResult;

    // 1. Confirm OTP via native SDK — uses the native session held in result
    await result.confirm(code);

    // 2. Exchange the native user's ID token for a custom token so the JS SDK
    //    auth (used by Firestore security rules) shares the same session.
    const { getAuth: getRNAuth, getIdToken: rnGetIdToken } = require('@react-native-firebase/auth');
    const currentUser = getRNAuth().currentUser;
    if (!currentUser) throw new Error('Sign-in succeeded but no current user found');
    const idToken = await rnGetIdToken(currentUser, true);
    const mintToken = httpsCallable<{ idToken: string }, { customToken: string }>(fns, 'mintCustomToken');
    const { data } = await withTimeout(mintToken({ idToken }), 20000);
    await _signInWithCustomToken(auth, data.customToken);

    _nativeConfirmationResult = null;
  }
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
