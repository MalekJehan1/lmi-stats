import { t } from '@/i18n';
import {
  getRepository,
  MatchSummaryData,
  SummonerProfileData,
  SummonerRepository,
} from '@/server/db/repository';
import {
  GetMatchIdsParams,
  RiotClient,
  RiotNotFoundError,
} from '@/server/riot/client';
import { riotIdsEqual, toSummonerSlug } from '@/server/riot/riot-id';
import { normalizePlatform, regionalOf } from '@/server/riot/routing';
import { matchesQueueTab, QueueTab } from '@/server/stats/calculators';

export class PlayerNotFoundError extends Error {
  readonly status = 404;
  readonly code = 'not_found' as const;
  readonly gameName: string;
  readonly tagLine: string;
  readonly platform: string;

  constructor(platform: string, gameName: string, tagLine: string) {
    super(
      `${t('error.playerNotFound')}: ${gameName}#${tagLine} (${platform.toUpperCase()})`
    );
    this.name = 'PlayerNotFoundError';
    this.platform = platform.toUpperCase();
    this.gameName = gameName;
    this.tagLine = tagLine;
  }
}

export class PlayerNotInRegionError extends Error {
  readonly status = 404;
  readonly code = 'not_in_region' as const;
  readonly platform: string;
  readonly puuid: string;

  constructor(platform: string, puuid: string) {
    super(t('error.playerNotInRegion'));
    this.name = 'PlayerNotInRegionError';
    this.platform = platform.toUpperCase();
    this.puuid = puuid;
  }
}

export class RefreshFailedError extends Error {
  readonly status = 503;
  readonly code = 'unavailable' as const;

  constructor(cause?: unknown) {
    super(t('refresh.error'));
    this.name = 'RefreshFailedError';
    if (cause !== undefined) {
      (this as { cause?: unknown }).cause = cause;
    }
  }
}

export interface LookupResult {
  puuid: string;
  profile: SummonerProfileData;
  fromCache: boolean;
}

export interface RefreshResult {
  puuid: string;
  profile: SummonerProfileData;
  renamed: boolean;
  previousSlug: string | null;
  newSlug: string;
  newMatchesFetched: number;
}

export interface LoadMoreOptions {
  tab?: QueueTab;
  cursor?: number;
  start?: number;
  count?: number;
}

export interface LoadMoreResult {
  matches: MatchSummaryData[];
  nextCursor: number | null;
  hasMore: boolean;
  fetchedCount: number;
}

export interface SyncServiceOptions {
  riotClient?: RiotClient;
  repository?: SummonerRepository;
  now?: () => Date;
  seasonStartMs?: number;
}

export class SyncService {
  private readonly riotClient: RiotClient;
  private readonly repository: SummonerRepository;
  private readonly now: () => Date;
  private readonly seasonStartMs?: number;

  constructor(options: SyncServiceOptions = {}) {
    this.riotClient = options.riotClient ?? new RiotClient();
    this.repository = options.repository ?? getRepository();
    this.now = options.now ?? (() => new Date());
    this.seasonStartMs = options.seasonStartMs;
  }

  getRepository(): SummonerRepository {
    return this.repository;
  }

