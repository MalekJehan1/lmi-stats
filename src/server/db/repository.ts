import { PrismaClient } from '@prisma/client';
import {
  LeagueEntryDto,
  MatchDto,
  MatchParticipantDto,
} from '@/server/riot/client';
import { normalizeRiotId, toSummonerSlug } from '@/server/riot/riot-id';
import {
  aggregateChampionStats,
  ChampionStat,
  ChampionStatsSummary,
  csPerMin,
  kdaRatio,
  killParticipation,
  matchesQueueTab,
  ParticipantMatchRecord,
  QueueTab,
  winrate,
} from '@/server/stats/calculators';

export type { ChampionStat, ChampionStatsSummary };

export interface SummonerRecord {
  puuid: string;
  platform: string;
  gameName: string;
  tagLine: string;
  gameNameNorm: string;
  tagLineNorm: string;
  profileIconId: number;
  summonerLevel: number;
  lastUpdatedAt: Date;
}

export interface LeagueEntryData {
  puuid: string;
  platform: string;
  queueType: 'RANKED_SOLO_5x5' | 'RANKED_FLEX_SR' | string;
  tier: string;
  rank: string;
  leaguePoints: number;
  wins: number;
  losses: number;
  winrate: number;
}

export interface MatchParticipantData {
  matchId: string;
  puuid: string;
  participantId: number;
  teamId: number;
  riotIdGameName: string;
  riotIdTagline: string;
  championId: number;
  championName: string;
  champLevel: number;
  kills: number;
  deaths: number;
  assists: number;
  kda: number | 'perfect';
  cs: number;
  csPerMin: number;
  killParticipation: number;
  goldEarned: number;
  visionScore: number;
  damageToChampions: number;
  items: number[];
  summoner1Id: number;
  summoner2Id: number;
  keystoneId: number;
  secondaryStyleId: number;
  win: boolean;
  earlySurrender: boolean;
  queueId: number;
  gameStartTimestamp: number;
}

export interface MatchTeamData {
  matchId: string;
  teamId: number;
  win: boolean;
  kills: number;
  towers: number;
  dragons: number;
  barons: number;
}

export interface MatchDetailData {
  matchId: string;
  platform: string;
  queueId: number;
  gameStartTimestamp: number;
  gameDuration: number;
  gameVersion: string;
  participants: MatchParticipantData[];
  teams: MatchTeamData[];
}

export interface MatchSummaryData {
  matchId: string;
  platform: string;
  queueId: number;
  gameStartTimestamp: number;
  gameDuration: number;
  gameVersion: string;
  owner: MatchParticipantData;
  teams: MatchTeamData[];
  participants: MatchParticipantData[];
}

export interface SummonerProfileData {
  summoner: {
    puuid: string;
    platform: string;
    gameName: string;
    tagLine: string;
    slug: string;
    profileIconId: number;
    summonerLevel: number;
    lastUpdatedAt: string;
  };
  leagues: {
    solo: LeagueEntryData | null;
    flex: LeagueEntryData | null;
  };
  matches: MatchSummaryData[];
  nextCursor: number | null;
  hasMoreMatches: boolean;
  championStats: {
    solo: ChampionStatsSummary;
    flex: ChampionStatsSummary;
  };
}

export interface UpsertSummonerInput {
  puuid: string;
  platform: string;
  gameName: string;
  tagLine: string;
  profileIconId: number;
  summonerLevel: number;
  lastUpdatedAt?: Date;
}

export interface GetMatchesOptions {
  tab?: QueueTab;
  cursor?: number;
  limit?: number;
}

export interface SummonerRepository {
  findSummonerByRiotId(
    platform: string,
    gameName: string,
    tagLine: string
  ): Promise<SummonerRecord | null>;
  findSummonerByPuuid(
    platform: string,
    puuid: string
  ): Promise<SummonerRecord | null>;
  upsertSummoner(input: UpsertSummonerInput): Promise<SummonerRecord>;
  replaceLeagueEntries(
    platform: string,
    puuid: string,
    entries: LeagueEntryDto[]
  ): Promise<LeagueEntryData[]>;
  getLeagueEntries(
    platform: string,
    puuid: string
  ): Promise<LeagueEntryData[]>;
  hasMatch(matchId: string): Promise<boolean>;
  getExistingMatchIds(matchIds: string[]): Promise<Set<string>>;
  upsertMatch(platform: string, dto: MatchDto): Promise<MatchDetailData>;
  getMatchCount(): Promise<number>;
  getMatchesForPlayer(
    puuid: string,
    options?: GetMatchesOptions
  ): Promise<{ matches: MatchSummaryData[]; nextCursor: number | null }>;
  getParticipantRecordsForSeason(
    puuid: string,
    seasonStartMs?: number
  ): Promise<ParticipantMatchRecord[]>;
  getProfileData(
    platform: string,
    puuid: string,
    options?: { tab?: QueueTab; limit?: number; seasonStartMs?: number }
  ): Promise<SummonerProfileData | null>;
}

