import { describe, expect, it, vi } from 'vitest';
import { InMemorySummonerRepository } from '@/server/db/repository';
import {
  MatchDto,
  MatchParticipantDto,
  RiotClient,
  RiotNotFoundError,
  RiotUnavailableError,
} from '@/server/riot/client';
import { DEFAULT_SEASON_START_MS } from '@/server/stats/calculators';
import {
  getCooldownRemainingSeconds,
  RefreshGuard,
  RefreshRateLimitError,
} from '@/server/sync/guards';
import {
  PlayerNotFoundError,
  PlayerNotInRegionError,
  RefreshFailedError,
  SyncService,
} from '@/server/sync/sync-service';
import {
  LookupTimeoutError,
  SyncDispatcher,
  WorkerQueuePayload,
} from '@/server/sync/dispatcher';
import { createLookupHandler } from '@/app/api/summoners/[platform]/[slug]/route';

export function buildFakeMatchDto(
  matchId: string,
  overrides: {
    queueId?: number;
    gameStartTimestamp?: number;
    gameDuration?: number;
    ownerPuuid?: string;
    ownerChampion?: string;
    ownerWin?: boolean;
    earlySurrender?: boolean;
    secondPlayerPuuid?: string;
  } = {}
): MatchDto {
  const queueId = overrides.queueId ?? 420;
  const gameStartTimestamp =
    overrides.gameStartTimestamp ?? DEFAULT_SEASON_START_MS + 100_000;
  const gameDuration = overrides.gameDuration ?? 1800;
  const ownerPuuid = overrides.ownerPuuid ?? 'puuid-player-1';
  const secondPuuid = overrides.secondPlayerPuuid ?? 'puuid-player-2';
  const ownerWin = overrides.ownerWin ?? true;

  const participants: MatchParticipantDto[] = Array.from(
    { length: 10 },
    (_, i) => {
      const isBlue = i < 5;
      const puuid =
        i === 0 ? ownerPuuid : i === 1 ? secondPuuid : `puuid-other-${i}`;
      const championName =
        i === 0 ? overrides.ownerChampion ?? 'Ahri' : `Champ${i}`;
      return {
        participantId: i + 1,
        puuid,
        teamId: isBlue ? 100 : 200,
        riotIdGameName: i === 0 ? 'Faker' : i === 1 ? 'Chovy' : `Player${i}`,
        riotIdTagline: 'BR1',
        championId: 100 + i,
        championName,
        champLevel: 16,
        kills: i === 0 ? 10 : 3,
        deaths: i === 0 ? 2 : 4,
        assists: i === 0 ? 8 : 5,
        totalMinionsKilled: 180,
        neutralMinionsKilled: 20,
        goldEarned: 14500,
        visionScore: 32,
        totalDamageDealtToChampions: i === 0 ? 32000 : 15000,
        item0: 3157,
        item1: 3020,
        item2: 3089,
        item3: 3135,
        item4: 3165,
        item5: 3102,
        item6: 3340,
        summoner1Id: 4,
        summoner2Id: 14,
        perks: {
          styles: [
            {
              style: 8100,
              selections: [{ perk: 8112 }],
            },
            {
              style: 8200,
              selections: [{ perk: 8210 }],
            },
          ],
        },
        win: isBlue ? ownerWin : !ownerWin,
        gameEndedInEarlySurrender: Boolean(overrides.earlySurrender),
      };
    }
  );

  return {
    metadata: {
      matchId,
      participants: participants.map((p) => p.puuid),
    },
    info: {
      gameStartTimestamp,
      gameDuration,
      gameVersion: '14.22.1',
      queueId,
      platformId: 'BR1',
      participants,
      teams: [
        {
          teamId: 100,
          win: ownerWin,
          objectives: {
            champion: { kills: 22 },
            tower: { kills: 9 },
            dragon: { kills: 3 },
            baron: { kills: 1 },
          },
        },
        {
          teamId: 200,
          win: !ownerWin,
          objectives: {
            champion: { kills: 15 },
            tower: { kills: 3 },
            dragon: { kills: 1 },
            baron: { kills: 0 },
          },
        },
      ],
    },
  };
}

