export const colors = {
  // Background layers
  bg: '#0A0A0F',
  bgCard: '#13131A',
  bgInput: '#1C1C26',
  bgInputFocus: '#22222E',

  // Accent — parking-sign amber
  accent: '#F5A623',
  accentDim: '#F5A62320',
  accentPress: '#D4901E',

  // Text
  textPrimary: '#F0F0F5',
  textSecondary: '#8888A0',
  textMuted: '#55556A',

  // Status
  success: '#34C98A',
  error: '#FF4D6A',
  warning: '#F5A623',

  // Border
  border: '#2A2A38',
  borderFocus: '#F5A62360',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 20,
  full: 999,
};

export const typography = {
  hero: { fontSize: 34, fontWeight: '800' as const, letterSpacing: -0.5 },
  title: { fontSize: 24, fontWeight: '700' as const, letterSpacing: -0.3 },
  subtitle: { fontSize: 18, fontWeight: '600' as const },
  body: { fontSize: 15, fontWeight: '400' as const, lineHeight: 22 },
  caption: { fontSize: 13, fontWeight: '400' as const },
  label: { fontSize: 12, fontWeight: '600' as const, letterSpacing: 0.8 },
};
