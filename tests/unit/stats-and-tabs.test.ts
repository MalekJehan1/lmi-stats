import { describe, it, expect } from 'vitest';
import {
  QUEUE_TABS,
  DEFAULT_QUEUE_TAB,
  DEFAULT_RANKED_TAB,
  filterMatchesByTab,
  kdaRatio,
  formatKdaRatio,
  killParticipation,
  csPerMin,
  winrate,
  formatDurationMmSs,
  isRemake,
  matchResultLabel,
  aggregateChampionStats,
  type ParticipantMatchRecord,
} from '@/server/stats/calculators';

describe('Queue Tabs', () => {
  it('HIST-03 filters matches by queue IDs for each tab', () => {
    expect(DEFAULT_QUEUE_TAB).toBe('all');
    expect(QUEUE_TABS).toEqual({
      all: null,
      solo: [420],
      flex: [440],
      normal: [400, 430, 480, 490],
      aram: [450],
    });

    const sample = [
      { id: '1', queueId: 420 },
      { id: '2', queueId: 440 },
      { id: '3', queueId: 400 },
      { id: '4', queueId: 430 },
      { id: '5', queueId: 480 },
      { id: '6', queueId: 490 },
      { id: '7', queueId: 450 },
      { id: '8', queueId: 1700 }, // Arena
    ];

    expect(filterMatchesByTab(sample, 'all').map((m) => m.id)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
    ]);
    expect(filterMatchesByTab(sample, 'solo').map((m) => m.id)).toEqual(['1']);
    expect(filterMatchesByTab(sample, 'flex').map((m) => m.id)).toEqual(['2']);
    expect(filterMatchesByTab(sample, 'normal').map((m) => m.id)).toEqual([
      '3',
      '4',
      '5',
      '6',
    ]);
    expect(filterMatchesByTab(sample, 'aram').map((m) => m.id)).toEqual(['7']);
  });
});

describe('Calculators', () => {
  it('HIST-08 computes kdaRatio and killParticipation accurately', () => {
    expect(kdaRatio(8, 2, 6)).toBe(7);
    expect(kdaRatio(5, 3, 2)).toBe(2.33);
    expect(killParticipation(8, 6, 28)).toBe(50);
    expect(killParticipation(3, 4, 15)).toBe(47);
    expect(killParticipation(0, 0, 0)).toBe(0);
  });

  it('HIST-09 returns perfect when deaths is 0', () => {
    expect(kdaRatio(10, 0, 5)).toBe('perfect');
    expect(formatKdaRatio(10, 0, 5)).toBe('Perfeito');
    expect(formatKdaRatio(5, 2, 3)).toBe('4.00');
  });

  it('HIST-10 detects remake matches and formats result label', () => {
    expect(isRemake({ earlySurrender: true })).toBe(true);
    expect(isRemake({ gameEndedInEarlySurrender: true })).toBe(true);
    expect(isRemake({ earlySurrender: false })).toBe(false);
    expect(matchResultLabel({ win: false, earlySurrender: true })).toBe('Remake');
    expect(matchResultLabel({ win: true, earlySurrender: false })).toBe('Vitória');
    expect(matchResultLabel({ win: false, earlySurrender: false })).toBe('Derrota');
  });

  it('PROF-02 computes rounded integer winrate percentage', () => {
    expect(winrate(2, 1)).toBe(67);
    expect(winrate(1, 2)).toBe(33);
    expect(winrate(10, 10)).toBe(50);
    expect(winrate(0, 0)).toBe(0);
  });

  it('computes CS/min to 1 decimal place and mm:ss duration', () => {
    expect(csPerMin(240, 1800)).toBe(8);
    expect(csPerMin(195, 1500)).toBe(7.8);
    expect(csPerMin(100, 0)).toBe(0);
    expect(formatDurationMmSs(1805)).toBe('30:05');
    expect(formatDurationMmSs(540)).toBe('09:00');
  });
});

function makeRecord(overrides: Partial<ParticipantMatchRecord>): ParticipantMatchRecord {
  return {
    championId: 103,
    championName: 'Ahri',
    kills: 8,
    deaths: 2,
    assists: 6,
    cs: 210,
    gameDuration: 1800, // 30m
    win: true,
    earlySurrender: false,
    queueId: 420,
    gameStartTimestamp: 1_740_000_000_000,
    ...overrides,
  };
}

