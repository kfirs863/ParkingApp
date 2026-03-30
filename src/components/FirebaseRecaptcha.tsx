/**
 * Re-export FirebaseRecaptchaVerifierModal for use in phone auth screens.
 *
 * Usage:
 *   import { FirebaseRecaptchaVerifierModal } from '../components/FirebaseRecaptcha';
 *   const recaptchaRef = useRef<FirebaseRecaptchaVerifierModal>(null);
 *   <FirebaseRecaptchaVerifierModal ref={recaptchaRef} firebaseConfig={app.options} />
 *   await sendOTP(phone, recaptchaRef.current!);
 */
export { FirebaseRecaptchaVerifierModal } from 'expo-firebase-recaptcha';
