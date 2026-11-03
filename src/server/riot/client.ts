import { RateLimiter } from './rate-limiter';

export interface AccountDto {
  puuid: string;
  gameName: string;
  tagLine: string;
}

export interface SummonerDto {
  id?: string;
  accountId?: string;
  puuid: string;
  profileIconId: number;
  revisionDate?: number;
  summonerLevel: number;
}

export interface LeagueEntryDto {
  queueType: string;
  tier: string;
  rank: string;
  leaguePoints: number;
  wins: number;
  losses: number;
}

export interface MatchParticipantDto {
  participantId: number;
  puuid: string;
  teamId: number;
  riotIdGameName?: string;
  riotIdTagline?: string;
  summonerName?: string;
  championId: number;
  championName: string;
  champLevel: number;
  kills: number;
  deaths: number;
  assists: number;
  totalMinionsKilled: number;
  neutralMinionsKilled: number;
  goldEarned: number;
  visionScore: number;
  totalDamageDealtToChampions: number;
  item0: number;
  item1: number;
  item2: number;
  item3: number;
  item4: number;
  item5: number;
  item6: number;
  summoner1Id: number;
  summoner2Id: number;
  perks?: {
    styles?: Array<{
      description?: string;
      style: number;
      selections?: Array<{
        perk: number;
        var1?: number;
        var2?: number;
        var3?: number;
      }>;
    }>;
  };
  win: boolean;
  gameEndedInEarlySurrender?: boolean;
}

export interface MatchTeamDto {
  teamId: number;
  win: boolean;
  objectives: {
    champion?: { kills: number };
    tower?: { kills: number };
    dragon?: { kills: number };
    baron?: { kills: number };
  };
}

export interface MatchDto {
  metadata: {
    matchId: string;
    participants: string[];
  };
  info: {
    gameStartTimestamp: number;
    gameDuration: number;
    gameVersion: string;
    queueId: number;
    platformId?: string;
    participants: MatchParticipantDto[];
    teams: MatchTeamDto[];
  };
}

export interface GetMatchIdsParams {
  start?: number;
  count?: number;
  queue?: number;
  type?: string;
  startTime?: number;
  endTime?: number;
}

export class RiotNotFoundError extends Error {
  readonly status = 404;
  constructor(message = 'Riot resource not found') {
    super(message);
    this.name = 'RiotNotFoundError';
  }
}

export class RiotAuthError extends Error {
  readonly status: number;
  constructor(status = 401, message = 'Riot API key inválida ou expirada') {
    super(message);
    this.name = 'RiotAuthError';
    this.status = status;
  }
}

export class RiotUnavailableError extends Error {
  readonly status?: number;
  constructor(message = 'Riot API unavailable', status?: number) {
    super(message);
    this.name = 'RiotUnavailableError';
    this.status = status;
  }
}

export interface RiotCallLogEntry {
  route: string;
  routing: string;
  status: number;
  latencyMs: number;
  error?: string;
}

export interface RiotLogger {
  info(entry: RiotCallLogEntry, message?: string): void;
  error(entry: RiotCallLogEntry, message?: string): void;
}

const defaultLogger: RiotLogger = {
  info(entry) {
    if (process.env.NODE_ENV !== 'test') {
      console.log(JSON.stringify({ level: 'info', ...entry }));
    }
  },
  error(entry, message) {
    if (process.env.NODE_ENV !== 'test') {
      console.error(
        JSON.stringify({ level: 'error', message, ...entry })
      );
    }
  },
};

export interface RiotClientOptions {
  apiKey?: string;
  baseUrl?: string;
  rateLimiter?: RateLimiter;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  logger?: RiotLogger;
}

export class RiotClient {
  private readonly explicitApiKey?: string;
  private readonly baseUrl?: string;
  private readonly rateLimiter: RateLimiter;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly logger: RiotLogger;

  constructor(options: RiotClientOptions = {}) {
    this.explicitApiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? process.env.RIOT_API_BASE_URL;
    this.rateLimiter = options.rateLimiter ?? new RateLimiter();
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.now = options.now ?? (() => Date.now());
    this.sleep =
      options.sleep ??
      ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.logger = options.logger ?? defaultLogger;
  }

  private resolveApiKey(): string {
    const key = this.explicitApiKey ?? process.env.RIOT_API_KEY ?? '';
    if (!key) {
      throw new RiotAuthError(401, 'Riot API key inválida ou expirada');
    }
    return key;
  }

  private buildUrl(routing: string, path: string): string {
    const host = this.baseUrl
      ? this.baseUrl.replace(/\/$/, '')
      : `https://${routing.toLowerCase()}.api.riotgames.com`;
    return `${host}${path}`;
  }