function extractKeystoneId(p: MatchParticipantDto): number {
  return p.perks?.styles?.[0]?.selections?.[0]?.perk ?? 0;
}

function extractSecondaryStyleId(p: MatchParticipantDto): number {
  return p.perks?.styles?.[1]?.style ?? 0;
}

function mapDtoToDetail(platform: string, dto: MatchDto): MatchDetailData {
  const matchId = dto.metadata.matchId;
  const gameDuration = dto.info.gameDuration;
  const gameStartTimestamp = dto.info.gameStartTimestamp;
  const queueId = dto.info.queueId;

  const teams: MatchTeamData[] = (dto.info.teams ?? []).map((t) => ({
    matchId,
    teamId: t.teamId,
    win: Boolean(t.win),
    kills: t.objectives?.champion?.kills ?? 0,
    towers: t.objectives?.tower?.kills ?? 0,
    dragons: t.objectives?.dragon?.kills ?? 0,
    barons: t.objectives?.baron?.kills ?? 0,
  }));

  const teamKillsByTeam = new Map<number, number>();
  for (const t of teams) {
    teamKillsByTeam.set(t.teamId, t.kills);
  }
  if (teamKillsByTeam.size === 0) {
    for (const p of dto.info.participants) {
      teamKillsByTeam.set(
        p.teamId,
        (teamKillsByTeam.get(p.teamId) ?? 0) + p.kills
      );
    }
  }

  const participants: MatchParticipantData[] = dto.info.participants.map(
    (p, idx) => {
      const cs = (p.totalMinionsKilled ?? 0) + (p.neutralMinionsKilled ?? 0);
      const teamKills = teamKillsByTeam.get(p.teamId) ?? 0;
      const riotIdGameName =
        p.riotIdGameName?.trim() || p.summonerName?.trim() || `Player${idx + 1}`;
      const riotIdTagline = p.riotIdTagline?.trim() || platform.toUpperCase();

      return {
        matchId,
        puuid: p.puuid,
        participantId: p.participantId || idx + 1,
        teamId: p.teamId,
        riotIdGameName,
        riotIdTagline,
        championId: p.championId,
        championName: p.championName,
        champLevel: p.champLevel,
        kills: p.kills,
        deaths: p.deaths,
        assists: p.assists,
        kda: kdaRatio(p.kills, p.deaths, p.assists),
        cs,
        csPerMin: csPerMin(cs, gameDuration),
        killParticipation: killParticipation(p.kills, p.assists, teamKills),
        goldEarned: p.goldEarned ?? 0,
        visionScore: p.visionScore ?? 0,
        damageToChampions: p.totalDamageDealtToChampions ?? 0,
        items: [
          p.item0 ?? 0,
          p.item1 ?? 0,
          p.item2 ?? 0,
          p.item3 ?? 0,
          p.item4 ?? 0,
          p.item5 ?? 0,
          p.item6 ?? 0,
        ],
        summoner1Id: p.summoner1Id ?? 0,
        summoner2Id: p.summoner2Id ?? 0,
        keystoneId: extractKeystoneId(p),
        secondaryStyleId: extractSecondaryStyleId(p),
        win: Boolean(p.win),
        earlySurrender: Boolean(p.gameEndedInEarlySurrender),
        queueId,
        gameStartTimestamp,
      };
    }
  );

  return {
    matchId,
    platform: platform.toUpperCase(),
    queueId,
    gameStartTimestamp,
    gameDuration,
    gameVersion: dto.info.gameVersion ?? '',
    participants,
    teams,
  };
}

export class InMemorySummonerRepository implements SummonerRepository {
  private summoners = new Map<string, SummonerRecord>(); // key: `${platform}:${puuid}`
  private leagues = new Map<string, LeagueEntryData[]>(); // key: `${platform}:${puuid}`
  private matches = new Map<string, MatchDetailData>(); // key: matchId

  private summonerKey(platform: string, puuid: string): string {
    return `${platform.toUpperCase()}:${puuid}`;
  }

  async findSummonerByRiotId(
    platform: string,
    gameName: string,
    tagLine: string
  ): Promise<SummonerRecord | null> {
    const norm = normalizeRiotId(gameName, tagLine);
    const platUpper = platform.toUpperCase();
    for (const record of this.summoners.values()) {
      if (
        record.platform === platUpper &&
        record.gameNameNorm === norm.gameNameNorm &&
        record.tagLineNorm === norm.tagLineNorm
      ) {
        return { ...record, lastUpdatedAt: new Date(record.lastUpdatedAt) };
      }
    }
    return null;
  }

