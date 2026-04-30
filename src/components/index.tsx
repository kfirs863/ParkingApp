import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInputProps,
  ViewStyle,
} from 'react-native';
import { colors, spacing, radius, typography } from '../theme';

// ─── Button ───────────────────────────────────────────────
interface ButtonProps {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'ghost';
  style?: ViewStyle;
}

export const Button: React.FC<ButtonProps> = ({
  label,
  onPress,
  loading,
  disabled,
  variant = 'primary',
  style,
}) => {
  const isPrimary = variant === 'primary';
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}
      style={[
        styles.btn,
        isPrimary ? styles.btnPrimary : styles.btnGhost,
        (disabled || loading) && styles.btnDisabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? colors.bg : colors.accent} />
      ) : (
        <Text style={[styles.btnText, !isPrimary && styles.btnTextGhost]}>
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );
};

// ─── Input ────────────────────────────────────────────────
interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  prefix?: string;
}

export const Input: React.FC<InputProps> = ({ label, error, prefix, style, ...props }) => {
  const [focused, setFocused] = React.useState(false);
  return (
    <View style={styles.inputWrapper}>
      {label && <Text style={styles.inputLabel}>{label}</Text>}
      <View
        style={[
          styles.inputRow,
          focused && styles.inputRowFocused,
          !!error && styles.inputRowError,
        ]}
      >
        {prefix && <Text style={styles.inputPrefix}>{prefix}</Text>}
        <TextInput
          style={[styles.input, style]}
          placeholderTextColor={colors.textMuted}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...props}
        />
      </View>
      {error && <Text style={styles.inputError}>{error}</Text>}
    </View>
  );
};

// ─── StepIndicator ────────────────────────────────────────
export const StepIndicator: React.FC<{ total: number; current: number }> = ({
  total,
  current,
}) => (
  <View style={styles.steps}>
    {Array.from({ length: total }).map((_, i) => (
      <View
        key={i}
        style={[styles.step, i < current && styles.stepDone, i === current && styles.stepActive]}
      />
    ))}
  </View>
);

// ─── ScreenShell ──────────────────────────────────────────
export const ScreenShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <View style={styles.shell}>{children}</View>
);

// ─── DateTimePicker ───────────────────────────────────────
interface DateTimePickerProps {
  label: string;
  value: Date;
  onChange: (d: Date) => void;
  minDate?: Date;
  maxDate?: Date;
}

function startOfDay(d: Date): Date {
  const s = new Date(d); s.setHours(0, 0, 0, 0); return s;
}

function dateLabelFor(value: Date): string {
  const today = startOfDay(new Date());
  const valueDay = startOfDay(value);
  const offset = Math.round((valueDay.getTime() - today.getTime()) / 86400000);
  if (offset === 0) return 'היום';
  if (offset === 1) return 'מחר';
  if (offset === 2) return 'עוד יומיים';
  if (offset >= 3 && offset <= 6) return value.toLocaleDateString('he-IL', { weekday: 'short' });
  return value.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
}

export const DateTimePicker: React.FC<DateTimePickerProps> = ({ label, value, onChange, minDate, maxDate }) => {
  const adjustDay  = (days: number) => {
    const newDate = new Date(value.getTime() + days * 86400000);
    if (minDate && newDate < startOfDay(minDate)) return;
    if (maxDate && newDate > maxDate) return;
    onChange(newDate);
  };
  const adjustTime = (mins: number) => {
    const newDate = new Date(value.getTime() + mins * 60000);
    if (minDate && newDate < minDate) return;
    if (maxDate && newDate > maxDate) return;
    onChange(newDate);
  };
  const fmtTime = (d: Date) => d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });

  const canGoBack    = !minDate || startOfDay(value) > startOfDay(minDate);
  const canGoForward = !maxDate || startOfDay(value) < startOfDay(maxDate);

  return (
    <View style={dtp.block}>
      {/* Date row */}
      <View style={[dtp.row, dtp.rowTop]}>
        <Text style={dtp.label}>{label}</Text>
        <View style={dtp.controls}>
          <TouchableOpacity
            style={[dtp.arrow, !canGoForward && dtp.arrowDisabled]}
            onPress={() => canGoForward && adjustDay(1)}
            activeOpacity={0.7}
          >
            <Text style={dtp.arrowTxt}>›</Text>
          </TouchableOpacity>
          <Text style={[dtp.time, dtp.dateText]}>{dateLabelFor(value)}</Text>
          <TouchableOpacity
            style={[dtp.arrow, !canGoBack && dtp.arrowDisabled]}
            onPress={() => canGoBack && adjustDay(-1)}
            activeOpacity={0.7}
          >
            <Text style={dtp.arrowTxt}>‹</Text>
          </TouchableOpacity>
        </View>
      </View>
      {/* Time row */}
      <View style={[dtp.row, dtp.rowBottom]}>
        <Text style={dtp.label} />
        <View style={dtp.controls}>
          <TouchableOpacity style={dtp.arrow} onPress={() => adjustTime(30)} activeOpacity={0.7}>
            <Text style={dtp.arrowTxt}>+</Text>
          </TouchableOpacity>
          <Text style={dtp.time}>{fmtTime(value)}</Text>
          <TouchableOpacity style={dtp.arrow} onPress={() => adjustTime(-30)} activeOpacity={0.7}>
            <Text style={dtp.arrowTxt}>−</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const dtp = StyleSheet.create({
  block:   { marginBottom: spacing.md },
  row: {
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.bgInput, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  rowTop:    { borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md, borderBottomWidth: 0.5 },
  rowBottom: { borderBottomLeftRadius: radius.md, borderBottomRightRadius: radius.md, borderTopWidth: 0.5 },
  label:    { ...typography.body, color: colors.textSecondary, minWidth: 28 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  arrow: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  arrowDisabled: { opacity: 0.3 },
  arrowTxt:  { fontSize: 22, color: colors.textPrimary, fontWeight: '300', lineHeight: 26 },
  time:      { ...typography.subtitle, color: colors.accent, minWidth: 60, textAlign: 'center' },
  dateText:  { minWidth: 90 },
});

// ─── Styles ───────────────────────────────────────────────
const styles = StyleSheet.create({
  // Button
  btn: {
    height: 56,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  btnPrimary: { backgroundColor: colors.accent },
  btnGhost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
  },
  btnDisabled: { opacity: 0.4 },
  btnText: { ...typography.subtitle, color: colors.bg },
  btnTextGhost: { color: colors.textSecondary },

  // Input
  inputWrapper: { marginBottom: spacing.md },
  inputLabel: {
    ...typography.label,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgInput,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  inputRowFocused: { borderColor: colors.borderFocus, backgroundColor: colors.bgInputFocus },
  inputRowError: { borderColor: colors.error },
  inputPrefix: { ...typography.body, color: colors.textSecondary, marginRight: spacing.sm },
  input: {
    flex: 1,
    height: 52,
    ...typography.body,
    color: colors.textPrimary,
  },
  inputError: { ...typography.caption, color: colors.error, marginTop: spacing.xs },

  // Steps
  steps: { flexDirection: 'row', gap: 6, marginBottom: spacing.xxl },
  step: {
    height: 4,
    flex: 1,
    borderRadius: 2,
    backgroundColor: colors.bgCard,
  },
  stepDone: { backgroundColor: colors.accent },
  stepActive: { backgroundColor: colors.accent },

  // Shell
  shell: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.lg,
    paddingTop: 60,
    paddingBottom: 32,
  },
});