describe('Repository', () => {
  it('RIOT-07 stores each matchId only once across multiple profiles', async () => {
    const repo = new InMemorySummonerRepository();

    await repo.upsertSummoner({
      puuid: 'puuid-1',
      platform: 'BR1',
      gameName: 'PlayerOne',
      tagLine: 'BR1',
      profileIconId: 10,
      summonerLevel: 150,
    });
    await repo.upsertSummoner({
      puuid: 'puuid-2',
      platform: 'BR1',
      gameName: 'PlayerTwo',
      tagLine: 'BR1',
      profileIconId: 11,
      summonerLevel: 200,
    });

    const sharedMatch = buildFakeMatchDto('BR1_999999', {
      ownerPuuid: 'puuid-1',
      secondPlayerPuuid: 'puuid-2',
    });

    await repo.upsertMatch('BR1', sharedMatch);
    await repo.upsertMatch('BR1', sharedMatch);

    expect(await repo.getMatchCount()).toBe(1);
    const existing = await repo.getExistingMatchIds([
      'BR1_999999',
      'BR1_000000',
    ]);
    expect(existing.has('BR1_999999')).toBe(true);
    expect(existing.has('BR1_000000')).toBe(false);

    const p1Matches = await repo.getMatchesForPlayer('puuid-1');
    const p2Matches = await repo.getMatchesForPlayer('puuid-2');

    expect(p1Matches.matches).toHaveLength(1);
    expect(p2Matches.matches).toHaveLength(1);
    expect(p1Matches.matches[0].matchId).toBe('BR1_999999');
    expect(p2Matches.matches[0].matchId).toBe('BR1_999999');
    expect(p1Matches.matches[0].owner.puuid).toBe('puuid-1');
    expect(p2Matches.matches[0].owner.puuid).toBe('puuid-2');
  });

  it('finds summoners case-insensitively by Riot ID and replaces league entries', async () => {
    const repo = new InMemorySummonerRepository();
    await repo.upsertSummoner({
      puuid: 'puuid-abc',
      platform: 'BR1',
      gameName: 'KamiKat',
      tagLine: 'BR1',
      profileIconId: 29,
      summonerLevel: 412,
    });

    const found = await repo.findSummonerByRiotId('br1', 'kamikat', 'br1');
    expect(found).not.toBeNull();
    expect(found?.puuid).toBe('puuid-abc');
    expect(found?.gameName).toBe('KamiKat');

    await repo.replaceLeagueEntries('BR1', 'puuid-abc', [
      {
        queueType: 'RANKED_SOLO_5x5',
        tier: 'CHALLENGER',
        rank: 'I',
        leaguePoints: 1050,
        wins: 120,
        losses: 80,
      },
    ]);

    const profile = await repo.getProfileData('BR1', 'puuid-abc');
    expect(profile).not.toBeNull();
    expect(profile?.leagues.solo?.tier).toBe('CHALLENGER');
    expect(profile?.leagues.solo?.winrate).toBe(60);
    expect(profile?.leagues.flex).toBeNull();
  });

  it('MATCH-08 embeds all 10 participants and both teams in match history for zero-fetch inline detail', async () => {
    const repo = new InMemorySummonerRepository();
    await repo.upsertSummoner({
      puuid: 'puuid-main',
      platform: 'BR1',
      gameName: 'MainPlayer',
      tagLine: 'BR1',
      profileIconId: 1,
      summonerLevel: 100,
    });

    await repo.upsertMatch(
      'BR1',
      buildFakeMatchDto('BR1_101', {
        ownerPuuid: 'puuid-main',
        queueId: 420,
        gameStartTimestamp: DEFAULT_SEASON_START_MS + 50_000,
      })
    );
    await repo.upsertMatch(
      'BR1',
      buildFakeMatchDto('BR1_102', {
        ownerPuuid: 'puuid-main',
        queueId: 450,
        gameStartTimestamp: DEFAULT_SEASON_START_MS + 90_000,
      })
    );

    const allMatches = await repo.getMatchesForPlayer('puuid-main', {
      tab: 'all',
    });
    expect(allMatches.matches).toHaveLength(2);
    expect(allMatches.matches[0].matchId).toBe('BR1_102');
    expect(allMatches.matches[0].participants).toHaveLength(10);
    expect(allMatches.matches[0].teams).toHaveLength(2);

    const aramOnly = await repo.getMatchesForPlayer('puuid-main', {
      tab: 'aram',
    });
    expect(aramOnly.matches).toHaveLength(1);
    expect(aramOnly.matches[0].matchId).toBe('BR1_102');

    const olderPage = await repo.getMatchesForPlayer('puuid-main', {
      tab: 'all',
      cursor: allMatches.matches[0].gameStartTimestamp,
    });
    expect(olderPage.matches).toHaveLength(1);
    expect(olderPage.matches[0].matchId).toBe('BR1_101');
  });

  it('aggregates seasonal Solo and Flex champion stats in getProfileData', async () => {
    const repo = new InMemorySummonerRepository();
    await repo.upsertSummoner({
      puuid: 'puuid-ranked',
      platform: 'BR1',
      gameName: 'RankedStar',
      tagLine: 'BR1',
      profileIconId: 5,
      summonerLevel: 250,
    });

    await repo.upsertMatch(
      'BR1',
      buildFakeMatchDto('BR1_201', {
        ownerPuuid: 'puuid-ranked',
        ownerChampion: 'Ahri',
        ownerWin: true,
        queueId: 420,
        gameStartTimestamp: DEFAULT_SEASON_START_MS + 10_000,
      })
    );
    await repo.upsertMatch(
      'BR1',
      buildFakeMatchDto('BR1_202', {
        ownerPuuid: 'puuid-ranked',
        ownerChampion: 'Ahri',
        ownerWin: false,
        queueId: 420,
        gameStartTimestamp: DEFAULT_SEASON_START_MS + 20_000,
      })
    );

    const profile = await repo.getProfileData('BR1', 'puuid-ranked');
    expect(profile?.championStats.solo.totalGames).toBe(2);
    expect(profile?.championStats.solo.champions[0].championName).toBe('Ahri');
    expect(profile?.championStats.solo.champions[0].winrate).toBe(50);
    expect(profile?.championStats.flex.isEmpty).toBe(true);
  });
});