  async findSummonerByPuuid(
    platform: string,
    puuid: string
  ): Promise<SummonerRecord | null> {
    const found = this.summoners.get(this.summonerKey(platform, puuid));
    if (!found) return null;
    return { ...found, lastUpdatedAt: new Date(found.lastUpdatedAt) };
  }

  async upsertSummoner(input: UpsertSummonerInput): Promise<SummonerRecord> {
    const platUpper = input.platform.toUpperCase();
    const norm = normalizeRiotId(input.gameName, input.tagLine);
    const record: SummonerRecord = {
      puuid: input.puuid,
      platform: platUpper,
      gameName: input.gameName.trim(),
      tagLine: input.tagLine.trim(),
      gameNameNorm: norm.gameNameNorm,
      tagLineNorm: norm.tagLineNorm,
      profileIconId: input.profileIconId,
      summonerLevel: input.summonerLevel,
      lastUpdatedAt: input.lastUpdatedAt
        ? new Date(input.lastUpdatedAt)
        : new Date(),
    };
    this.summoners.set(this.summonerKey(platUpper, input.puuid), record);
    return { ...record, lastUpdatedAt: new Date(record.lastUpdatedAt) };
  }

  async replaceLeagueEntries(
    platform: string,
    puuid: string,
    entries: LeagueEntryDto[]
  ): Promise<LeagueEntryData[]> {
    const platUpper = platform.toUpperCase();
    const mapped: LeagueEntryData[] = entries.map((e) => ({
      puuid,
      platform: platUpper,
      queueType: e.queueType,
      tier: e.tier,
      rank: e.rank,
      leaguePoints: e.leaguePoints,
      wins: e.wins,
      losses: e.losses,
      winrate: winrate(e.wins, e.losses),
    }));
    this.leagues.set(this.summonerKey(platUpper, puuid), mapped);
    return mapped;
  }

  async getLeagueEntries(
    platform: string,
    puuid: string
  ): Promise<LeagueEntryData[]> {
    return [
      ...(this.leagues.get(this.summonerKey(platform, puuid)) ?? []),
    ];
  }

  async hasMatch(matchId: string): Promise<boolean> {
    return this.matches.has(matchId);
  }

  async getExistingMatchIds(matchIds: string[]): Promise<Set<string>> {
    const existing = new Set<string>();
    for (const id of matchIds) {
      if (this.matches.has(id)) {
        existing.add(id);
      }
    }
    return existing;
  }

  async upsertMatch(
    platform: string,
    dto: MatchDto
  ): Promise<MatchDetailData> {
    const matchId = dto.metadata.matchId;
    const existing = this.matches.get(matchId);
    if (existing) {
      return existing;
    }
    const detail = mapDtoToDetail(platform, dto);
    this.matches.set(matchId, detail);
    return detail;
  }

  async getMatchCount(): Promise<number> {
    return this.matches.size;
  }

  async getMatchesForPlayer(
    puuid: string,
    options: GetMatchesOptions = {}
  ): Promise<{ matches: MatchSummaryData[]; nextCursor: number | null }> {
    const tab: QueueTab = options.tab ?? 'all';
    const limit = options.limit ?? 20;
    const cursor = options.cursor;

    const matching: MatchSummaryData[] = [];
    for (const match of this.matches.values()) {
      if (!matchesQueueTab(match.queueId, tab)) continue;
      if (cursor !== undefined && match.gameStartTimestamp >= cursor) continue;

      const owner = match.participants.find((p) => p.puuid === puuid);
      if (!owner) continue;

      matching.push({
        matchId: match.matchId,
        platform: match.platform,
        queueId: match.queueId,
        gameStartTimestamp: match.gameStartTimestamp,
        gameDuration: match.gameDuration,
        gameVersion: match.gameVersion,
        owner,
        teams: match.teams,
        participants: match.participants,
      });
    }

    matching.sort((a, b) => b.gameStartTimestamp - a.gameStartTimestamp);

    const sliced = matching.slice(0, limit);
    const nextCursor =
      sliced.length > 0
        ? sliced[sliced.length - 1].gameStartTimestamp
        : null;

    return { matches: sliced, nextCursor };
  }

