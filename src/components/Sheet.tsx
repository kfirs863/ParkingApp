import React, { useEffect, useRef } from 'react';
import {
  Modal, View, StyleSheet, Animated, Easing, TouchableWithoutFeedback,
  Dimensions, ViewStyle, BackHandler,
} from 'react-native';

const SCREEN_HEIGHT = Dimensions.get('window').height;

interface SheetProps {
  visible: boolean;
  onClose: () => void;
  /** When true, backdrop tap is ignored (e.g., during a network action). */
  dismissDisabled?: boolean;
  children: React.ReactNode;
  contentStyle?: ViewStyle;
}

/**
 * Spring-animated bottom sheet. Replaces the stock `<Modal animationType="slide">`
 * pattern: backdrop fades in, content springs up with iOS-like physics. The
 * exit animation runs *before* the Modal unmounts so the user doesn't see a
 * snap-out.
 *
 * Why custom: `Modal animationType="slide"` slides the entire layer including
 * backdrop, which lands hard. High-tier apps fade the dim and spring the
 * sheet independently — that's the difference this component makes.
 */
export function Sheet({ visible, onClose, dismissDisabled, children, contentStyle }: SheetProps) {
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  // We render the Modal whenever the parent says visible, but we delay the
  // *unmount* until our exit animation finishes — otherwise the children
  // disappear instantly while the rest of the sheet is still animating out.
  const [mounted, setMounted] = React.useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          toValue: 0, stiffness: 180, damping: 22, mass: 1, useNativeDriver: true,
        }),
      ]).start();
    } else if (mounted) {
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 0, duration: 180, easing: Easing.in(Easing.cubic), useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: SCREEN_HEIGHT, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true,
        }),
      ]).start(({ finished }) => { if (finished) setMounted(false); });
    }
  }, [visible, mounted, backdropOpacity, translateY]);

  // Hardware back on Android closes the sheet.
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!dismissDisabled) onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, dismissDisabled, onClose]);

  if (!mounted) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={s.root}>
        <TouchableWithoutFeedback onPress={dismissDisabled ? undefined : onClose}>
          <Animated.View style={[s.backdrop, { opacity: backdropOpacity }]} />
        </TouchableWithoutFeedback>
        <Animated.View style={[s.sheet, contentStyle, { transform: [{ translateY }] }]}>
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000' },
  sheet: { width: '100%' },
});
