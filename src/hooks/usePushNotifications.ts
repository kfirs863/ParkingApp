import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { navigate } from '../navigation/navigationRef';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export function usePushNotifications(uid: string | null) {
  useEffect(() => {
    if (uid) registerForPushNotifications(uid).catch(() => {
      // Remote push notifications are not available in Expo Go SDK 53+
    });
  }, [uid]);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, string>;
      handleNotificationAction(data);
    });
    return () => sub.remove();
  }, []);
}

async function registerForPushNotifications(uid: string): Promise<void> {
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

  const tokenData = await Notifications.getExpoPushTokenAsync({
    projectId: '3aea0a64-fdc2-4772-bd79-385a6052debf',
  });

  await setDoc(doc(db, 'users', uid), {
    fcmToken: tokenData.data,
    fcmTokenUpdatedAt: new Date(),
    platform: Platform.OS,
  }, { merge: true });
}

function handleNotificationAction(data: Record<string, string>): void {
  const { action, requestId } = data;
  switch (action) {
    case 'confirm_car':
      navigate('Home', { openConfirm: requestId });
      break;
    default:
      navigate('Home');
  }
}
