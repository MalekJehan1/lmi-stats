export interface WindowRule {
  limit: number;
  windowMs: number;
}

export interface RateLimitStore {
  tryAcquire(
    routing: string,
    nowMs: number,
    rules: WindowRule[]
  ): Promise<{ allowed: true } | { allowed: false; waitMs: number }>;
  setPause(routing: string, untilMs: number): Promise<void>;
}

export class InMemoryRateLimitStore implements RateLimitStore {
  private logs = new Map<string, number[]>();
  private pausedUntil = new Map<string, number>();

  async tryAcquire(
    routing: string,
    nowMs: number,
    rules: WindowRule[]
  ): Promise<{ allowed: true } | { allowed: false; waitMs: number }> {
    const key = routing.toLowerCase();
    const pauseUntil = this.pausedUntil.get(key) ?? 0;
    if (pauseUntil > nowMs) {
      return { allowed: false, waitMs: pauseUntil - nowMs };
    }

    const maxWindow = Math.max(...rules.map((r) => r.windowMs));
    const current = (this.logs.get(key) ?? []).filter(
      (ts) => nowMs - ts < maxWindow
    );

    let maxWaitMs = 0;
    for (const rule of rules) {
      const inWindow = current.filter((ts) => nowMs - ts < rule.windowMs);
      if (inWindow.length >= rule.limit) {
        const oldestInWindow = inWindow[inWindow.length - rule.limit];
        const waitMs = oldestInWindow + rule.windowMs - nowMs;
        if (waitMs > maxWaitMs) {
          maxWaitMs = waitMs;
        }
      }
    }

    if (maxWaitMs > 0) {
      this.logs.set(key, current);
      return { allowed: false, waitMs: maxWaitMs };
    }

    current.push(nowMs);
    this.logs.set(key, current);
    return { allowed: true };
  }

  async setPause(routing: string, untilMs: number): Promise<void> {
    const key = routing.toLowerCase();
    const existing = this.pausedUntil.get(key) ?? 0;
    if (untilMs > existing) {
      this.pausedUntil.set(key, untilMs);
    }
  }
}

export interface RedisLike {
  eval(
    script: string,
    numKeys: number,
    ...args: (string | number)[]
  ): Promise<unknown>;
}

const SLIDING_WINDOW_LUA = `
local pauseKey = KEYS[1]
local shortKey = KEYS[2]
local longKey = KEYS[3]
local nowMs = tonumber(ARGV[1])
local shortLimit = tonumber(ARGV[2])
local shortWindow = tonumber(ARGV[3])
local longLimit = tonumber(ARGV[4])
local longWindow = tonumber(ARGV[5])
local member = ARGV[6]

local pauseUntil = tonumber(redis.call('GET', pauseKey) or '0')
if pauseUntil > nowMs then
  return pauseUntil - nowMs
end

redis.call('ZREMRANGEBYSCORE', shortKey, '-inf', nowMs - shortWindow)
redis.call('ZREMRANGEBYSCORE', longKey, '-inf', nowMs - longWindow)

local shortCount = redis.call('ZCARD', shortKey)
local longCount = redis.call('ZCARD', longKey)

local waitMs = 0
if shortCount >= shortLimit then
  local oldest = redis.call('ZRANGE', shortKey, 0, 0, 'WITHSCORES')
  if oldest[2] then
    local w = tonumber(oldest[2]) + shortWindow - nowMs
    if w > waitMs then waitMs = w end
  end
end

if longCount >= longLimit then
  local oldest = redis.call('ZRANGE', longKey, 0, 0, 'WITHSCORES')
  if oldest[2] then
    local w = tonumber(oldest[2]) + longWindow - nowMs
    if w > waitMs then waitMs = w end
  end
end

if waitMs > 0 then
  return waitMs
end

redis.call('ZADD', shortKey, nowMs, member)
redis.call('PEXPIRE', shortKey, shortWindow)
redis.call('ZADD', longKey, nowMs, member)
redis.call('PEXPIRE', longKey, longWindow)
return 0
`;

const PAUSE_LUA = `
local pauseKey = KEYS[1]
local untilMs = tonumber(ARGV[1])
local ttlMs = tonumber(ARGV[2])
local current = tonumber(redis.call('GET', pauseKey) or '0')
if untilMs > current then
  redis.call('SET', pauseKey, tostring(untilMs), 'PX', ttlMs)
end
return 0
`;

export class RedisRateLimitStore implements RateLimitStore {
  private seq = 0;

  constructor(private readonly redis: RedisLike) {}

  async tryAcquire(
    routing: string,
    nowMs: number,
    rules: WindowRule[]
  ): Promise<{ allowed: true } | { allowed: false; waitMs: number }> {
    const key = routing.toLowerCase();
    const shortRule = rules[0] ?? { limit: 20, windowMs: 1000 };
    const longRule = rules[1] ?? { limit: 100, windowMs: 120_000 };
    this.seq += 1;
    const member = `${nowMs}:${this.seq}`;

    const waitMs = Number(
      await this.redis.eval(
        SLIDING_WINDOW_LUA,
        3,
        `riot:rl:${key}:pause`,
        `riot:rl:${key}:1s`,
        `riot:rl:${key}:120s`,
        nowMs,
        shortRule.limit,
        shortRule.windowMs,
        longRule.limit,
        longRule.windowMs,
        member
      )
    );

    if (waitMs > 0) {
      return { allowed: false, waitMs };
    }
    return { allowed: true };
  }

  async setPause(routing: string, untilMs: number): Promise<void> {
    const key = routing.toLowerCase();
    const ttlMs = Math.max(1000, untilMs - Date.now() + 5000);
    await this.redis.eval(
      PAUSE_LUA,
      1,
      `riot:rl:${key}:pause`,
      untilMs,
      ttlMs
    );
  }
}

export interface RateLimiterOptions {
  store?: RateLimitStore;
  rules?: WindowRule[];
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_RULES: WindowRule[] = [
  { limit: 20, windowMs: 1000 },
  { limit: 100, windowMs: 120_000 },
];

export class RateLimiter {
  private readonly store: RateLimitStore;
  private readonly rules: WindowRule[];
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly queues = new Map<string, Promise<void>>();

  constructor(options: RateLimiterOptions = {}) {
    this.store = options.store ?? new InMemoryRateLimitStore();
    this.rules = options.rules ?? DEFAULT_RULES;
    this.now = options.now ?? (() => Date.now());
    this.sleep =
      options.sleep ??
      ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  async acquire(routing: string): Promise<void> {
    const key = routing.toLowerCase();
    const prev = this.queues.get(key) ?? Promise.resolve();

    let release!: () => void;
    const currentGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.queues.set(
      key,
      prev.then(() => currentGate)
    );

    await prev;
    try {
      while (true) {
        const nowMs = this.now();
        const res = await this.store.tryAcquire(key, nowMs, this.rules);
        if (res.allowed) {
          return;
        }
        await this.sleep(Math.max(1, res.waitMs));
      }
    } finally {
      release();
    }
  }

  async pause(routing: string, ms: number): Promise<void> {
    if (ms <= 0) return;
    const untilMs = this.now() + ms;
    await this.store.setPause(routing.toLowerCase(), untilMs);
  }
}
