import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { app, db } from '../config/firebase';
import { navigate } from '../navigation/navigationRef';
import { Platform } from 'react-native';
import { withTimeout } from '../utils/withTimeout';

// VAPID public key — retrieve from Firebase Console →
// Project Settings → Cloud Messaging → Web Push certificates → Key pair
// This key is NOT a secret; it is embedded in client code by design.
const VAPID_KEY =
  'YOUR_VAPID_PUBLIC_KEY_HERE'; // TODO: replace with actual key from Firebase Console

// Configure foreground notification behaviour on native only.
// expo-notifications is shimmed to a no-op on web (see metro.config.js).
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export function usePushNotifications(uid: string | null) {
  // Register for push notifications after sign-in
  useEffect(() => {
    if (!uid) return;
    if (Platform.OS === 'web') {
      registerWebPush(uid).catch((err) =>
        console.warn('Web push registration failed (non-fatal):', err),
      );
    } else {
      registerForNativePushNotifications(uid).catch(() => {
        // Remote push notifications are not available in Expo Go SDK 53+
      });
    }
  }, [uid]);

  // Handle notification taps / clicks
  useEffect(() => {
    if (Platform.OS === 'web') {
      // Receive notification click data posted by the service worker
      const handler = (event: MessageEvent) => {
        if (event.data?.type === 'NOTIFICATION_CLICK') {
          handleNotificationAction(event.data as Record<string, string>);
        }
      };
      navigator.serviceWorker?.addEventListener('message', handler);
      return () => navigator.serviceWorker?.removeEventListener('message', handler);
    } else {
      const sub = Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data as Record<string, string>;
        handleNotificationAction(data);
      });
      return () => sub.remove();
    }
  }, []);

  // Handle cold-start on native: app was fully killed, user tapped a notification.
  // The response listener above won't catch this because it wasn't registered yet.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const data = response.notification.request.content.data as Record<string, string>;
      handleNotificationAction(data);
    });
  }, []);
}

// ─── Web Push ────────────────────────────────────────────────
async function registerWebPush(uid: string): Promise<void> {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return;

  if (VAPID_KEY === 'YOUR_VAPID_PUBLIC_KEY_HERE') {
    console.warn(
      'usePushNotifications: VAPID_KEY is not set. ' +
      'Get it from Firebase Console → Project Settings → Cloud Messaging → Web Push certificates.',
    );
    return;
  }

  const { getMessaging, getToken } = await import('firebase/messaging');
  const messaging = getMessaging(app);

  const swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
    scope: '/',
  });

  const token = await getToken(messaging, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: swReg,
  });

  await withTimeout(
    setDoc(
      doc(db, 'users', uid),
      { fcmToken: token, fcmTokenUpdatedAt: serverTimestamp(), platform: 'web' },
      { merge: true },
    ),
  );
}

// ─── Native Push ─────────────────────────────────────────────
async function registerForNativePushNotifications(uid: string): Promise<void> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('parking_alerts', {
      name: 'התראות חניה',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      sound: 'default',
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return;

  const tokenData = await Notifications.getDevicePushTokenAsync();

  await withTimeout(setDoc(doc(db, 'users', uid), {
    fcmToken: tokenData.data,
    fcmTokenUpdatedAt: serverTimestamp(),
    platform: Platform.OS,
  }, { merge: true }));
}

// ─── Shared ───────────────────────────────────────────────────
function handleNotificationAction(data: Record<string, string>): void {
  const { action, requestId } = data;
  switch (action) {
    case 'confirm_car':
      navigate('Home', { openConfirm: requestId });
      break;
    case 'approve':
      navigate('Home', { openApprove: requestId });
      break;
    case 'view_active':
      navigate('Home', { openActive: true });
      break;
    default:
      navigate('Home');
  }
}