  async getParticipantRecordsForSeason(
    puuid: string,
    seasonStartMs?: number
  ): Promise<ParticipantMatchRecord[]> {
    const records: ParticipantMatchRecord[] = [];
    for (const match of this.matches.values()) {
      if (
        seasonStartMs !== undefined &&
        match.gameStartTimestamp < seasonStartMs
      ) {
        continue;
      }
      const owner = match.participants.find((p) => p.puuid === puuid);
      if (!owner) continue;

      records.push({
        championId: owner.championId,
        championName: owner.championName,
        kills: owner.kills,
        deaths: owner.deaths,
        assists: owner.assists,
        cs: owner.cs,
        gameDuration: match.gameDuration,
        win: owner.win,
        earlySurrender: owner.earlySurrender,
        queueId: match.queueId,
        gameStartTimestamp: match.gameStartTimestamp,
      });
    }
    return records;
  }

  async getProfileData(
    platform: string,
    puuid: string,
    options: { tab?: QueueTab; limit?: number; seasonStartMs?: number } = {}
  ): Promise<SummonerProfileData | null> {
    const summoner = await this.findSummonerByPuuid(platform, puuid);
    if (!summoner) return null;

    const leagueList = await this.getLeagueEntries(platform, puuid);
    const solo =
      leagueList.find((l) => l.queueType === 'RANKED_SOLO_5x5') ?? null;
    const flex =
      leagueList.find((l) => l.queueType === 'RANKED_FLEX_SR') ?? null;

    const limit = options.limit ?? 20;
    const { matches: rawMatches } = await this.getMatchesForPlayer(puuid, {
      tab: options.tab ?? 'all',
      limit: limit + 1,
    });
    const hasMoreMatches = rawMatches.length > limit;
    const matches = rawMatches.slice(0, limit);
    const nextCursor =
      matches.length > 0
        ? matches[matches.length - 1].gameStartTimestamp
        : null;

    const seasonRecords = await this.getParticipantRecordsForSeason(
      puuid,
      options.seasonStartMs
    );
    const soloStats = aggregateChampionStats(seasonRecords, {
      queue: 'solo',
      seasonStartMs: options.seasonStartMs,
    });
    const flexStats = aggregateChampionStats(seasonRecords, {
      queue: 'flex',
      seasonStartMs: options.seasonStartMs,
    });

    return {
      summoner: {
        puuid: summoner.puuid,
        platform: summoner.platform,
        gameName: summoner.gameName,
        tagLine: summoner.tagLine,
        slug: toSummonerSlug(summoner.gameName, summoner.tagLine),
        profileIconId: summoner.profileIconId,
        summonerLevel: summoner.summonerLevel,
        lastUpdatedAt: summoner.lastUpdatedAt.toISOString(),
      },
      leagues: {
        solo,
        flex,
      },
      matches,
      nextCursor,
      hasMoreMatches,
      championStats: {
        solo: soloStats,
        flex: flexStats,
      },
    };
  }
}

