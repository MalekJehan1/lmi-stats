import { describe, it, expect, vi } from 'vitest';
import { RateLimiter } from '@/server/riot/rate-limiter';
import {
  RiotClient,
  RiotAuthError,
  RiotNotFoundError,
  RiotUnavailableError,
  type RiotCallLogEntry,
} from '@/server/riot/client';

function createFakeClock(initialMs = 1_000_000) {
  let currentMs = initialMs;
  const sleeps: number[] = [];
  return {
    now: () => currentMs,
    advance: (ms: number) => {
      currentMs += ms;
    },
    sleep: async (ms: number) => {
      sleeps.push(ms);
      currentMs += ms;
    },
    sleeps,
  };
}

describe('RateLimiter and RiotClient', () => {
  it('RIOT-01 enforces 20 req/1s and 100 req/2min per routing and queues excess', async () => {
    const clock = createFakeClock();
    const limiter = new RateLimiter({
      now: clock.now,
      sleep: clock.sleep,
    });

    const timestamps: number[] = [];
    for (let i = 0; i < 25; i++) {
      await limiter.acquire('br1');
      timestamps.push(clock.now());
    }

    expect(timestamps.slice(0, 20).every((t) => t === 1_000_000)).toBe(true);
    expect(timestamps[20]).toBe(1_001_000);
    expect(timestamps[24]).toBe(1_001_000);

    for (let i = 25; i < 100; i++) {
      await limiter.acquire('br1');
      timestamps.push(clock.now());
    }
    expect(timestamps).toHaveLength(100);
    expect(timestamps[99]).toBe(1_004_000);

    await limiter.acquire('br1');
    expect(clock.now()).toBe(1_120_000);
  });

  it('isolates rate limit buckets per routing value', async () => {
    const clock = createFakeClock();
    const limiter = new RateLimiter({
      now: clock.now,
      sleep: clock.sleep,
    });

    for (let i = 0; i < 20; i++) {
      await limiter.acquire('americas');
    }
    await limiter.acquire('europe');
    expect(clock.sleeps).toHaveLength(0);
  });

  it('pauses subsequent requests on a routing value when pause() is called', async () => {
    const clock = createFakeClock();
    const limiter = new RateLimiter({
      now: clock.now,
      sleep: clock.sleep,
    });

    await limiter.pause('br1', 3000);
    await limiter.acquire('br1');
    expect(clock.now()).toBe(1_003_000);
    expect(clock.sleeps).toEqual([3000]);
  });

  it('RIOT-02 waits Retry-After on 429 and retries up to 3 times', async () => {
    const clock = createFakeClock();
    const limiter = new RateLimiter({ now: clock.now, sleep: clock.sleep });
    let attempts = 0;

    const fakeFetch = vi.fn(async () => {
      attempts += 1;
      if (attempts <= 2) {
        return new Response('Rate limit exceeded', {
          status: 429,
          headers: { 'Retry-After': '2' },
        });
      }
      return new Response(
        JSON.stringify({ puuid: 'puuid-1', gameName: 'Faker', tagLine: 'T1' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const client = new RiotClient({
      apiKey: 'RGAPI-test-key',
      rateLimiter: limiter,
      fetchImpl: fakeFetch as unknown as typeof fetch,
      now: clock.now,
      sleep: clock.sleep,
    });

    const account = await client.getAccountByRiotId('asia', 'Faker', 'T1');
    expect(account).toEqual({ puuid: 'puuid-1', gameName: 'Faker', tagLine: 'T1' });
    expect(attempts).toBe(3);
    expect(clock.sleeps).toContain(2000);

    // Also verify failing when all 3 retries still return 429
    const always429Fetch = vi.fn(async () => {
      return new Response('Rate limit exceeded', {
        status: 429,
        headers: { 'Retry-After': '1' },
      });
    });
    const clientFail = new RiotClient({
      apiKey: 'RGAPI-test-key',
      rateLimiter: limiter,
      fetchImpl: always429Fetch as unknown as typeof fetch,
      now: clock.now,
      sleep: clock.sleep,
    });
    await expect(
      clientFail.getAccountByRiotId('asia', 'Faker', 'T1')
    ).rejects.toBeInstanceOf(RiotUnavailableError);
    expect(always429Fetch).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
  });

  it('RIOT-03 retries 5xx or timeout twice with exponential backoff then fails', async () => {
    const clock = createFakeClock();
    const limiter = new RateLimiter({ now: clock.now, sleep: clock.sleep });
    const fake503Fetch = vi.fn(async () => {
      return new Response('Service Unavailable', { status: 503 });
    });

    const client = new RiotClient({
      apiKey: 'RGAPI-test-key',
      rateLimiter: limiter,
      fetchImpl: fake503Fetch as unknown as typeof fetch,
      now: clock.now,
      sleep: clock.sleep,
    });

    await expect(
      client.getSummonerByPuuid('BR1', 'puuid-123')
    ).rejects.toBeInstanceOf(RiotUnavailableError);

    // 1 initial + 2 retries = 3 calls
    expect(fake503Fetch).toHaveBeenCalledTimes(3);
    // Exponential backoff sleeps: 500ms, 1000ms
    expect(clock.sleeps).toEqual([500, 1000]);

    // Also test timeout (AbortError) retrying twice then failing
    const clockTimeout = createFakeClock();
    const abortFetch = vi.fn(async () => {
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      throw err;
    });
    const timeoutClient = new RiotClient({
      apiKey: 'RGAPI-test-key',
      rateLimiter: new RateLimiter({ now: clockTimeout.now, sleep: clockTimeout.sleep }),
      fetchImpl: abortFetch as unknown as typeof fetch,
      now: clockTimeout.now,
      sleep: clockTimeout.sleep,
    });
    await expect(
      timeoutClient.getMatch('americas', 'BR1_12345')
    ).rejects.toBeInstanceOf(RiotUnavailableError);
    expect(abortFetch).toHaveBeenCalledTimes(3);
    expect(clockTimeout.sleeps).toEqual([500, 1000]);
  });

  it('RIOT-04 fails without retry on 401/403 and logs Riot API key inválida ou expirada', async () => {
    const clock = createFakeClock();
    const logs: RiotCallLogEntry[] = [];
    const errorMessages: string[] = [];
    const fake403Fetch = vi.fn(async () => {
      return new Response('Forbidden', { status: 403 });
    });

    const client = new RiotClient({
      apiKey: 'RGAPI-expired',
      rateLimiter: new RateLimiter({ now: clock.now, sleep: clock.sleep }),
      fetchImpl: fake403Fetch as unknown as typeof fetch,
      now: clock.now,
      sleep: clock.sleep,
      logger: {
        info: (entry) => logs.push(entry),
        error: (entry, msg) => {
          logs.push(entry);
          if (msg) errorMessages.push(msg);
        },
      },
    });

    await expect(
      client.getAccountByRiotId('americas', 'Player', 'BR1')
    ).rejects.toBeInstanceOf(RiotAuthError);

    expect(fake403Fetch).toHaveBeenCalledTimes(1);
    expect(errorMessages).toContain('Riot API key inválida ou expirada');
  });

  it('RIOT-05 reads RIOT_API_KEY from server env and never exposes it', async () => {
    const prevKey = process.env.RIOT_API_KEY;
    process.env.RIOT_API_KEY = 'RGAPI-secret-env-key-999';
    try {
      const clock = createFakeClock();
      const logs: RiotCallLogEntry[] = [];
      let capturedHeader: string | null = null;

      const fakeFetch = vi.fn(async (_url: string, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        capturedHeader = headers.get('X-Riot-Token');
        return new Response('Forbidden', { status: 401 });
      });

      const client = new RiotClient({
        rateLimiter: new RateLimiter({ now: clock.now, sleep: clock.sleep }),
        fetchImpl: fakeFetch as unknown as typeof fetch,
        now: clock.now,
        sleep: clock.sleep,
        logger: {
          info: (entry) => logs.push(entry),
          error: (entry) => logs.push(entry),
        },
      });

      let thrownError: Error | null = null;
      try {
        await client.getSummonerByPuuid('BR1', 'puuid-secret-test');
      } catch (err) {
        thrownError = err as Error;
      }

      expect(capturedHeader).toBe('RGAPI-secret-env-key-999');
      expect(thrownError).toBeInstanceOf(RiotAuthError);
      expect(thrownError?.message).not.toContain('RGAPI-secret-env-key-999');
      expect(JSON.stringify(logs)).not.toContain('RGAPI-secret-env-key-999');
    } finally {
      process.env.RIOT_API_KEY = prevKey;
    }
  });

  it('RIOT-06 logs route, routing, status and latencyMs on every call', async () => {
    const clock = createFakeClock();
    const logs: RiotCallLogEntry[] = [];

    const fakeFetch = vi.fn(async () => {
      clock.advance(42);
      return new Response(JSON.stringify(['BR1_1', 'BR1_2']), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const client = new RiotClient({
      apiKey: 'RGAPI-test',
      rateLimiter: new RateLimiter({ now: clock.now, sleep: clock.sleep }),
      fetchImpl: fakeFetch as unknown as typeof fetch,
      now: clock.now,
      sleep: clock.sleep,
      logger: {
        info: (entry) => logs.push(entry),
        error: (entry) => logs.push(entry),
      },
    });

    const ids = await client.getMatchIds('americas', 'secret-puuid-value', {
      count: 20,
      queue: 420,
    });
    expect(ids).toEqual(['BR1_1', 'BR1_2']);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toEqual({
      route: '/lol/match/v5/matches/by-puuid/{puuid}/ids',
      routing: 'americas',
      status: 200,
      latencyMs: 42,
    });
    // Must not leak raw PUUID into route template
    expect(logs[0].route).not.toContain('secret-puuid-value');
  });

  it('throws RiotNotFoundError on 404 without retrying', async () => {
    const clock = createFakeClock();
    const fake404 = vi.fn(async () => new Response('Not Found', { status: 404 }));
    const client = new RiotClient({
      apiKey: 'RGAPI-test',
      rateLimiter: new RateLimiter({ now: clock.now, sleep: clock.sleep }),
      fetchImpl: fake404 as unknown as typeof fetch,
      now: clock.now,
      sleep: clock.sleep,
    });

    await expect(
      client.getAccountByRiotId('americas', 'Ghost', 'BR1')
    ).rejects.toBeInstanceOf(RiotNotFoundError);
    expect(fake404).toHaveBeenCalledTimes(1);
  });

  it('calls league-v4 entries by puuid and account-v1 by puuid', async () => {
    const clock = createFakeClock();
    const fakeFetch = vi.fn(async (url: string) => {
      if (url.includes('/lol/league/v4/entries/by-puuid/')) {
        return new Response(
          JSON.stringify([
            {
              queueType: 'RANKED_SOLO_5x5',
              tier: 'DIAMOND',
              rank: 'II',
              leaguePoints: 75,
              wins: 50,
              losses: 40,
            },
          ]),
          { status: 200 }
        );
      }
      return new Response(
        JSON.stringify({ puuid: 'p1', gameName: 'NewName', tagLine: 'BR1' }),
        { status: 200 }
      );
    });

    const client = new RiotClient({
      apiKey: 'RGAPI-test',
      rateLimiter: new RateLimiter({ now: clock.now, sleep: clock.sleep }),
      fetchImpl: fakeFetch as unknown as typeof fetch,
      now: clock.now,
      sleep: clock.sleep,
    });

    const leagues = await client.getLeagueEntriesByPuuid('BR1', 'p1');
    expect(leagues).toHaveLength(1);
    expect(leagues[0].tier).toBe('DIAMOND');

    const account = await client.getAccountByPuuid('americas', 'p1');
    expect(account.gameName).toBe('NewName');
  });
});
