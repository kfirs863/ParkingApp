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
      activeOpacity={0.8}
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