export class PrismaSummonerRepository implements SummonerRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findSummonerByRiotId(
    platform: string,
    gameName: string,
    tagLine: string
  ): Promise<SummonerRecord | null> {
    const norm = normalizeRiotId(gameName, tagLine);
    return this.prisma.summoner.findFirst({
      where: {
        platform: platform.toUpperCase(),
        gameNameNorm: norm.gameNameNorm,
        tagLineNorm: norm.tagLineNorm,
      },
    });
  }

  async findSummonerByPuuid(
    platform: string,
    puuid: string
  ): Promise<SummonerRecord | null> {
    return this.prisma.summoner.findUnique({
      where: {
        puuid_platform: {
          puuid,
          platform: platform.toUpperCase(),
        },
      },
    });
  }

  async upsertSummoner(input: UpsertSummonerInput): Promise<SummonerRecord> {
    const platUpper = input.platform.toUpperCase();
    const norm = normalizeRiotId(input.gameName, input.tagLine);
    const lastUpdatedAt = input.lastUpdatedAt ?? new Date();

    return this.prisma.summoner.upsert({
      where: {
        puuid_platform: {
          puuid: input.puuid,
          platform: platUpper,
        },
      },
      update: {
        gameName: input.gameName.trim(),
        tagLine: input.tagLine.trim(),
        gameNameNorm: norm.gameNameNorm,
        tagLineNorm: norm.tagLineNorm,
        profileIconId: input.profileIconId,
        summonerLevel: input.summonerLevel,
        lastUpdatedAt,
      },
      create: {
        puuid: input.puuid,
        platform: platUpper,
        gameName: input.gameName.trim(),
        tagLine: input.tagLine.trim(),
        gameNameNorm: norm.gameNameNorm,
        tagLineNorm: norm.tagLineNorm,
        profileIconId: input.profileIconId,
        summonerLevel: input.summonerLevel,
        lastUpdatedAt,
      },
    });
  }

  async replaceLeagueEntries(
    platform: string,
    puuid: string,
    entries: LeagueEntryDto[]
  ): Promise<LeagueEntryData[]> {
    const platUpper = platform.toUpperCase();
    await this.prisma.$transaction([
      this.prisma.leagueEntry.deleteMany({
        where: { puuid, platform: platUpper },
      }),
      ...entries.map((e) =>
        this.prisma.leagueEntry.create({
          data: {
            puuid,
            platform: platUpper,
            queueType: e.queueType,
            tier: e.tier,
            rank: e.rank,
            leaguePoints: e.leaguePoints,
            wins: e.wins,
            losses: e.losses,
          },
        })
      ),
    ]);
    return entries.map((e) => ({
      puuid,
      platform: platUpper,
      queueType: e.queueType,
      tier: e.tier,
      rank: e.rank,
      leaguePoints: e.leaguePoints,
      wins: e.wins,
      losses: e.losses,
      winrate: winrate(e.wins, e.losses),
    }));
  }

  async getLeagueEntries(
    platform: string,
    puuid: string
  ): Promise<LeagueEntryData[]> {
    const rows: Array<{
      puuid: string;
      platform: string;
      queueType: string;
      tier: string;
      rank: string;
      leaguePoints: number;
      wins: number;
      losses: number;
    }> = await this.prisma.leagueEntry.findMany({
      where: { puuid, platform: platform.toUpperCase() },
    });
    return rows.map((r) => ({
      ...r,
      winrate: winrate(r.wins, r.losses),
    }));
  }

  async hasMatch(matchId: string): Promise<boolean> {
    const count = await this.prisma.match.count({ where: { matchId } });
    return count > 0;
  }

  async getExistingMatchIds(matchIds: string[]): Promise<Set<string>> {
    if (matchIds.length === 0) return new Set();
    const rows: Array<{ matchId: string }> = await this.prisma.match.findMany({
      where: { matchId: { in: matchIds } },
      select: { matchId: true },
    });
    return new Set(rows.map((r) => r.matchId));
  }

  async upsertMatch(
    platform: string,
    dto: MatchDto
  ): Promise<MatchDetailData> {
    const detail = mapDtoToDetail(platform, dto);
    const exists = await this.hasMatch(detail.matchId);
    if (exists) {
      return detail;
    }

    await this.prisma.match.create({
      data: {
        matchId: detail.matchId,
        platform: detail.platform,
        queueId: detail.queueId,
        gameStartTimestamp: BigInt(detail.gameStartTimestamp),
        gameDuration: detail.gameDuration,
        gameVersion: detail.gameVersion,
        raw: JSON.parse(JSON.stringify(dto)),
        participants: {
          create: detail.participants.map((p) => ({
            puuid: p.puuid,
            participantId: p.participantId,
            teamId: p.teamId,
            riotIdGameName: p.riotIdGameName,
            riotIdTagline: p.riotIdTagline,
            championId: p.championId,
            championName: p.championName,
            champLevel: p.champLevel,
            kills: p.kills,
            deaths: p.deaths,
            assists: p.assists,
            cs: p.cs,
            goldEarned: p.goldEarned,
            visionScore: p.visionScore,
            damageToChampions: p.damageToChampions,
            items: p.items,
            summoner1Id: p.summoner1Id,
            summoner2Id: p.summoner2Id,
            keystoneId: p.keystoneId,
            secondaryStyleId: p.secondaryStyleId,
            win: p.win,
            earlySurrender: p.earlySurrender,
            queueId: p.queueId,
            gameStartTimestamp: BigInt(p.gameStartTimestamp),
          })),
        },
        teams: {
          create: detail.teams.map((t) => ({
            teamId: t.teamId,
            win: t.win,
            kills: t.kills,
            towers: t.towers,
            dragons: t.dragons,
            barons: t.barons,
          })),
        },
      },
    });

    return detail;
  }

  async getMatchCount(): Promise<number> {
    return this.prisma.match.count();
  }

  async getMatchesForPlayer(
    puuid: string,
    options: GetMatchesOptions = {}
  ): Promise<{ matches: MatchSummaryData[]; nextCursor: number | null }> {
    const tab: QueueTab = options.tab ?? 'all';
    const limit = options.limit ?? 20;
    const cursor = options.cursor;

    const allowedQueues = QUEUE_TABS[tab];
    const queueFilter = allowedQueues ? { in: allowedQueues } : undefined;

    const rows: Array<{
      match: {
        matchId: string;
        platform: string;
        queueId: number;
        gameStartTimestamp: bigint;
        gameDuration: number;
        gameVersion: string;
        teams: Array<{
          matchId: string;
          teamId: number;
          win: boolean;
          kills: number;
          towers: number;
          dragons: number;
          barons: number;
        }>;
        participants: Array<{
          matchId: string;
          puuid: string;
          participantId: number;
          teamId: number;
          riotIdGameName: string;
          riotIdTagline: string;
          championId: number;
          championName: string;
          champLevel: number;
          kills: number;
          deaths: number;
          assists: number;
          cs: number;
          goldEarned: number;
          visionScore: number;
          damageToChampions: number;
          items: number[];
          summoner1Id: number;
          summoner2Id: number;
          keystoneId: number;
          secondaryStyleId: number;
          win: boolean;
          earlySurrender: boolean;
          queueId: number;
          gameStartTimestamp: bigint;
        }>;
      };
    }> = await this.prisma.matchParticipant.findMany({
      where: {
        puuid,
        ...(queueFilter ? { queueId: queueFilter } : {}),
        ...(cursor !== undefined
          ? { gameStartTimestamp: { lt: BigInt(cursor) } }
          : {}),
      },
      orderBy: { gameStartTimestamp: 'desc' },
      take: limit,
      include: {
        match: {
          include: {
            participants: true,
            teams: true,
          },
        },
      },
    });

    const matches: MatchSummaryData[] = rows.map((row) => {
      const m = row.match;
      const teams: MatchTeamData[] = m.teams.map((t) => ({
        matchId: t.matchId,
        teamId: t.teamId,
        win: t.win,
        kills: t.kills,
        towers: t.towers,
        dragons: t.dragons,
        barons: t.barons,
      }));
      const teamKillsByTeam = new Map<number, number>();
      for (const t of teams) teamKillsByTeam.set(t.teamId, t.kills);

      const participants: MatchParticipantData[] = m.participants.map((p) => ({
        matchId: p.matchId,
        puuid: p.puuid,
        participantId: p.participantId,
        teamId: p.teamId,
        riotIdGameName: p.riotIdGameName,
        riotIdTagline: p.riotIdTagline,
        championId: p.championId,
        championName: p.championName,
        champLevel: p.champLevel,
        kills: p.kills,
        deaths: p.deaths,
        assists: p.assists,
        kda: kdaRatio(p.kills, p.deaths, p.assists),
        cs: p.cs,
        csPerMin: csPerMin(p.cs, m.gameDuration),
        killParticipation: killParticipation(
          p.kills,
          p.assists,
          teamKillsByTeam.get(p.teamId) ?? 0
        ),
        goldEarned: p.goldEarned,
        visionScore: p.visionScore,
        damageToChampions: p.damageToChampions,
        items: p.items,
        summoner1Id: p.summoner1Id,
        summoner2Id: p.summoner2Id,
        keystoneId: p.keystoneId,
        secondaryStyleId: p.secondaryStyleId,
        win: p.win,
        earlySurrender: p.earlySurrender,
        queueId: p.queueId,
        gameStartTimestamp: Number(p.gameStartTimestamp),
      }));

      const owner =
        participants.find((p) => p.puuid === puuid) ?? participants[0];

      return {
        matchId: m.matchId,
        platform: m.platform,
        queueId: m.queueId,
        gameStartTimestamp: Number(m.gameStartTimestamp),
        gameDuration: m.gameDuration,
        gameVersion: m.gameVersion,
        owner,
        teams,
        participants,
      };
    });

    const nextCursor =
      matches.length > 0
        ? matches[matches.length - 1].gameStartTimestamp
        : null;

    return { matches, nextCursor };
  }

  async getParticipantRecordsForSeason(
    puuid: string,
    seasonStartMs?: number
  ): Promise<ParticipantMatchRecord[]> {
    const rows: Array<{
      championId: number;
      championName: string;
      kills: number;
      deaths: number;
      assists: number;
      cs: number;
      win: boolean;
      earlySurrender: boolean;
      queueId: number;
      gameStartTimestamp: bigint;
      match: { gameDuration: number };
    }> = await this.prisma.matchParticipant.findMany({
      where: {
        puuid,
        ...(seasonStartMs !== undefined
          ? { gameStartTimestamp: { gte: BigInt(seasonStartMs) } }
          : {}),
      },
      include: {
        match: {
          select: { gameDuration: true },
        },
      },
    });

    return rows.map((r) => ({
      championId: r.championId,
      championName: r.championName,
      kills: r.kills,
      deaths: r.deaths,
      assists: r.assists,
      cs: r.cs,
      gameDuration: r.match.gameDuration,
      win: r.win,
      earlySurrender: r.earlySurrender,
      queueId: r.queueId,
      gameStartTimestamp: Number(r.gameStartTimestamp),
    }));
  }

  async getProfileData(
    platform: string,
    puuid: string,
    options: { tab?: QueueTab; limit?: number; seasonStartMs?: number } = {}
  ): Promise<SummonerProfileData | null> {
    const summoner = await this.findSummonerByPuuid(platform, puuid);
    if (!summoner) return null;

    const leagueList = await this.getLeagueEntries(platform, puuid);
    const solo =
      leagueList.find((l) => l.queueType === 'RANKED_SOLO_5x5') ?? null;
    const flex =
      leagueList.find((l) => l.queueType === 'RANKED_FLEX_SR') ?? null;

    const limit = options.limit ?? 20;
    const { matches: rawMatches } = await this.getMatchesForPlayer(puuid, {
      tab: options.tab ?? 'all',
      limit: limit + 1,
    });
    const hasMoreMatches = rawMatches.length > limit;
    const matches = rawMatches.slice(0, limit);
    const nextCursor =
      matches.length > 0
        ? matches[matches.length - 1].gameStartTimestamp
        : null;

    const seasonRecords = await this.getParticipantRecordsForSeason(
      puuid,
      options.seasonStartMs
    );
    const soloStats = aggregateChampionStats(seasonRecords, {
      queue: 'solo',
      seasonStartMs: options.seasonStartMs,
    });
    const flexStats = aggregateChampionStats(seasonRecords, {
      queue: 'flex',
      seasonStartMs: options.seasonStartMs,
    });

    return {
      summoner: {
        puuid: summoner.puuid,
        platform: summoner.platform,
        gameName: summoner.gameName,
        tagLine: summoner.tagLine,
        slug: toSummonerSlug(summoner.gameName, summoner.tagLine),
        profileIconId: summoner.profileIconId,
        summonerLevel: summoner.summonerLevel,
        lastUpdatedAt: summoner.lastUpdatedAt.toISOString(),
      },
      leagues: {
        solo,
        flex,
      },
      matches,
      nextCursor,
      hasMoreMatches,
      championStats: {
        solo: soloStats,
        flex: flexStats,
      },
    };
  }
}

