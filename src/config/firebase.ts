import { initializeApp } from 'firebase/app';
import {
  getAuth,
  PhoneAuthProvider,
  signInWithCredential,
  RecaptchaVerifier,
} from 'firebase/auth';
import {
  getFirestore, doc, setDoc, getDoc, getDocs,
  collection, query, where, serverTimestamp, onSnapshot,
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

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// ─── OTP ──────────────────────────────────────────────────
// verificationId persisted to AsyncStorage so it survives app restarts
// between SMS send and code entry.
const OTP_STORAGE_KEY = 'otp_verification_id';

export async function sendOTP(phoneNumber: string): Promise<void> {
  const provider = new PhoneAuthProvider(auth);
  // @ts-ignore – use @react-native-firebase/auth on device
  const recaptcha = new RecaptchaVerifier('recaptcha-container', { size: 'invisible' }, auth);
  const id = await provider.verifyPhoneNumber(phoneNumber, recaptcha);
  // Persist so re-opening the app mid-flow still works
  await AsyncStorage.setItem(OTP_STORAGE_KEY, id);
}

export async function verifyOTP(code: string): Promise<void> {
  // Read from storage first — covers the case where app was restarted
  const id = await AsyncStorage.getItem(OTP_STORAGE_KEY);
  if (!id) throw new Error('No verification ID — resend the code');
  const credential = PhoneAuthProvider.credential(id, code);
  await signInWithCredential(auth, credential);
  // Clean up after successful auth
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
  const uid = auth.currentUser?.uid;
  const trimmed = spotNumber.trim();
  if (!trimmed) return null;
  const snap = await getDocs(
    query(collection(db, 'users'), where('ownedSpot', '==', trimmed))
  );
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
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) { setLoading(false); return; }
    const unsub = onSnapshot(doc(db, 'users', uid), (snap) => {
      setProfile(snap.exists() ? (snap.data() as UserProfile) : null);
      setLoading(false);
    });
    return unsub;
  }, []);
  return { profile, loading };
}