  private async request<T>(
    routing: string,
    routeTemplate: string,
    path: string
  ): Promise<T> {
    const normalizedRouting = routing.toLowerCase();
    const apiKey = this.resolveApiKey();
    const url = this.buildUrl(normalizedRouting, path);

    let retries429 = 0;
    let retries5xx = 0;

    while (true) {
      await this.rateLimiter.acquire(normalizedRouting);
      const startMs = this.now();

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          method: 'GET',
          headers: {
            'X-Riot-Token': apiKey,
            Accept: 'application/json',
          },
          signal: controller.signal,
        });
      } catch (err) {
        clearTimeout(timer);
        const latencyMs = this.now() - startMs;
        this.logger.error(
          {
            route: routeTemplate,
            routing: normalizedRouting,
            status: 0,
            latencyMs,
          },
          'Riot API request timeout or network error'
        );

        if (retries5xx < 2) {
          const backoffMs = 500 * Math.pow(2, retries5xx);
          retries5xx += 1;
          await this.sleep(backoffMs);
          continue;
        }
        throw new RiotUnavailableError(
          `Riot API timeout/network failure on ${routeTemplate}`
        );
      } finally {
        clearTimeout(timer);
      }

      const latencyMs = this.now() - startMs;
      const status = response.status;
      const logEntry: RiotCallLogEntry = {
        route: routeTemplate,
        routing: normalizedRouting,
        status,
        latencyMs,
      };

      if (status >= 200 && status < 300) {
        this.logger.info(logEntry);
        return (await response.json()) as T;
      }

      if (status === 404) {
        this.logger.info(logEntry);
        throw new RiotNotFoundError(`Not found: ${routeTemplate}`);
      }

      if (status === 401 || status === 403) {
        const msg = 'Riot API key inválida ou expirada';
        this.logger.error(logEntry, msg);
        throw new RiotAuthError(status, msg);
      }

      if (status === 429) {
        this.logger.info(logEntry);
        if (retries429 >= 3) {
          throw new RiotUnavailableError(
            'Riot API rate limit exceeded after 3 retries',
            429
          );
        }
        const retryAfterHeader = response.headers.get('Retry-After');
        const retryAfterSec = retryAfterHeader
          ? Math.max(1, Number.parseInt(retryAfterHeader, 10) || 1)
          : 1;
        const waitMs = retryAfterSec * 1000;
        retries429 += 1;
        await this.rateLimiter.pause(normalizedRouting, waitMs);
        await this.sleep(waitMs);
        continue;
      }

      if (status >= 500) {
        this.logger.error(logEntry, `Riot API ${status} error`);
        if (retries5xx < 2) {
          const backoffMs = 500 * Math.pow(2, retries5xx);
          retries5xx += 1;
          await this.sleep(backoffMs);
          continue;
        }
        throw new RiotUnavailableError(
          `Riot API returned ${status} after retries`,
          status
        );
      }

      this.logger.error(logEntry, `Unexpected Riot API status ${status}`);
      throw new RiotUnavailableError(
        `Unexpected Riot API status ${status}`,
        status
      );
    }
  }

  async getAccountByRiotId(
    regional: string,
    gameName: string,
    tagLine: string
  ): Promise<AccountDto> {
    const path = `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(
      gameName
    )}/${encodeURIComponent(tagLine)}`;
    return this.request<AccountDto>(
      regional,
      '/riot/account/v1/accounts/by-riot-id/{gameName}/{tagLine}',
      path
    );
  }

  async getAccountByPuuid(
    regional: string,
    puuid: string
  ): Promise<AccountDto> {
    const path = `/riot/account/v1/accounts/by-puuid/${encodeURIComponent(
      puuid
    )}`;
    return this.request<AccountDto>(
      regional,
      '/riot/account/v1/accounts/by-puuid/{puuid}',
      path
    );
  }

  async getSummonerByPuuid(
    platform: string,
    puuid: string
  ): Promise<SummonerDto> {
    const path = `/lol/summoner/v4/summoners/by-puuid/${encodeURIComponent(
      puuid
    )}`;
    return this.request<SummonerDto>(
      platform,
      '/lol/summoner/v4/summoners/by-puuid/{puuid}',
      path
    );
  }

  async getLeagueEntriesByPuuid(
    platform: string,
    puuid: string
  ): Promise<LeagueEntryDto[]> {
    const path = `/lol/league/v4/entries/by-puuid/${encodeURIComponent(puuid)}`;
    return this.request<LeagueEntryDto[]>(
      platform,
      '/lol/league/v4/entries/by-puuid/{puuid}',
      path
    );
  }

  async getMatchIds(
    regional: string,
    puuid: string,
    params: GetMatchIdsParams = {}
  ): Promise<string[]> {
    const query = new URLSearchParams();
    if (params.start !== undefined) query.set('start', String(params.start));
    if (params.count !== undefined) query.set('count', String(params.count));
    if (params.queue !== undefined) query.set('queue', String(params.queue));
    if (params.type !== undefined) query.set('type', params.type);
    if (params.startTime !== undefined)
      query.set('startTime', String(params.startTime));
    if (params.endTime !== undefined)
      query.set('endTime', String(params.endTime));

    const qs = query.toString();
    const path = `/lol/match/v5/matches/by-puuid/${encodeURIComponent(
      puuid
    )}/ids${qs ? `?${qs}` : ''}`;
    return this.request<string[]>(
      regional,
      '/lol/match/v5/matches/by-puuid/{puuid}/ids',
      path
    );
  }

  async getMatch(regional: string, matchId: string): Promise<MatchDto> {
    const path = `/lol/match/v5/matches/${encodeURIComponent(matchId)}`;
    return this.request<MatchDto>(
      regional,
      '/lol/match/v5/matches/{matchId}',
      path
    );
  }
}
