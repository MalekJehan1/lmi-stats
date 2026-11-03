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