  async lookup(
    rawPlatform: string,
    gameName: string,
    tagLine: string
  ): Promise<LookupResult> {
    const platform = normalizePlatform(rawPlatform);
    if (!platform) {
      throw new PlayerNotFoundError(rawPlatform, gameName, tagLine);
    }

    // Check if already saved in DB (SRCH-05)
    const existing = await this.repository.findSummonerByRiotId(
      platform,
      gameName,
      tagLine
    );
    if (existing) {
      const profile = await this.repository.getProfileData(
        platform,
        existing.puuid,
        { seasonStartMs: this.seasonStartMs }
      );
      if (profile) {
        return { puuid: existing.puuid, profile, fromCache: true };
      }
    }

    const regional = regionalOf(platform);

    // 1. Account by Riot ID (SRCH-04, SRCH-07)
    let account;
    try {
      account = await this.riotClient.getAccountByRiotId(
        regional,
        gameName,
        tagLine
      );
    } catch (err) {
      if (err instanceof RiotNotFoundError) {
        throw new PlayerNotFoundError(platform, gameName, tagLine);
      }
      throw err;
    }

    // 2. Summoner by PUUID in selected platform (SRCH-04, SRCH-08)
    let summonerDto;
    try {
      summonerDto = await this.riotClient.getSummonerByPuuid(
        platform,
        account.puuid
      );
    } catch (err) {
      if (err instanceof RiotNotFoundError) {
        throw new PlayerNotInRegionError(platform, account.puuid);
      }
      throw err;
    }

    // 3. League entries by PUUID (SRCH-04)
    const leaguesDto = await this.riotClient.getLeagueEntriesByPuuid(
      platform,
      account.puuid
    );

    // 4. Recent 20 match IDs (SRCH-04)
    const matchIds = await this.riotClient.getMatchIds(
      regional,
      account.puuid,
      { count: 20 }
    );

    // 5. Fetch and save only unsaved matches, skipping 404 matches
    await this.fetchAndSaveMissingMatches(platform, regional, matchIds);

    // 6. Save summoner and leagues
    await this.repository.upsertSummoner({
      puuid: account.puuid,
      platform,
      gameName: account.gameName,
      tagLine: account.tagLine,
      profileIconId: summonerDto.profileIconId,
      summonerLevel: summonerDto.summonerLevel,
      lastUpdatedAt: this.now(),
    });
    await this.repository.replaceLeagueEntries(
      platform,
      account.puuid,
      leaguesDto
    );

    const profile = await this.repository.getProfileData(
      platform,
      account.puuid,
      { seasonStartMs: this.seasonStartMs }
    );
    if (!profile) {
      throw new PlayerNotFoundError(platform, gameName, tagLine);
    }

    return {
      puuid: account.puuid,
      profile,
      fromCache: false,
    };
  }

  async refresh(rawPlatform: string, puuid: string): Promise<RefreshResult> {
    const platform = normalizePlatform(rawPlatform);
    if (!platform) {
      throw new RefreshFailedError(new Error(`Invalid platform ${rawPlatform}`));
    }

    const regional = regionalOf(platform);
    const existingSummoner = await this.repository.findSummonerByPuuid(
      platform,
      puuid
    );
    const previousSlug = existingSummoner
      ? toSummonerSlug(existingSummoner.gameName, existingSummoner.tagLine)
      : null;

    // Find the player's latest saved matchId so we only pull new matches since last saved (REFR-01)
    const existingPlayerMatches = await this.repository.getMatchesForPlayer(
      puuid,
      { tab: 'all', limit: 1 }
    );
    const latestSavedMatchId =
      existingPlayerMatches.matches[0]?.matchId ?? null;

    try {
      const [accountDto, summonerDto, leaguesDto, matchIds] = await Promise.all(
        [
          this.riotClient.getAccountByPuuid(regional, puuid),
          this.riotClient.getSummonerByPuuid(platform, puuid),
          this.riotClient.getLeagueEntriesByPuuid(platform, puuid),
          this.riotClient.getMatchIds(regional, puuid, { count: 100 }),
        ]
      );

      const newMatchIds: string[] = [];
      for (const id of matchIds.slice(0, 100)) {
        if (latestSavedMatchId && id === latestSavedMatchId) {
          break;
        }
        newMatchIds.push(id);
      }

      const newMatchesFetched = await this.fetchAndSaveMissingMatches(
        platform,
        regional,
        newMatchIds
      );

      const renamed = existingSummoner
        ? !riotIdsEqual(existingSummoner, accountDto) ||
          existingSummoner.gameName !== accountDto.gameName ||
          existingSummoner.tagLine !== accountDto.tagLine
        : false;

      const newSlug = toSummonerSlug(accountDto.gameName, accountDto.tagLine);

      await this.repository.upsertSummoner({
        puuid,
        platform,
        gameName: accountDto.gameName,
        tagLine: accountDto.tagLine,
        profileIconId: summonerDto.profileIconId,
        summonerLevel: summonerDto.summonerLevel,
        lastUpdatedAt: this.now(),
      });
      await this.repository.replaceLeagueEntries(platform, puuid, leaguesDto);

      const profile = await this.repository.getProfileData(platform, puuid, {
        seasonStartMs: this.seasonStartMs,
      });
      if (!profile) {
        throw new Error('Failed to load updated profile after refresh');
      }

      return {
        puuid,
        profile,
        renamed,
        previousSlug,
        newSlug,
        newMatchesFetched,
      };
    } catch (err) {
      // REFR-08: Preserve saved data in DB and throw friendly RefreshFailedError
      throw new RefreshFailedError(err);
    }
  }

