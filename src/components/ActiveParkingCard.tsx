import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, spacing, radius, typography } from '../theme';

interface ActiveParkingCardProps {
  requestId: string;
  spotNumber: string;
  endTime: Date;
  onPress?: () => void;
}

/**
 * כרטיס המציג חנייה פעילה עם טיימר לאחור
 */
export const ActiveParkingCard: React.FC<ActiveParkingCardProps> = ({
  requestId,
  spotNumber,
  endTime,
  onPress,
}) => {
  const [timeLeft, setTimeLeft] = useState('');
  const [isUrgent, setIsUrgent] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date().getTime();
      const distance = endTime.getTime() - now;

      if (distance < 0) {
        setTimeLeft('הסתיים');
        setIsUrgent(false);
        clearInterval(interval);
        return;
      }

      const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((distance % (1000 * 60)) / 1000);

      // אם נשארו פחות מ-15 דקות, נצבע באדום
      setIsUrgent(distance < 15 * 60 * 1000);

      setTimeLeft(
        `${hours > 0 ? hours + ':' : ''}${minutes < 10 ? '0' + minutes : minutes}:${seconds < 10 ? '0' + seconds : seconds}`
      );
    }, 1000);

    return () => clearInterval(interval);
  }, [endTime]);

  return (
    <TouchableOpacity
      style={s.card}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={s.mainInfo}>
        <View style={s.spotContainer}>
          <Text style={s.label}>חנייה</Text>
          <Text style={s.spotNumber}>{spotNumber}</Text>
        </View>

        <View style={s.divider} />

        <View style={s.timerContainer}>
          <Text style={s.label}>זמן נותר</Text>
          <Text style={[s.timerText, isUrgent && s.timerUrgent]}>
            {timeLeft}
          </Text>
        </View>
      </View>

      <View style={s.footer}>
        <Text style={s.footerText}>
          {timeLeft === 'הסתיים' ? 'זמן החניה הסתיים' : 'לחץ לפרטים וניהול'}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  mainInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: spacing.sm,
  },
  spotContainer: {
    alignItems: 'center',
    minWidth: 80,
  },
  label: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 4,
    fontWeight: '600',
  },
  spotNumber: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  divider: {
    width: 1,
    height: '80%',
    backgroundColor: colors.border,
  },
  timerContainer: {
    alignItems: 'center',
    minWidth: 100,
  },
  timerText: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.accent,
  },
  timerUrgent: {
    color: colors.error,
  },
  footer: {
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 13,
    color: colors.accent,
    fontWeight: '500',
  },
});