describe('Guards Unit', () => {
  it('computes remaining cooldown seconds for 120s window (REFR-03)', () => {
    const now = 1_700_000_000_000;
    expect(getCooldownRemainingSeconds(now - 30_000, now)).toBe(90);
    expect(getCooldownRemainingSeconds(now - 119_200, now)).toBe(1);
    expect(getCooldownRemainingSeconds(now - 120_000, now)).toBe(0);
    expect(getCooldownRemainingSeconds(null, now)).toBe(0);
  });

  it('rejects refresh during 120s cooldown with RefreshRateLimitError (REFR-04)', () => {
    const now = 1_700_000_000_000;
    const guard = new RefreshGuard({ now: () => now });

    expect(() =>
      guard.assertRefreshAllowed({
        lastUpdatedAt: new Date(now - 45_000),
        ip: '192.168.1.10',
      })
    ).toThrowError(RefreshRateLimitError);

    try {
      guard.assertRefreshAllowed({
        lastUpdatedAt: new Date(now - 45_000),
        ip: '192.168.1.10',
      });
    } catch (err) {
      expect(err).toBeInstanceOf(RefreshRateLimitError);
      const rlErr = err as RefreshRateLimitError;
      expect(rlErr.status).toBe(429);
      expect(rlErr.reason).toBe('cooldown');
      expect(rlErr.retryAfterSeconds).toBe(75);
    }
  });

  it('allows refresh when lastUpdatedAt is older than 120s', () => {
    const now = 1_700_000_000_000;
    const guard = new RefreshGuard({ now: () => now });

    expect(() =>
      guard.assertRefreshAllowed({
        lastUpdatedAt: new Date(now - 121_000),
        ip: '192.168.1.10',
      })
    ).not.toThrow();
  });

  it('rejects 11th refresh request from same IP within 60s (REFR-05)', () => {
    let now = 1_700_000_000_000;
    const guard = new RefreshGuard({ now: () => now });

    for (let i = 0; i < 10; i++) {
      guard.assertRefreshAllowed({
        lastUpdatedAt: null,
        ip: '203.0.113.5',
      });
      now += 1000;
    }

    expect(() =>
      guard.assertRefreshAllowed({
        lastUpdatedAt: null,
        ip: '203.0.113.5',
      })
    ).toThrowError(RefreshRateLimitError);

    // Different IP is unaffected
    expect(() =>
      guard.assertRefreshAllowed({
        lastUpdatedAt: null,
        ip: '203.0.113.99',
      })
    ).not.toThrow();
  });

  it('allows IP requests again after 60s sliding window elapses', () => {
    let now = 1_700_000_000_000;
    const guard = new RefreshGuard({ now: () => now });

    for (let i = 0; i < 10; i++) {
      guard.assertRefreshAllowed({
        lastUpdatedAt: null,
        ip: '10.0.0.1',
      });
    }

    now += 60_001;
    expect(() =>
      guard.assertRefreshAllowed({
        lastUpdatedAt: null,
        ip: '10.0.0.1',
      })
    ).not.toThrow();
  });
});