let defaultRepoInstance: SummonerRepository | null = null;
let defaultPrismaInstance: PrismaClient | null = null;

function getPrismaClient(): PrismaClient {
  if (!defaultPrismaInstance) {
    defaultPrismaInstance = new PrismaClient();
  }
  return defaultPrismaInstance;
}

function buildDemoMatchDto(
  matchId: string,
  options: {
    platform: string;
    queueId: number;
    gameStartTimestamp: number;
    gameDuration: number;
    ownerPuuid: string;
    ownerName: string;
    ownerTag: string;
    ownerChampion: string;
    ownerWin: boolean;
    kills: number;
    deaths: number;
    assists: number;
    earlySurrender?: boolean;
  }
): MatchDto {
  const roster = [
    'Ahri',
    'LeeSin',
    'Jinx',
    'Thresh',
    'Renekton',
    'Orianna',
    'Viego',
    'KaiSa',
    'Nautilus',
    'Aatrox',
  ];
  const participants: MatchParticipantDto[] = Array.from(
    { length: 10 },
    (_, idx) => {
      const isBlue = idx < 5;
      const isOwner = idx === 0;
      return {
        participantId: idx + 1,
        puuid: isOwner ? options.ownerPuuid : `puuid-${matchId}-${idx + 1}`,
        teamId: isBlue ? 100 : 200,
        riotIdGameName: isOwner
          ? options.ownerName
          : idx === 1
          ? 'brTT'
          : `Jogador${idx + 1}`,
        riotIdTagline: isOwner
          ? options.ownerTag
          : idx === 1
          ? 'REX'
          : options.platform,
        championId: 100 + idx,
        championName: isOwner ? options.ownerChampion : roster[idx],
        champLevel: isOwner ? 18 : 15,
        kills: isOwner ? options.kills : 4,
        deaths: isOwner ? options.deaths : 5,
        assists: isOwner ? options.assists : 7,
        totalMinionsKilled: isOwner ? 210 : 165,
        neutralMinionsKilled: isOwner ? 24 : 15,
        goldEarned: isOwner ? 15800 : 11900,
        visionScore: isOwner ? 38 : 24,
        totalDamageDealtToChampions: isOwner
          ? 36000
          : idx === 1
          ? 24000
          : 15000,
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
            { style: 8100, selections: [{ perk: 8112 }] },
            { style: 8200, selections: [{ perk: 8210 }] },
          ],
        },
        win: isBlue ? options.ownerWin : !options.ownerWin,
        gameEndedInEarlySurrender: Boolean(options.earlySurrender),
      };
    }
  );

  return {
    metadata: {
      matchId,
      participants: participants.map((p) => p.puuid),
    },
    info: {
      gameStartTimestamp: options.gameStartTimestamp,
      gameDuration: options.gameDuration,
      gameVersion: '14.22.1',
      queueId: options.queueId,
      platformId: options.platform,
      participants,
      teams: [
        {
          teamId: 100,
          win: options.ownerWin,
          objectives: {
            champion: { kills: 28 },
            tower: { kills: 9 },
            dragon: { kills: 3 },
            baron: { kills: 1 },
          },
        },
        {
          teamId: 200,
          win: !options.ownerWin,
          objectives: {
            champion: { kills: 19 },
            tower: { kills: 3 },
            dragon: { kills: 1 },
            baron: { kills: 0 },
          },
        },
      ],
    },
  };
}

