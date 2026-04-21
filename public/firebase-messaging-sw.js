// Firebase Cloud Messaging Service Worker
// Handles background push notifications for the web PWA.
//
// IMPORTANT: Service workers cannot use ES module imports — they must use
// importScripts() with the Firebase compat CDN builds.

importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyBZYrynD87K3S7zDW5ctYAMnUX8P3FSyJ0',
  authDomain: 'parkingapp-1fb82.firebaseapp.com',
  projectId: 'parkingapp-1fb82',
  storageBucket: 'parkingapp-1fb82.firebasestorage.app',
  messagingSenderId: '364657925609',
  appId: '1:364657925609:web:da15c5dbeb56e8b2e63f78',
});

const messaging = firebase.messaging();

// A no-op fetch handler is required for Chrome's PWA installability check.
// Without this, Chrome falls back to installing the PWA as a plain home-screen
// shortcut (which uses the favicon and gets white-framed by the launcher)
// instead of a proper WebAPK that honours the manifest's maskable icon and
// background_color.
self.addEventListener('fetch', () => {});

// Handle messages received while the app is in the background or closed.
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title ?? 'Upper House Parking';
  const body = payload.notification?.body ?? '';
  const data = payload.data ?? {};

  self.registration.showNotification(title, {
    body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data,
    // Keep the notification visible until the user interacts with it
    requireInteraction: false,
  });
});

// Handle notification click: focus/open the app window and forward action data.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data ?? {};

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        if (clientList.length > 0) {
          const client = clientList[0];
          client.focus();
          // Post the notification action to the active window so usePushNotifications
          // can call navigate() with the correct deep-link target.
          client.postMessage({ type: 'NOTIFICATION_CLICK', ...data });
        } else {
          // App is fully closed — open it and it will handle routing on load
          clients.openWindow('/');
        }
      }),
  );
});