function createMockRiotClient(overrides: Partial<RiotClient> = {}): RiotClient {
  const base = {
    getAccountByRiotId: vi.fn().mockResolvedValue({
      puuid: 'puuid-faker',
      gameName: 'Hide on bush',
      tagLine: 'KR1',
    }),
    getAccountByPuuid: vi.fn().mockResolvedValue({
      puuid: 'puuid-faker',
      gameName: 'Hide on bush',
      tagLine: 'KR1',
    }),
    getSummonerByPuuid: vi.fn().mockResolvedValue({
      puuid: 'puuid-faker',
      profileIconId: 6,
      summonerLevel: 780,
    }),
    getLeagueEntriesByPuuid: vi.fn().mockResolvedValue([
      {
        queueType: 'RANKED_SOLO_5x5',
        tier: 'CHALLENGER',
        rank: 'I',
        leaguePoints: 1420,
        wins: 180,
        losses: 120,
      },
    ]),
    getMatchIds: vi.fn().mockResolvedValue(
      Array.from({ length: 20 }, (_, i) => `BR1_${1000 + i}`)
    ),
    getMatch: vi.fn().mockImplementation(async (_regional: string, id: string) => {
      const idx = Number(id.split('_')[1] || 0);
      return buildFakeMatchDto(id, {
        ownerPuuid: 'puuid-faker',
        gameStartTimestamp: DEFAULT_SEASON_START_MS + (2000 - idx) * 60_000,
      });
    }),
    ...overrides,
  };
  return base as unknown as RiotClient;
}

