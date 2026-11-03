export type QueueTab = 'all' | 'solo' | 'flex' | 'normal' | 'aram';
export type RankedQueueTab = 'solo' | 'flex';

export const DEFAULT_QUEUE_TAB: QueueTab = 'all';
export const DEFAULT_RANKED_TAB: RankedQueueTab = 'solo';

export const QUEUE_TABS: Record<QueueTab, number[] | null> = {
  all: null,
  solo: [420],
  flex: [440],
  normal: [400, 430, 480, 490],
  aram: [450],
};

export const TABS = QUEUE_TABS;

export const QUEUE_TAB_LIST: QueueTab[] = [
  'all',
  'solo',
  'flex',
  'normal',
  'aram',
];

export const RANKED_QUEUE_ID: Record<RankedQueueTab, number> = {
  solo: 420,
  flex: 440,
};

export const DEFAULT_SEASON_START_MS = Date.UTC(2025, 0, 1); // 2025-01-01T00:00:00Z

export function getSeasonStartMs(
  override?: number | string | Date
): number {
  const raw = override ?? process.env.SEASON_START;
  if (raw === undefined || raw === '') {
    return DEFAULT_SEASON_START_MS;
  }
  if (typeof raw === 'number') {
    return raw;
  }
  if (raw instanceof Date) {
    return raw.getTime();
  }
  const asNum = Number(raw);
  if (!Number.isNaN(asNum) && asNum > 1_000_000_000_000) {
    return asNum;
  }
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? DEFAULT_SEASON_START_MS : parsed;
}

export function matchesQueueTab(queueId: number, tab: QueueTab): boolean {
  const allowed = QUEUE_TABS[tab];
  if (allowed === null) return true;
  return allowed.includes(queueId);
}

export function filterMatchesByTab<T extends { queueId: number }>(
  matches: T[],
  tab: QueueTab
): T[] {
  const allowed = QUEUE_TABS[tab];
  if (allowed === null) return matches;
  return matches.filter((m) => allowed.includes(m.queueId));
}

export function kdaRatio(
  kills: number,
  deaths: number,
  assists: number
): number | 'perfect' {
  if (deaths <= 0) {
    return 'perfect';
  }
  return Math.round(((kills + assists) / deaths) * 100) / 100;
}

export function formatKdaRatio(
  kills: number,
  deaths: number,
  assists: number
): string {
  if (deaths <= 0) {
    return 'Perfeito';
  }
  return ((kills + assists) / deaths).toFixed(2);
}

export function killParticipation(
  kills: number,
  assists: number,
  teamKills: number
): number {
  if (teamKills <= 0) return 0;
  return Math.round(((kills + assists) / teamKills) * 100);
}

export function csPerMin(cs: number, durationSec: number): number {
  if (durationSec <= 0) return 0;
  const minutes = durationSec / 60;
  return Math.round((cs / minutes) * 10) / 10;
}

export function winrate(wins: number, losses: number): number {
  const total = wins + losses;
  if (total <= 0) return 0;
  return Math.round((wins / total) * 100);
}

export function formatDurationMmSs(durationSec: number): string {
  const safe = Math.max(0, Math.floor(durationSec));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function isRemake(matchOrParticipant: {
  earlySurrender?: boolean;
  gameEndedInEarlySurrender?: boolean;
}): boolean {
  return Boolean(
    matchOrParticipant.earlySurrender ||
      matchOrParticipant.gameEndedInEarlySurrender
  );
}

export function matchResultLabel(participant: {
  win: boolean;
  earlySurrender?: boolean;
  gameEndedInEarlySurrender?: boolean;
}): 'Remake' | 'Vitória' | 'Derrota' {
  if (isRemake(participant)) {
    return 'Remake';
  }
  return participant.win ? 'Vitória' : 'Derrota';
}

export interface ParticipantMatchRecord {
  championId: number;
  championName: string;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  gameDuration: number;
  win: boolean;
  earlySurrender?: boolean;
  gameEndedInEarlySurrender?: boolean;
  queueId: number;
  gameStartTimestamp: number | bigint;
}

export interface ChampionStat {
  championId: number;
  championName: string;
  games: number;
  wins: number;
  losses: number;
  winrate: number;
  avgKills: number;
  avgDeaths: number;
  avgAssists: number;
  kda: number | 'perfect';
  csPerMin: number;
}

export interface ChampionStatsSummary {
  champions: ChampionStat[];
  visibleChampions: ChampionStat[];
  hasMore: boolean;
  totalGames: number;
  isEmpty: boolean;
}

export interface AggregateChampionStatsOptions {
  queue?: RankedQueueTab | number;
  seasonStartMs?: number;
  expanded?: boolean;
}

export function aggregateChampionStats(
  records: ParticipantMatchRecord[],
  options: AggregateChampionStatsOptions = {}
): ChampionStatsSummary {
  const targetQueueId =
    typeof options.queue === 'number'
      ? options.queue
      : options.queue
      ? RANKED_QUEUE_ID[options.queue]
      : undefined;

  const seasonStartMs = getSeasonStartMs(options.seasonStartMs);
  const expanded = Boolean(options.expanded);

  const filtered = records.filter((r) => {
    if (isRemake(r)) return false;
    if (targetQueueId !== undefined && r.queueId !== targetQueueId) {
      return false;
    }
    if (Number(r.gameStartTimestamp) < seasonStartMs) {
      return false;
    }
    return true;
  });

  const groups = new Map<
    string,
    {
      championId: number;
      championName: string;
      games: number;
      wins: number;
      losses: number;
      kills: number;
      deaths: number;
      assists: number;
      cs: number;
      durationSec: number;
    }
  >();

  for (const r of filtered) {
    const key = r.championName;
    const existing = groups.get(key) ?? {
      championId: r.championId,
      championName: r.championName,
      games: 0,
      wins: 0,
      losses: 0,
      kills: 0,
      deaths: 0,
      assists: 0,
      cs: 0,
      durationSec: 0,
    };
    existing.games += 1;
    if (r.win) {
      existing.wins += 1;
    } else {
      existing.losses += 1;
    }
    existing.kills += r.kills;
    existing.deaths += r.deaths;
    existing.assists += r.assists;
    existing.cs += r.cs;
    existing.durationSec += r.gameDuration;
    groups.set(key, existing);
  }

  const champions: ChampionStat[] = Array.from(groups.values()).map((g) => ({
    championId: g.championId,
    championName: g.championName,
    games: g.games,
    wins: g.wins,
    losses: g.losses,
    winrate: winrate(g.wins, g.losses),
    avgKills: Math.round((g.kills / g.games) * 10) / 10,
    avgDeaths: Math.round((g.deaths / g.games) * 10) / 10,
    avgAssists: Math.round((g.assists / g.games) * 10) / 10,
    kda: kdaRatio(g.kills, g.deaths, g.assists),
    csPerMin: csPerMin(g.cs, g.durationSec),
  }));

  champions.sort((a, b) => {
    if (b.games !== a.games) return b.games - a.games;
    if (b.winrate !== a.winrate) return b.winrate - a.winrate;
    return a.championName.localeCompare(b.championName);
  });

  const hasMore = champions.length > 7;
  const visibleChampions = expanded ? champions : champions.slice(0, 7);

  return {
    champions,
    visibleChampions,
    hasMore,
    totalGames: filtered.length,
    isEmpty: filtered.length === 0,
  };
}
