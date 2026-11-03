export const REFRESH_COOLDOWN_MS = 120_000; // 2 minutes (REFR-03, REFR-04)
export const IP_RATE_LIMIT_MAX = 10; // 10 requests per minute per IP (REFR-05)
export const IP_RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute

export type RefreshBlockReason = 'cooldown' | 'ip_limit';

export class RefreshRateLimitError extends Error {
  readonly status = 429;
  readonly reason: RefreshBlockReason;
  readonly retryAfterSeconds: number;

  constructor(reason: RefreshBlockReason, retryAfterSeconds: number) {
    super(
      reason === 'cooldown'
        ? `Refresh in cooldown (${retryAfterSeconds}s remaining)`
        : `Too many refresh requests from IP (retry after ${retryAfterSeconds}s)`
    );
    this.name = 'RefreshRateLimitError';
    this.reason = reason;
    this.retryAfterSeconds = Math.max(1, Math.ceil(retryAfterSeconds));
  }
}

export function getCooldownRemainingSeconds(
  lastUpdatedAt: Date | string | number | null | undefined,
  nowMs: number = Date.now(),
  cooldownMs: number = REFRESH_COOLDOWN_MS
): number {
  if (lastUpdatedAt === null || lastUpdatedAt === undefined) return 0;
  const updatedMs =
    typeof lastUpdatedAt === 'number'
      ? lastUpdatedAt
      : typeof lastUpdatedAt === 'string'
      ? Date.parse(lastUpdatedAt)
      : lastUpdatedAt.getTime();
  if (Number.isNaN(updatedMs)) return 0;

  const elapsedMs = nowMs - updatedMs;
  if (elapsedMs >= cooldownMs) return 0;
  return Math.max(1, Math.ceil((cooldownMs - elapsedMs) / 1000));
}

export interface RefreshGuardOptions {
  cooldownMs?: number;
  ipMaxRequests?: number;
  ipWindowMs?: number;
  now?: () => number;
}

export class RefreshGuard {
  private readonly cooldownMs: number;
  private readonly ipMaxRequests: number;
  private readonly ipWindowMs: number;
  private readonly now: () => number;
  private readonly ipTimestamps = new Map<string, number[]>();

  constructor(options: RefreshGuardOptions = {}) {
    this.cooldownMs = options.cooldownMs ?? REFRESH_COOLDOWN_MS;
    this.ipMaxRequests = options.ipMaxRequests ?? IP_RATE_LIMIT_MAX;
    this.ipWindowMs = options.ipWindowMs ?? IP_RATE_LIMIT_WINDOW_MS;
    this.now = options.now ?? (() => Date.now());
  }

  checkCooldown(
    lastUpdatedAt: Date | string | number | null | undefined
  ): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
    const remaining = getCooldownRemainingSeconds(
      lastUpdatedAt,
      this.now(),
      this.cooldownMs
    );
    if (remaining > 0) {
      return { allowed: false, retryAfterSeconds: remaining };
    }
    return { allowed: true };
  }

  checkAndRecordIp(
    ip: string
  ): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
    const normalizedIp = (ip || 'unknown').trim().toLowerCase();
    const nowMs = this.now();
    const recent = (this.ipTimestamps.get(normalizedIp) ?? []).filter(
      (ts) => nowMs - ts < this.ipWindowMs
    );

    if (recent.length >= this.ipMaxRequests) {
      const oldest = recent[recent.length - this.ipMaxRequests];
      const waitMs = Math.max(1000, oldest + this.ipWindowMs - nowMs);
      this.ipTimestamps.set(normalizedIp, recent);
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil(waitMs / 1000),
      };
    }

    recent.push(nowMs);
    this.ipTimestamps.set(normalizedIp, recent);
    return { allowed: true };
  }

  assertRefreshAllowed(params: {
    lastUpdatedAt?: Date | string | number | null;
    ip: string;
  }): void {
    const cooldownRes = this.checkCooldown(params.lastUpdatedAt);
    if (!cooldownRes.allowed) {
      throw new RefreshRateLimitError(
        'cooldown',
        cooldownRes.retryAfterSeconds
      );
    }

    const ipRes = this.checkAndRecordIp(params.ip);
    if (!ipRes.allowed) {
      throw new RefreshRateLimitError('ip_limit', ipRes.retryAfterSeconds);
    }
  }

  reset(): void {
    this.ipTimestamps.clear();
  }
}

let defaultGuardInstance: RefreshGuard | null = null;

export function getRefreshGuard(): RefreshGuard {
  if (!defaultGuardInstance) {
    defaultGuardInstance = new RefreshGuard();
  }
  return defaultGuardInstance;
}

export function setRefreshGuard(guard: RefreshGuard): void {
  defaultGuardInstance = guard;
}