describe('SyncService Integration', () => {
  it('throws PlayerNotFoundError when account-v1 returns 404 (SRCH-07)', async () => {
    const repo = new InMemorySummonerRepository();
    const riotClient = createMockRiotClient({
      getAccountByRiotId: vi
        .fn()
        .mockRejectedValue(new RiotNotFoundError('Account 404')),
    });
    const service = new SyncService({ riotClient, repository: repo });

    await expect(
      service.lookup('BR1', 'GhostPlayer', 'BR1')
    ).rejects.toBeInstanceOf(PlayerNotFoundError);
  });

  it('throws PlayerNotInRegionError when summoner-v4 returns 404 in selected platform (SRCH-08)', async () => {
    const repo = new InMemorySummonerRepository();
    const riotClient = createMockRiotClient({
      getSummonerByPuuid: vi
        .fn()
        .mockRejectedValue(new RiotNotFoundError('Summoner 404')),
    });
    const service = new SyncService({ riotClient, repository: repo });

    await expect(
      service.lookup('KR', 'Hide on bush', 'KR1')
    ).rejects.toBeInstanceOf(PlayerNotInRegionError);
  });

  it('skips individual 404 matches during lookup and continues saving remaining matches', async () => {
    const repo = new InMemorySummonerRepository();
    const riotClient = createMockRiotClient({
      getMatchIds: vi.fn().mockResolvedValue(['BR1_1', 'BR1_404', 'BR1_2']),
      getMatch: vi
        .fn()
        .mockImplementation(async (_reg: string, matchId: string) => {
          if (matchId === 'BR1_404') {
            throw new RiotNotFoundError('Match not found');
          }
          return buildFakeMatchDto(matchId, {
            ownerPuuid: 'puuid-faker',
            gameStartTimestamp:
              matchId === 'BR1_1'
                ? DEFAULT_SEASON_START_MS + 90_000
                : DEFAULT_SEASON_START_MS + 60_000,
          });
        }),
    });
    const service = new SyncService({ riotClient, repository: repo });

    const res = await service.lookup('BR1', 'Hide on bush', 'KR1');
    expect(res.profile.matches).toHaveLength(2);
    expect(res.profile.matches.map((m) => m.matchId)).toEqual([
      'BR1_1',
      'BR1_2',
    ]);
  });

  it('preserves saved profile data when Riot API fails during refresh (REFR-08)', async () => {
    const repo = new InMemorySummonerRepository();
    const initialRiot = createMockRiotClient({
      getMatchIds: vi.fn().mockResolvedValue(['BR1_500']),
    });
    const serviceOk = new SyncService({
      riotClient: initialRiot,
      repository: repo,
    });
    await serviceOk.lookup('BR1', 'Hide on bush', 'KR1');

    const failingRiot = createMockRiotClient({
      getSummonerByPuuid: vi
        .fn()
        .mockRejectedValue(new RiotUnavailableError('Riot 503')),
    });
    const serviceFail = new SyncService({
      riotClient: failingRiot,
      repository: repo,
    });

    await expect(
      serviceFail.refresh('BR1', 'puuid-faker')
    ).rejects.toBeInstanceOf(RefreshFailedError);

    const saved = await repo.getProfileData('BR1', 'puuid-faker');
    expect(saved).not.toBeNull();
    expect(saved?.summoner.gameName).toBe('Hide on bush');
    expect(saved?.matches).toHaveLength(1);
    expect(saved?.matches[0].matchId).toBe('BR1_500');
  });

  it('marks hasMore false in loadMore when Riot API returns fewer than 20 matches (HIST-05)', async () => {
    const repo = new InMemorySummonerRepository();
    const riotClient = createMockRiotClient({
      getMatchIds: vi.fn().mockResolvedValue(['BR1_901', 'BR1_902', 'BR1_903']),
    });
    const service = new SyncService({ riotClient, repository: repo });
    await repo.upsertSummoner({
      puuid: 'puuid-faker',
      platform: 'BR1',
      gameName: 'Hide on bush',
      tagLine: 'KR1',
      profileIconId: 6,
      summonerLevel: 780,
    });

    const page = await service.loadMore('BR1', 'puuid-faker', {
      tab: 'solo',
      count: 20,
    });
    expect(page.matches).toHaveLength(3);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
  });

  it('filters normal queue tab in loadMore with type=normal', async () => {
    const repo = new InMemorySummonerRepository();
    const getMatchIdsMock = vi.fn().mockResolvedValue(['BR1_701', 'BR1_702']);
    const riotClient = createMockRiotClient({
      getMatchIds: getMatchIdsMock,
      getMatch: vi.fn().mockImplementation(async (_reg: string, id: string) =>
        buildFakeMatchDto(id, {
          ownerPuuid: 'puuid-faker',
          queueId: id === 'BR1_701' ? 400 : 1700, // 400 is Normal Draft, 1700 is Arena
          gameStartTimestamp:
            id === 'BR1_701'
              ? DEFAULT_SEASON_START_MS + 50_000
              : DEFAULT_SEASON_START_MS + 40_000,
        })
      ),
    });
    const service = new SyncService({ riotClient, repository: repo });

    const page = await service.loadMore('BR1', 'puuid-faker', {
      tab: 'normal',
      count: 20,
    });
    expect(getMatchIdsMock).toHaveBeenCalledWith(
      'americas',
      'puuid-faker',
      expect.objectContaining({ type: 'normal', count: 20 })
    );
    expect(page.matches).toHaveLength(1);
    expect(page.matches[0].matchId).toBe('BR1_701');
  });

  it('fetches up to 100 new matches stopping at latest saved match on refresh (REFR-01)', async () => {
    const repo = new InMemorySummonerRepository();
    const initialRiot = createMockRiotClient({
      getMatchIds: vi.fn().mockResolvedValue(['BR1_1002', 'BR1_1003']),
    });
    const service = new SyncService({
      riotClient: initialRiot,
      repository: repo,
    });
    await service.lookup('BR1', 'Hide on bush', 'KR1');

    const getMatchSpy = vi
      .fn()
      .mockImplementation(async (_reg: string, id: string) => {
        const idx = Number(id.split('_')[1] || 0);
        return buildFakeMatchDto(id, {
          ownerPuuid: 'puuid-faker',
          gameStartTimestamp: DEFAULT_SEASON_START_MS + (2000 - idx) * 60_000,
        });
      });
    const refreshRiot = createMockRiotClient({
      getMatchIds: vi
        .fn()
        .mockResolvedValue(['BR1_1000', 'BR1_1001', 'BR1_1002', 'BR1_1003']),
      getMatch: getMatchSpy,
    });
    const refreshService = new SyncService({
      riotClient: refreshRiot,
      repository: repo,
    });

    const refreshed = await refreshService.refresh('BR1', 'puuid-faker');
    expect(refreshed.newMatchesFetched).toBe(2);
    expect(getMatchSpy).toHaveBeenCalledTimes(2);
    expect(refreshed.profile.matches).toHaveLength(4);
  });

  it('updates Riot ID and returns newSlug when player renamed on refresh (REFR-09)', async () => {
    const repo = new InMemorySummonerRepository();
    const initialRiot = createMockRiotClient({
      getMatchIds: vi.fn().mockResolvedValue(['BR1_1001']),
    });
    const service = new SyncService({
      riotClient: initialRiot,
      repository: repo,
    });
    await service.lookup('BR1', 'Hide on bush', 'KR1');

    const renamedRiot = createMockRiotClient({
      getAccountByPuuid: vi.fn().mockResolvedValue({
        puuid: 'puuid-faker',
        gameName: 'T1 Faker',
        tagLine: 'GOAT',
      }),
      getMatchIds: vi.fn().mockResolvedValue(['BR1_1001']),
    });
    const renamedService = new SyncService({
      riotClient: renamedRiot,
      repository: repo,
    });

    const res = await renamedService.refresh('BR1', 'puuid-faker');
    expect(res.renamed).toBe(true);
    expect(res.newSlug).toBe('T1%20Faker-GOAT');
    expect(res.profile.summoner.gameName).toBe('T1 Faker');
    expect(res.profile.summoner.tagLine).toBe('GOAT');
  });
});

