/**
 * Re-export FirebaseRecaptchaVerifierModal for use in phone auth screens.
 *
 * Usage:
 *   import { FirebaseRecaptchaVerifierModal } from '../components/FirebaseRecaptcha';
 *   import { firebaseConfig } from '../config/firebase';
 *   const recaptchaRef = useRef<FirebaseRecaptchaVerifierModal>(null);
 *   <FirebaseRecaptchaVerifierModal
 *     ref={recaptchaRef}
 *     firebaseConfig={firebaseConfig}
 *     attemptInvisibleVerification={false}
 *   />
 *   await sendOTP(phone, recaptchaRef.current!);
 */
export { FirebaseRecaptchaVerifierModal } from 'expo-firebase-recaptcha';
