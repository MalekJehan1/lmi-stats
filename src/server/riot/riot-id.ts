import { t } from '@/i18n';

export type RiotIdParseResult =
  | { ok: true; gameName: string; tagLine: string }
  | { ok: false; error: string };

export function parseRiotId(input: string): RiotIdParseResult {
  const trimmed = input.trim();
  const parts = trimmed.split('#');
  if (parts.length !== 2) {
    return { ok: false, error: t('search.invalidFormat') };
  }
  const gameName = parts[0].trim();
  const tagLine = parts[1].trim();
  if (
    gameName.length < 3 ||
    gameName.length > 16 ||
    tagLine.length < 3 ||
    tagLine.length > 5
  ) {
    return { ok: false, error: t('search.invalidFormat') };
  }
  return { ok: true, gameName, tagLine };
}

export function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeRiotId(
  gameName: string,
  tagLine: string
): { gameNameNorm: string; tagLineNorm: string; key: string } {
  const gameNameNorm = normalize(gameName);
  const tagLineNorm = normalize(tagLine);
  return {
    gameNameNorm,
    tagLineNorm,
    key: `${gameNameNorm}#${tagLineNorm}`,
  };
}

export function riotIdsEqual(
  a: { gameName: string; tagLine: string },
  b: { gameName: string; tagLine: string }
): boolean {
  return (
    normalize(a.gameName) === normalize(b.gameName) &&
    normalize(a.tagLine) === normalize(b.tagLine)
  );
}

export function toSlug(gameName: string, tagLine: string): string {
  return `${encodeURIComponent(gameName.trim())}-${encodeURIComponent(tagLine.trim())}`;
}

export const toSummonerSlug = toSlug;

export function fromSlug(slug: string): RiotIdParseResult {
  const lastDash = slug.lastIndexOf('-');
  if (lastDash <= 0 || lastDash === slug.length - 1) {
    return { ok: false, error: t('search.invalidFormat') };
  }
  const rawName = slug.slice(0, lastDash);
  const rawTag = slug.slice(lastDash + 1);
  try {
    const gameName = decodeURIComponent(rawName);
    const tagLine = decodeURIComponent(rawTag);
    return parseRiotId(`${gameName}#${tagLine}`);
  } catch {
    return { ok: false, error: t('search.invalidFormat') };
  }
}

export const fromSummonerSlug = fromSlug;

export function buildSummonerUrl(
  platform: string,
  gameName: string,
  tagLine: string
): string {
  return `/${platform.trim().toLowerCase()}/summoner/${toSlug(gameName, tagLine)}`;
}