describe('SyncDispatcher Unit', () => {
  it('deduplicates concurrent dispatchRefresh calls for the same player (REFR-06)', async () => {
    const repo = new InMemorySummonerRepository();
    const initialRiot = createMockRiotClient({
      getMatchIds: vi.fn().mockResolvedValue(['BR1_1001']),
    });
    const baseService = new SyncService({
      riotClient: initialRiot,
      repository: repo,
    });
    await baseService.lookup('BR1', 'Hide on bush', 'KR1');

    const getSummonerSpy = vi.fn().mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 25));
      return {
        puuid: 'puuid-faker',
        profileIconId: 7,
        summonerLevel: 781,
      };
    });
    const slowRiot = createMockRiotClient({
      getSummonerByPuuid: getSummonerSpy,
      getMatchIds: vi.fn().mockResolvedValue(['BR1_1001']),
    });
    const syncService = new SyncService({
      riotClient: slowRiot,
      repository: repo,
    });
    const dispatcher = new SyncDispatcher({ syncService, mode: 'inline' });

    const [res1, res2] = await Promise.all([
      dispatcher.dispatchRefresh('BR1', 'puuid-faker'),
      dispatcher.dispatchRefresh('br1', 'puuid-faker'),
    ]);

    expect(getSummonerSpy).toHaveBeenCalledTimes(1);
    expect(res1.jobId).toBe('refresh:BR1:puuid-faker');
    expect(res2.jobId).toBe('refresh:BR1:puuid-faker');
    expect(res1.profile.summoner.summonerLevel).toBe(781);
    expect(res2.profile.summoner.summonerLevel).toBe(781);
    expect(dispatcher.getJobStatus(res1.jobId)?.state).toBe('completed');
  });

  it('deduplicates concurrent dispatchLookup calls case-insensitively', async () => {
    const repo = new InMemorySummonerRepository();
    const getAccountSpy = vi.fn().mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 25));
      return {
        puuid: 'puuid-faker',
        gameName: 'Hide on bush',
        tagLine: 'KR1',
      };
    });
    const riotClient = createMockRiotClient({
      getAccountByRiotId: getAccountSpy,
      getMatchIds: vi.fn().mockResolvedValue(['BR1_1001']),
    });
    const syncService = new SyncService({ riotClient, repository: repo });
    const dispatcher = new SyncDispatcher({ syncService });

    const [r1, r2] = await Promise.all([
      dispatcher.dispatchLookup('BR1', 'Hide on bush', 'KR1'),
      dispatcher.dispatchLookup('br1', 'HIDE ON BUSH', 'kr1'),
    ]);

    expect(getAccountSpy).toHaveBeenCalledTimes(1);
    expect(r1.jobId).toBe(r2.jobId);
    expect(r1.puuid).toBe('puuid-faker');
  });

  it('throws LookupTimeoutError when initial lookup exceeds timeoutMs (SRCH-10)', async () => {
    const repo = new InMemorySummonerRepository();
    const riotClient = createMockRiotClient({
      getAccountByRiotId: vi.fn().mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 80));
        return {
          puuid: 'puuid-slow',
          gameName: 'SlowPlayer',
          tagLine: 'BR1',
        };
      }),
    });
    const syncService = new SyncService({ riotClient, repository: repo });
    const dispatcher = new SyncDispatcher({
      syncService,
      defaultLookupTimeoutMs: 15,
    });

    await expect(
      dispatcher.dispatchLookup('BR1', 'SlowPlayer', 'BR1')
    ).rejects.toBeInstanceOf(LookupTimeoutError);
  });

  it('supports worker mode with queueAdapter and tracks failed job status', async () => {
    const repo = new InMemorySummonerRepository();
    const enqueued: WorkerQueuePayload[] = [];
    const riotClient = createMockRiotClient({
      getAccountByRiotId: vi
        .fn()
        .mockRejectedValue(new RiotNotFoundError('404')),
    });
    const syncService = new SyncService({ riotClient, repository: repo });
    const dispatcher = new SyncDispatcher({
      syncService,
      mode: 'worker',
      queueAdapter: {
        async enqueue(payload) {
          enqueued.push(payload);
        },
      },
    });

    await expect(
      dispatcher.dispatchLookup('BR1', 'Missing', 'BR1')
    ).rejects.toBeInstanceOf(PlayerNotFoundError);

    expect(enqueued).toHaveLength(1);
    expect(enqueued[0].jobId).toBe('lookup:BR1:missing#br1');
    const status = dispatcher.getJobStatus('lookup:BR1:missing#br1');
    expect(status?.state).toBe('failed');
    expect(status?.error).toBe('not_found');
  });
});

