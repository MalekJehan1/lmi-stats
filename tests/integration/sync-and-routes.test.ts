import { describe, expect, it } from 'vitest';
import { InMemorySummonerRepository } from '@/server/db/repository';
import { MatchDto, MatchParticipantDto } from '@/server/riot/client';
import { DEFAULT_SEASON_START_MS } from '@/server/stats/calculators';

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
