import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { doc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../config/firebase';
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
 * Call this once after the user is authenticated.
 * Registers the device for push notifications and saves
 * the Expo push token to Firestore → functions use it for FCM.
 *
 * NOTE: Uses Expo Notifications (expo-notifications) which wraps
 * FCM on Android and APNs on iOS. Works with Firebase Functions
 * via the Expo Push API, or you can swap to @react-native-firebase/messaging
 * for direct FCM if you eject from Expo.
 */
export function usePushNotifications() {
  useEffect(() => {
    registerForPushNotifications();

    // Handle notification tap while app is backgrounded/closed
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, string>;
      handleNotificationAction(data);
    });

    return () => sub.remove();
  }, []);
}

async function registerForPushNotifications(): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  // Always refresh — token may have changed after reinstall or cache clear

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

  // Update unconditionally — cheap write, prevents stale token bugs
  await updateDoc(doc(db, 'users', uid), {
    fcmToken: token,
    fcmTokenUpdatedAt: new Date(),
    platform: Platform.OS,
  });
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