describe('Lookup and Sync', () => {
  it('SRCH-04 fetches account, summoner, leagues and 20 matches and saves to DB', async () => {
    const repo = new InMemorySummonerRepository();
    const getAccountSpy = vi.fn().mockResolvedValue({
      puuid: 'puuid-brtt',
      gameName: 'brTT',
      tagLine: 'REX',
    });
    const getSummonerSpy = vi.fn().mockResolvedValue({
      puuid: 'puuid-brtt',
      profileIconId: 501,
      summonerLevel: 520,
    });
    const getLeaguesSpy = vi.fn().mockResolvedValue([
      {
        queueType: 'RANKED_SOLO_5x5',
        tier: 'GRANDMASTER',
        rank: 'I',
        leaguePoints: 680,
        wins: 95,
        losses: 75,
      },
    ]);
    const matchIds = Array.from({ length: 20 }, (_, i) => `BR1_${5000 + i}`);
    const getMatchIdsSpy = vi.fn().mockResolvedValue(matchIds);
    const getMatchSpy = vi
      .fn()
      .mockImplementation(async (_reg: string, id: string) => {
        const idx = Number(id.split('_')[1] || 0);
        return buildFakeMatchDto(id, {
          ownerPuuid: 'puuid-brtt',
          ownerChampion: 'Draven',
          gameStartTimestamp: DEFAULT_SEASON_START_MS + (6000 - idx) * 60_000,
        });
      });

    const riotClient = createMockRiotClient({
      getAccountByRiotId: getAccountSpy,
      getSummonerByPuuid: getSummonerSpy,
      getLeagueEntriesByPuuid: getLeaguesSpy,
      getMatchIds: getMatchIdsSpy,
      getMatch: getMatchSpy,
    });

    const syncService = new SyncService({ riotClient, repository: repo });
    const dispatcher = new SyncDispatcher({ syncService });
    const handler = createLookupHandler({ repository: repo, dispatcher });

    const req = new Request('http://localhost/api/summoners/BR1/brTT-REX');
    const res = await handler(req, {
      params: Promise.resolve({ platform: 'BR1', slug: 'brTT-REX' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fromCache).toBe(false);
    expect(body.profile.summoner.gameName).toBe('brTT');
    expect(body.profile.summoner.tagLine).toBe('REX');
    expect(body.profile.summoner.summonerLevel).toBe(520);
    expect(body.profile.leagues.solo.tier).toBe('GRANDMASTER');
    expect(body.profile.matches).toHaveLength(20);
    expect(body.profile.championStats.solo.totalGames).toBe(20);
    expect(body.profile.championStats.solo.champions[0].championName).toBe(
      'Draven'
    );

    expect(getAccountSpy).toHaveBeenCalledTimes(1);
    expect(getSummonerSpy).toHaveBeenCalledTimes(1);
    expect(getLeaguesSpy).toHaveBeenCalledTimes(1);
    expect(getMatchIdsSpy).toHaveBeenCalledTimes(1);
    expect(getMatchSpy).toHaveBeenCalledTimes(20);

    const savedInDb = await repo.findSummonerByRiotId('BR1', 'brtt', 'rex');
    expect(savedInDb).not.toBeNull();
    expect(await repo.getMatchCount()).toBe(20);
  });

  it('SRCH-05 serves saved player from DB with zero Riot API calls', async () => {
    const repo = new InMemorySummonerRepository();
    await repo.upsertSummoner({
      puuid: 'puuid-saved',
      platform: 'BR1',
      gameName: 'SavedPlayer',
      tagLine: 'BR1',
      profileIconId: 25,
      summonerLevel: 310,
    });
    await repo.replaceLeagueEntries('BR1', 'puuid-saved', [
      {
        queueType: 'RANKED_SOLO_5x5',
        tier: 'DIAMOND',
        rank: 'II',
        leaguePoints: 74,
        wins: 55,
        losses: 45,
      },
    ]);
    await repo.upsertMatch(
      'BR1',
      buildFakeMatchDto('BR1_8888', {
        ownerPuuid: 'puuid-saved',
        ownerChampion: 'Lux',
      })
    );

    const getAccountSpy = vi.fn();
    const getSummonerSpy = vi.fn();
    const getLeaguesSpy = vi.fn();
    const getMatchIdsSpy = vi.fn();
    const getMatchSpy = vi.fn();
    const riotClient = createMockRiotClient({
      getAccountByRiotId: getAccountSpy,
      getSummonerByPuuid: getSummonerSpy,
      getLeagueEntriesByPuuid: getLeaguesSpy,
      getMatchIds: getMatchIdsSpy,
      getMatch: getMatchSpy,
    });
    const syncService = new SyncService({ riotClient, repository: repo });
    const dispatcher = new SyncDispatcher({ syncService });
    const handler = createLookupHandler({ repository: repo, dispatcher });

    const req = new Request(
      'http://localhost/api/summoners/br1/savedplayer-br1'
    );
    const res = await handler(req, {
      params: { platform: 'br1', slug: 'savedplayer-br1' },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fromCache).toBe(true);
    expect(body.profile.summoner.gameName).toBe('SavedPlayer');
    expect(body.profile.leagues.solo.tier).toBe('DIAMOND');
    expect(body.profile.matches).toHaveLength(1);

    expect(getAccountSpy).not.toHaveBeenCalled();
    expect(getSummonerSpy).not.toHaveBeenCalled();
    expect(getLeaguesSpy).not.toHaveBeenCalled();
    expect(getMatchIdsSpy).not.toHaveBeenCalled();
    expect(getMatchSpy).not.toHaveBeenCalled();
  });

  it('returns 404 not_found with Riot ID and region when Riot account does not exist (SRCH-07)', async () => {
    const repo = new InMemorySummonerRepository();
    const riotClient = createMockRiotClient({
      getAccountByRiotId: vi
        .fn()
        .mockRejectedValue(new RiotNotFoundError('404')),
    });
    const syncService = new SyncService({ riotClient, repository: repo });
    const dispatcher = new SyncDispatcher({ syncService });
    const handler = createLookupHandler({ repository: repo, dispatcher });

    const res = await handler(
      new Request('http://localhost/api/summoners/BR1/Unknown-BR1'),
      { params: { platform: 'BR1', slug: 'Unknown-BR1' } }
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('not_found');
    expect(body.message).toBe('Jogador não encontrado');
    expect(body.riotId).toBe('Unknown#BR1');
    expect(body.platform).toBe('BR1');
  });

  it('returns 404 not_in_region when account has no summoner in selected platform (SRCH-08)', async () => {
    const repo = new InMemorySummonerRepository();
    const riotClient = createMockRiotClient({
      getSummonerByPuuid: vi
        .fn()
        .mockRejectedValue(new RiotNotFoundError('404')),
    });
    const syncService = new SyncService({ riotClient, repository: repo });
    const dispatcher = new SyncDispatcher({ syncService });
    const handler = createLookupHandler({ repository: repo, dispatcher });

    const res = await handler(
      new Request('http://localhost/api/summoners/EUW1/Hide%20on%20bush-KR1'),
      { params: { platform: 'EUW1', slug: 'Hide%20on%20bush-KR1' } }
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('not_in_region');
    expect(body.message).toBe('Jogador não encontrado nesta região');
  });

  it('returns 504 with timeout message when initial lookup exceeds timeout (SRCH-10)', async () => {
    const repo = new InMemorySummonerRepository();
    const riotClient = createMockRiotClient({
      getAccountByRiotId: vi.fn().mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 60));
        return {
          puuid: 'puuid-slow',
          gameName: 'SlowOne',
          tagLine: 'BR1',
        };
      }),
    });
    const syncService = new SyncService({ riotClient, repository: repo });
    const dispatcher = new SyncDispatcher({ syncService });
    const handler = createLookupHandler({
      repository: repo,
      dispatcher,
      timeoutMs: 10,
    });

    const res = await handler(
      new Request('http://localhost/api/summoners/BR1/SlowOne-BR1'),
      { params: { platform: 'BR1', slug: 'SlowOne-BR1' } }
    );

    expect(res.status).toBe(504);
    const body = await res.json();
    expect(body.error).toBe('timeout');
    expect(body.message).toBe(
      'Muitas buscas no momento. Tente novamente em instantes.'
    );
  });
});