  async loadMore(
    rawPlatform: string,
    puuid: string,
    options: LoadMoreOptions = {}
  ): Promise<LoadMoreResult> {
    const platform = normalizePlatform(rawPlatform) ?? 'BR1';
    const regional = regionalOf(platform);
    const tab: QueueTab = options.tab ?? 'all';
    const count = options.count ?? 20;
    const cursor = options.cursor;

    const baseParams: GetMatchIdsParams = { count };
    if (tab === 'solo') baseParams.queue = 420;
    else if (tab === 'flex') baseParams.queue = 440;
    else if (tab === 'aram') baseParams.queue = 450;
    else if (tab === 'normal') baseParams.type = 'normal';

    if (options.start !== undefined) {
      baseParams.start = options.start;
    } else if (cursor !== undefined) {
      if (cursor > 10_000_000) {
        baseParams.endTime = Math.floor(cursor / 1000) - 1;
      } else {
        baseParams.start = cursor;
      }
    }

    let fetchedCount = 0;
    let rawReturnedCount = 0;

    if (tab === 'normal') {
      // For 'normal', Riot API type='normal' may include non-SR normal queues; paginate up to 3 pages if needed
      let currentStart = baseParams.start ?? 0;
      let collectedNormalCount = 0;
      for (let page = 0; page < 3; page++) {
        const pageIds = await this.riotClient.getMatchIds(regional, puuid, {
          ...baseParams,
          start: baseParams.endTime !== undefined ? page * count : currentStart,
          count,
        });
        rawReturnedCount = pageIds.length;
        if (pageIds.length === 0) break;

        fetchedCount += await this.fetchAndSaveMissingMatches(
          platform,
          regional,
          pageIds
        );

        const currentDbMatches = await this.repository.getMatchesForPlayer(
          puuid,
          {
            tab: 'normal',
            cursor: cursor && cursor > 10_000_000 ? cursor : undefined,
            limit: count,
          }
        );
        collectedNormalCount = currentDbMatches.matches.length;
        if (pageIds.length < count || collectedNormalCount >= count) {
          break;
        }
        currentStart += count;
      }
    } else {
      const pageIds = await this.riotClient.getMatchIds(
        regional,
        puuid,
        baseParams
      );
      rawReturnedCount = pageIds.length;
      if (pageIds.length > 0) {
        fetchedCount = await this.fetchAndSaveMissingMatches(
          platform,
          regional,
          pageIds
        );
      }
    }

    const dbQueryCursor =
      cursor !== undefined && cursor > 10_000_000 ? cursor : undefined;
    const { matches: allTabMatches } =
      await this.repository.getMatchesForPlayer(puuid, {
        tab,
        cursor: dbQueryCursor,
        limit:
          cursor !== undefined && cursor <= 10_000_000
            ? cursor + count
            : count,
      });

    const matches =
      cursor !== undefined && cursor <= 10_000_000
        ? allTabMatches.slice(cursor, cursor + count)
        : allTabMatches.filter((m) => matchesQueueTab(m.queueId, tab)).slice(0, count);

    // HIST-05: If Riot API returned fewer matches than requested, hide "Mostrar mais" (hasMore = false)
    const hasMore = rawReturnedCount >= count && matches.length >= count;
    const nextCursor =
      hasMore && matches.length > 0
        ? matches[matches.length - 1].gameStartTimestamp
        : null;

    return {
      matches,
      nextCursor,
      hasMore,
      fetchedCount,
    };
  }

  private async fetchAndSaveMissingMatches(
    platform: string,
    regional: string,
    matchIds: string[]
  ): Promise<number> {
    if (matchIds.length === 0) return 0;
    const existing = await this.repository.getExistingMatchIds(matchIds);
    let fetched = 0;

    for (const matchId of matchIds) {
      if (existing.has(matchId)) {
        continue;
      }
      try {
        const dto = await this.riotClient.getMatch(regional, matchId);
        await this.repository.upsertMatch(platform, dto);
        existing.add(matchId);
        fetched += 1;
      } catch (err) {
        if (err instanceof RiotNotFoundError) {
          // Edge case: if a match in the ID list returns 404 from Riot API, skip it and continue
          continue;
        }
        throw err;
      }
    }

    return fetched;
  }
}
