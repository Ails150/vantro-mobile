export const colors = {
  base: '#0B0F14',
  surface1: '#111A22',
  surface2: '#1C2530',
  surface3: '#2C3E4C',
  teal: '#00C896',
  tealDim: '#0E7A5E',
  violet: '#A78BFA',
  blue: '#60A5FA',
  amber: '#F59E0B',
  red: '#F87171',
  textPrimary: '#FFFFFF',
  textSecondary: '#9BA9B4',
  textMuted: '#5B6770',
  border: '#1C2530',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 } as const;
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;
export const type = {
  title: { fontSize: 24, fontWeight: '700' as const, color: colors.textPrimary },
  heading: { fontSize: 18, fontWeight: '600' as const, color: colors.textPrimary },
  body: { fontSize: 15, fontWeight: '400' as const, color: colors.textPrimary },
  sub: { fontSize: 14, fontWeight: '400' as const, color: colors.textSecondary },
  caption: { fontSize: 13, fontWeight: '400' as const, color: colors.textMuted },
} as const;

export function formatDistance(metres: number): string {
  if (metres >= 1000) return `${(metres / 1000).toFixed(1)} km`;
  return `${Math.round(metres)} m`;
}
