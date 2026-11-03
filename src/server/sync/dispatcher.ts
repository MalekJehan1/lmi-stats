import { t } from '@/i18n';
import { normalizeRiotId } from '@/server/riot/riot-id';
import { normalizePlatform } from '@/server/riot/routing';
import {
  LookupResult,
  PlayerNotFoundError,
  PlayerNotInRegionError,
  RefreshResult,
  SyncService,
} from './sync-service';

export type SyncMode = 'inline' | 'worker';
export type JobState = 'waiting' | 'active' | 'completed' | 'failed';
export type JobErrorCode =
  | 'not_found'
  | 'not_in_region'
  | 'timeout'
  | 'unavailable';

export interface SyncJobStatus<T = unknown> {
  jobId: string;
  state: JobState;
  result?: T;
  error?: JobErrorCode;
  errorMessage?: string;
  updatedAt: number;
}

export class LookupTimeoutError extends Error {
  readonly status = 504;
  readonly code = 'timeout' as const;
  readonly jobId: string;

  constructor(jobId: string) {
    super(t('error.searchTimeout'));
    this.name = 'LookupTimeoutError';
    this.jobId = jobId;
  }
}

export interface WorkerQueuePayload {
  jobId: string;
  type: 'lookup' | 'refresh';
  platform: string;
  gameName?: string;
  tagLine?: string;
  puuid?: string;
}

export interface WorkerQueueAdapter {
  enqueue(payload: WorkerQueuePayload): Promise<void>;
}

export interface SyncDispatcherOptions {
  syncService?: SyncService;
  mode?: SyncMode;
  defaultLookupTimeoutMs?: number;
  queueAdapter?: WorkerQueueAdapter;
  now?: () => number;
}

export class SyncDispatcher {
  private readonly syncService: SyncService;
  private readonly mode: SyncMode;
  private readonly defaultLookupTimeoutMs: number;
  private readonly queueAdapter?: WorkerQueueAdapter;
  private readonly now: () => number;

  private readonly inFlight = new Map<string, Promise<unknown>>();
  private readonly jobStatuses = new Map<string, SyncJobStatus>();

  constructor(options: SyncDispatcherOptions = {}) {
    this.syncService = options.syncService ?? new SyncService();
    this.mode =
      options.mode ??
      (process.env.SYNC_MODE === 'worker' ? 'worker' : 'inline');
    this.defaultLookupTimeoutMs = options.defaultLookupTimeoutMs ?? 30_000;
    this.queueAdapter = options.queueAdapter;
    this.now = options.now ?? (() => Date.now());
  }

  getSyncService(): SyncService {
    return this.syncService;
  }

  getMode(): SyncMode {
    return this.mode;
  }

  buildLookupJobId(
    platform: string,
    gameName: string,
    tagLine: string
  ): string {
    const plat = (normalizePlatform(platform) ?? platform).toUpperCase();
    const norm = normalizeRiotId(gameName, tagLine);
    return `lookup:${plat}:${norm.key}`;
  }

  buildRefreshJobId(platform: string, puuid: string): string {
    const plat = (normalizePlatform(platform) ?? platform).toUpperCase();
    return `refresh:${plat}:${puuid}`;
  }

  getJobStatus<T = unknown>(jobId: string): SyncJobStatus<T> | null {
    const status = this.jobStatuses.get(jobId);
    if (!status) return null;
    return status as SyncJobStatus<T>;
  }

  async dispatchLookup(
    platform: string,
    gameName: string,
    tagLine: string,
    options: { timeoutMs?: number } = {}
  ): Promise<LookupResult & { jobId: string }> {
    const jobId = this.buildLookupJobId(platform, gameName, tagLine);
    const timeoutMs = options.timeoutMs ?? this.defaultLookupTimeoutMs;

    const taskPromise = this.runDeduplicated<LookupResult>(jobId, async () => {
      if (this.mode === 'worker' && this.queueAdapter) {
        await this.queueAdapter.enqueue({
          jobId,
          type: 'lookup',
          platform,
          gameName,
          tagLine,
        });
      }
      return this.syncService.lookup(platform, gameName, tagLine);
    });

    const result = await this.withTimeout(taskPromise, timeoutMs, jobId);
    return { ...result, jobId };
  }

  async dispatchRefresh(
    platform: string,
    puuid: string
  ): Promise<RefreshResult & { jobId: string }> {
    const jobId = this.buildRefreshJobId(platform, puuid);

    const result = await this.runDeduplicated<RefreshResult>(
      jobId,
      async () => {
        if (this.mode === 'worker' && this.queueAdapter) {
          await this.queueAdapter.enqueue({
            jobId,
            type: 'refresh',
            platform,
            puuid,
          });
        }
        return this.syncService.refresh(platform, puuid);
      }
    );

    return { ...result, jobId };
  }

  async processWorkerJob(payload: WorkerQueuePayload): Promise<unknown> {
    if (payload.type === 'lookup') {
      return this.dispatchLookup(
        payload.platform,
        payload.gameName ?? '',
        payload.tagLine ?? ''
      );
    }
    return this.dispatchRefresh(payload.platform, payload.puuid ?? '');
  }

  private runDeduplicated<T>(
    jobId: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const existing = this.inFlight.get(jobId) as Promise<T> | undefined;
    if (existing) {
      return existing;
    }

    this.jobStatuses.set(jobId, {
      jobId,
      state: 'active',
      updatedAt: this.now(),
    });

    const execution = (async () => {
      try {
        const res = await fn();
        this.jobStatuses.set(jobId, {
          jobId,
          state: 'completed',
          result: res,
          updatedAt: this.now(),
        });
        return res;
      } catch (err) {
        const errorCode: JobErrorCode =
          err instanceof PlayerNotFoundError
            ? 'not_found'
            : err instanceof PlayerNotInRegionError
            ? 'not_in_region'
            : 'unavailable';
        const errorMessage =
          err instanceof Error ? err.message : t('refresh.error');
        this.jobStatuses.set(jobId, {
          jobId,
          state: 'failed',
          error: errorCode,
          errorMessage,
          updatedAt: this.now(),
        });
        throw err;
      } finally {
        this.inFlight.delete(jobId);
      }
    })();

    this.inFlight.set(jobId, execution);
    return execution;
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    jobId: string
  ): Promise<T> {
    if (timeoutMs <= 0) {
      throw new LookupTimeoutError(jobId);
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new LookupTimeoutError(jobId));
      }, timeoutMs);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  }
}

let defaultDispatcherInstance: SyncDispatcher | null = null;

export function getSyncDispatcher(): SyncDispatcher {
  if (!defaultDispatcherInstance) {
    defaultDispatcherInstance = new SyncDispatcher();
  }
  return defaultDispatcherInstance;
}

export function setSyncDispatcher(dispatcher: SyncDispatcher): void {
  defaultDispatcherInstance = dispatcher;
}
