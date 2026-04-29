import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import * as Network from 'expo-network';
import { colors, spacing, typography } from '../theme';

export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    let mounted = true;

    // On web prefer event-driven detection — polling has up to 5s of lag
    // and the browser already fires online/offline events instantly.
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const update = () => { if (mounted) setIsOffline(!navigator.onLine); };
      update();
      window.addEventListener('online', update);
      window.addEventListener('offline', update);
      return () => {
        mounted = false;
        window.removeEventListener('online', update);
        window.removeEventListener('offline', update);
      };
    }

    const check = async () => {
      try {
        const state = await Network.getNetworkStateAsync();
        if (mounted) setIsOffline(!state.isConnected || state.isInternetReachable === false);
      } catch {
        // Can't determine — assume online
      }
    };

    check();
    const interval = setInterval(check, 5000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  if (!isOffline) return null;

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>📡 אין חיבור לאינטרנט</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.error,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  text: {
    ...typography.caption,
    color: colors.bg,
    fontWeight: '700',
  },
});
