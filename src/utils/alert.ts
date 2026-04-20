import { Alert, Platform } from 'react-native';

const APP_NAME = 'Upper House Parking';

/**
 * A cross-platform alert helper.
 * On Web, it uses window.alert.
 * On Native, it uses Alert.alert.
 */
export const showAlert = (title: string, message: string, onOk?: () => void) => {
  if (Platform.OS === 'web') {
    // Browser titles are fixed to the domain. 
    // We prepend the app name to the message to provide branding.
    window.alert(`${APP_NAME}\n\n${title}\n${message}`);
    onOk?.();
  } else {
    Alert.alert(title, message, [{ text: 'הבנתי', onPress: onOk }]);
  }
};

/**
 * A cross-platform confirmation helper.
 * On Web, it uses window.confirm.
 * On Native, it uses Alert.alert with buttons.
 */
export const showConfirm = (
  title: string,
  message: string,
  onConfirm: () => void,
  confirmText = 'אישור',
  cancelText = 'ביטול',
  isDestructive = false
) => {
  if (Platform.OS === 'web') {
    const result = window.confirm(`${APP_NAME}\n\n${title}\n${message}`);
    if (result) {
      onConfirm();
    }
  } else {
    Alert.alert(title, message, [
      { text: cancelText, style: 'cancel' },
      {
        text: confirmText,
        style: isDestructive ? 'destructive' : 'default',
        onPress: onConfirm,
      },
    ]);
  }
};
