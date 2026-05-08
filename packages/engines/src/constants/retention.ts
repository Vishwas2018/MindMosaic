export const HALF_LIFE_DAYS_BY_YEAR_LEVEL: Record<string, number> = {
  y5: 60,
  y7: 90,
  y9: 120,
  default: 90,
};

export function retentionHalfLifeDays(yearLevel: number): number {
  const key = `y${yearLevel}`;
  return HALF_LIFE_DAYS_BY_YEAR_LEVEL[key] ?? HALF_LIFE_DAYS_BY_YEAR_LEVEL['default']!;
}
