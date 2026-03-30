import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { navigate } from '../navigation/navigationRef';
import { Platform } from 'react-native';

// Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Registers the device for push notifications and saves
 * the Expo push token to Firestore → functions use it for FCM.
 *
 * @param uid - The current user's uid. When uid changes (login/logout),
 *              the hook re-runs registration automatically.
 */
export function usePushNotifications(uid: string | null) {
  // Re-register whenever the authenticated user changes
  useEffect(() => {
    if (uid) registerForPushNotifications(uid);
  }, [uid]);

  // Handle notification tap while app is backgrounded/closed
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, string>;
      handleNotificationAction(data);
    });
    return () => sub.remove();
  }, []);
}

async function registerForPushNotifications(uid: string): Promise<void> {
  // Android requires a notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('parking_alerts', {
      name: 'התראות חניה',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      sound: 'default',
    });
  }

  // Ask permission
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn('Push notification permission denied');
    return;
  }

  // Get Expo push token — called every launch to catch stale tokens
  const tokenData = await Notifications.getExpoPushTokenAsync({
    projectId: '3aea0a64-fdc2-4772-bd79-385a6052debf', // from app.json > extra.eas.projectId
  });

  const token = tokenData.data;

  // Use setDoc with merge — works even if user doc doesn't exist yet
  // (e.g. during onboarding before profile is saved)
  await setDoc(doc(db, 'users', uid), {
    fcmToken: token,
    fcmTokenUpdatedAt: new Date(),
    platform: Platform.OS,
  }, { merge: true });
}

// Handle the action embedded in the notification payload
function handleNotificationAction(data: Record<string, string>): void {
  const { action, requestId } = data;
  switch (action) {
    case 'approve':
      // Owner tapped: go to home to see the request and approve
      navigate('Home');
      break;
    case 'confirm_car':
      // Requester tapped: go home, auto-open the confirm-car modal
      navigate('Home', { openConfirm: requestId });
      break;
    case 'view_active':
    case 'freed':
      navigate('Home');
      break;
    case 'cancelled':
      navigate('Home');
      break;
    default:
      navigate('Home');
  }
}