export function seedDemoRepository(repo: InMemorySummonerRepository): void {
  const now = Date.now();
  const kamiPuuid = 'demo-puuid-kami-br1';
  const fakerPuuid = 'demo-puuid-faker-kr';

  void repo.upsertSummoner({
    puuid: kamiPuuid,
    platform: 'BR1',
    gameName: 'Kami',
    tagLine: 'BR1',
    profileIconId: 29,
    summonerLevel: 412,
    lastUpdatedAt: new Date(now - 5 * 60_000),
  });
  void repo.replaceLeagueEntries('BR1', kamiPuuid, [
    {
      queueType: 'RANKED_SOLO_5x5',
      tier: 'CHALLENGER',
      rank: 'I',
      leaguePoints: 1125,
      wins: 142,
      losses: 95,
    },
    {
      queueType: 'RANKED_FLEX_SR',
      tier: 'MASTER',
      rank: 'I',
      leaguePoints: 340,
      wins: 38,
      losses: 22,
    },
  ]);

  const championsPool = [
    'Ahri',
    'Orianna',
    'Syndra',
    'LeBlanc',
    'Azir',
    'TwistedFate',
    'Viktor',
    'Taliyah',
    'Lux',
  ];

  // 25 matches for Kami#BR1 across Solo (420), Flex (440), Normal (400) and ARAM (450)
  for (let i = 0; i < 25; i++) {
    const champ = championsPool[i % championsPool.length];
    const queueId =
      i < 16 ? 420 : i < 20 ? 440 : i < 23 ? 400 : 450;
    const isZeroDeath = i === 0;
    const isRemakeMatch = i === 2;
    void repo.upsertMatch(
      'BR1',
      buildDemoMatchDto(`BR1_DEMO_${1000 + i}`, {
        platform: 'BR1',
        queueId,
        gameStartTimestamp: now - (i + 1) * 3600_000,
        gameDuration: isRemakeMatch ? 195 : 1820,
        ownerPuuid: kamiPuuid,
        ownerName: 'Kami',
        ownerTag: 'BR1',
        ownerChampion: champ,
        ownerWin: i % 3 !== 1,
        kills: isZeroDeath ? 12 : 8 + (i % 5),
        deaths: isZeroDeath ? 0 : 2 + (i % 4),
        assists: 9 + (i % 6),
        earlySurrender: isRemakeMatch,
      })
    );
  }

  // Second demo summoner: Faker#T1 on KR (Solo ranked, Flex unranked)
  void repo.upsertSummoner({
    puuid: fakerPuuid,
    platform: 'KR',
    gameName: 'Faker',
    tagLine: 'T1',
    profileIconId: 6,
    summonerLevel: 785,
    lastUpdatedAt: new Date(now - 10 * 60_000),
  });
  void repo.replaceLeagueEntries('KR', fakerPuuid, [
    {
      queueType: 'RANKED_SOLO_5x5',
      tier: 'CHALLENGER',
      rank: 'I',
      leaguePoints: 1490,
      wins: 190,
      losses: 120,
    },
  ]);
  for (let i = 0; i < 5; i++) {
    void repo.upsertMatch(
      'KR',
      buildDemoMatchDto(`KR_DEMO_${2000 + i}`, {
        platform: 'KR',
        queueId: 420,
        gameStartTimestamp: now - (i + 1) * 3600_000,
        gameDuration: 1750,
        ownerPuuid: fakerPuuid,
        ownerName: 'Faker',
        ownerTag: 'T1',
        ownerChampion: championsPool[i],
        ownerWin: true,
        kills: 10,
        deaths: 1,
        assists: 11,
      })
    );
  }
}

export function getRepository(): SummonerRepository {
  if (!defaultRepoInstance) {
    const isTestEnv =
      process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
    if (process.env.DATABASE_URL && !isTestEnv) {
      defaultRepoInstance = new PrismaSummonerRepository(getPrismaClient());
    } else {
      const repo = new InMemorySummonerRepository();
      if (process.env.SEED_DEMO_DATA !== 'false') {
        seedDemoRepository(repo);
      }
      defaultRepoInstance = repo;
    }
  }
  return defaultRepoInstance;
}

export function setRepository(repo: SummonerRepository): void {
  defaultRepoInstance = repo;
}
