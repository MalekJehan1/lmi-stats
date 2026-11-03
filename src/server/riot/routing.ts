export const PLATFORMS = [
  'BR1',
  'NA1',
  'LA1',
  'LA2',
  'EUW1',
  'EUN1',
  'TR1',
  'RU',
  'ME1',
  'KR',
  'JP1',
  'OC1',
  'SG2',
  'TW2',
  'VN2',
] as const;

export type Platform = (typeof PLATFORMS)[number];
export type RegionalRoute = 'americas' | 'europe' | 'asia' | 'sea';

export const DEFAULT_PLATFORM: Platform = 'BR1';

const REGIONAL_MAP: Record<Platform, RegionalRoute> = {
  BR1: 'americas',
  NA1: 'americas',
  LA1: 'americas',
  LA2: 'americas',
  EUW1: 'europe',
  EUN1: 'europe',
  TR1: 'europe',
  RU: 'europe',
  ME1: 'europe',
  KR: 'asia',
  JP1: 'asia',
  OC1: 'sea',
  SG2: 'sea',
  TW2: 'sea',
  VN2: 'sea',
};

const PLATFORM_SET = new Set<string>(PLATFORMS);

export function isPlatform(value: string): value is Platform {
  return PLATFORM_SET.has(value);
}

export function normalizePlatform(value: string): Platform | null {
  const upper = value.trim().toUpperCase();
  return isPlatform(upper) ? upper : null;
}

export function regionalOf(platform: Platform): RegionalRoute {
  return REGIONAL_MAP[platform];
}
