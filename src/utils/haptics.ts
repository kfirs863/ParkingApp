// Haptic feedback wrapper. No-op on web (the API doesn't exist in browsers
// and we don't want a try/catch at every callsite).
//
// Use:
//   tap()      — light buzz on UI taps you want to feel responsive
//   success()  — confirm a commit action landed (approve, confirm, complete)
//   warning()  — about-to-undo / cancellation feedback
//   error()    — destructive failure or rejected action
import { Platform } from 'react-native';

const native = Platform.OS !== 'web';

let _Haptics: typeof import('expo-haptics') | null = null;
function lazyHaptics(): typeof import('expo-haptics') | null {
  if (!native) return null;
  if (_Haptics) return _Haptics;
  try {
    _Haptics = require('expo-haptics');
    return _Haptics;
  } catch {
    return null;
  }
}

function safe(fn: () => Promise<unknown> | unknown) {
  try {
    const r = fn();
    if (r && typeof (r as Promise<unknown>).then === 'function') {
      (r as Promise<unknown>).catch(() => {});
    }
  } catch {
    // Swallow — haptics are pure UX sugar; never let them throw.
  }
}

export const haptics = {
  tap(): void {
    const H = lazyHaptics();
    if (!H) return;
    safe(() => H.impactAsync(H.ImpactFeedbackStyle.Light));
  },
  success(): void {
    const H = lazyHaptics();
    if (!H) return;
    safe(() => H.notificationAsync(H.NotificationFeedbackType.Success));
  },
  warning(): void {
    const H = lazyHaptics();
    if (!H) return;
    safe(() => H.notificationAsync(H.NotificationFeedbackType.Warning));
  },
  error(): void {
    const H = lazyHaptics();
    if (!H) return;
    safe(() => H.notificationAsync(H.NotificationFeedbackType.Error));
  },
};