describe('ChampionStats', () => {
  it('CHMP-01 aggregates games, wins, losses, winrate, avg K/D/A, KDA ratio and CS/min', () => {
    const records: ParticipantMatchRecord[] = [
      makeRecord({
        championId: 103,
        championName: 'Ahri',
        kills: 10,
        deaths: 2,
        assists: 8,
        cs: 240,
        gameDuration: 1800,
        win: true,
      }),
      makeRecord({
        championId: 103,
        championName: 'Ahri',
        kills: 6,
        deaths: 4,
        assists: 4,
        cs: 180,
        gameDuration: 1800,
        win: true,
      }),
      makeRecord({
        championId: 103,
        championName: 'Ahri',
        kills: 2,
        deaths: 6,
        assists: 6,
        cs: 180,
        gameDuration: 1800,
        win: false,
      }),
    ];

    const summary = aggregateChampionStats(records, {
      queue: 'solo',
      seasonStartMs: 1_735_689_600_000,
    });

    expect(summary.totalGames).toBe(3);
    expect(summary.isEmpty).toBe(false);
    expect(summary.champions).toHaveLength(1);
    expect(summary.champions[0]).toEqual({
      championId: 103,
      championName: 'Ahri',
      games: 3,
      wins: 2,
      losses: 1,
      winrate: 67,
      avgKills: 6,
      avgDeaths: 4,
      avgAssists: 6,
      kda: 3,
      csPerMin: 6.7,
    });
  });

  it('CHMP-02 filters by selected ranked queue and SEASON_START', () => {
    const seasonStart = 1_740_000_000_000;
    const records: ParticipantMatchRecord[] = [
      // Valid Solo in season
      makeRecord({
        championName: 'Ahri',
        queueId: 420,
        gameStartTimestamp: seasonStart + 1000,
      }),
      // Before season start -> excluded
      makeRecord({
        championName: 'Ahri',
        queueId: 420,
        gameStartTimestamp: seasonStart - 1000,
      }),
      // Flex match -> excluded from Solo
      makeRecord({
        championName: 'Lux',
        championId: 99,
        queueId: 440,
        gameStartTimestamp: seasonStart + 5000,
      }),
    ];

    expect(DEFAULT_RANKED_TAB).toBe('solo');
    const soloSummary = aggregateChampionStats(records, {
      queue: 'solo',
      seasonStartMs: seasonStart,
    });
    expect(soloSummary.totalGames).toBe(1);
    expect(soloSummary.champions.map((c) => c.championName)).toEqual(['Ahri']);

    const flexSummary = aggregateChampionStats(records, {
      queue: 'flex',
      seasonStartMs: seasonStart,
    });
    expect(flexSummary.totalGames).toBe(1);
    expect(flexSummary.champions.map((c) => c.championName)).toEqual(['Lux']);
  });

  it('CHMP-04 orders champions by games desc then winrate desc', () => {
    const records: ParticipantMatchRecord[] = [
      // Jinx: 2 games, 1 win (50%)
      makeRecord({ championId: 222, championName: 'Jinx', win: true }),
      makeRecord({ championId: 222, championName: 'Jinx', win: false }),
      // Lux: 2 games, 2 wins (100%)
      makeRecord({ championId: 99, championName: 'Lux', win: true }),
      makeRecord({ championId: 99, championName: 'Lux', win: true }),
      // Ahri: 3 games, 1 win (33%)
      makeRecord({ championId: 103, championName: 'Ahri', win: true }),
      makeRecord({ championId: 103, championName: 'Ahri', win: false }),
      makeRecord({ championId: 103, championName: 'Ahri', win: false }),
    ];

    const summary = aggregateChampionStats(records, {
      queue: 'solo',
      seasonStartMs: 0,
    });

    expect(summary.champions.map((c) => c.championName)).toEqual([
      'Ahri',
      'Lux',
      'Jinx',
    ]);
  });

  it('CHMP-05 excludes remake matches from champion stats', () => {
    const records: ParticipantMatchRecord[] = [
      makeRecord({ championName: 'Ahri', win: true, earlySurrender: false }),
      makeRecord({ championName: 'Ahri', win: false, earlySurrender: true }),
      makeRecord({
        championName: 'Yasuo',
        championId: 157,
        win: false,
        gameEndedInEarlySurrender: true,
      }),
    ];

    const summary = aggregateChampionStats(records, {
      queue: 'solo',
      seasonStartMs: 0,
    });

    expect(summary.totalGames).toBe(1);
    expect(summary.champions).toHaveLength(1);
    expect(summary.champions[0].championName).toBe('Ahri');
    expect(summary.champions[0].games).toBe(1);
  });

  it('CHMP-06 slices visibleChampions to top 7 unless expanded and marks hasMore', () => {
    const champs = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9'];
    const records = champs.map((name, idx) =>
      makeRecord({ championId: idx + 1, championName: name })
    );

    const collapsed = aggregateChampionStats(records, {
      queue: 'solo',
      seasonStartMs: 0,
      expanded: false,
    });
    expect(collapsed.champions).toHaveLength(9);
    expect(collapsed.visibleChampions).toHaveLength(7);
    expect(collapsed.hasMore).toBe(true);

    const expanded = aggregateChampionStats(records, {
      queue: 'solo',
      seasonStartMs: 0,
      expanded: true,
    });
    expect(expanded.visibleChampions).toHaveLength(9);
  });

  it('CHMP-08 marks summary as empty when no ranked matches exist in the season', () => {
    const summary = aggregateChampionStats([], {
      queue: 'solo',
      seasonStartMs: 1_740_000_000_000,
    });
    expect(summary.totalGames).toBe(0);
    expect(summary.isEmpty).toBe(true);
    expect(summary.champions).toEqual([]);
  });
});
