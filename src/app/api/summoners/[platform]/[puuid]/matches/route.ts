import { NextRequest, NextResponse } from 'next/server';
import { t } from '@/i18n';
import { getRepository } from '@/server/db/repository';
import { normalizePlatform } from '@/server/riot/routing';
import {
  DEFAULT_QUEUE_TAB,
  QUEUE_TAB_LIST,
  QueueTab,
} from '@/server/stats/calculators';
import { getSyncDispatcher } from '@/server/sync/dispatcher';

export interface MatchesRouteParams {
  platform: string;
  puuid: string;
}

export interface MatchesRouteContext {
  params: MatchesRouteParams | Promise<MatchesRouteParams>;
}

function parseTab(raw: string | null): QueueTab {
  if (!raw) return DEFAULT_QUEUE_TAB;
  const lower = raw.trim().toLowerCase() as QueueTab;
  return QUEUE_TAB_LIST.includes(lower) ? lower : DEFAULT_QUEUE_TAB;
}

export async function GET(
  req: NextRequest | Request,
  context: MatchesRouteContext
): Promise<NextResponse> {
  const { platform: rawPlatform, puuid } = await Promise.resolve(
    context.params
  );
  const platform = normalizePlatform(rawPlatform);
  if (!platform) {
    return NextResponse.json(
      {
        error: 'not_found',
        message: t('error.playerNotFound'),
      },
      { status: 404 }
    );
  }

  const url = new URL(req.url, 'http://localhost');
  const tab = parseTab(url.searchParams.get('tab'));
  const rawCursor = url.searchParams.get('cursor');
  const rawStart = url.searchParams.get('start');
  const rawCount = url.searchParams.get('count');
  const forceLoadMore =
    url.searchParams.get('loadMore') === '1' ||
    url.searchParams.get('loadMore') === 'true';

  const cursor =
    rawCursor !== null && rawCursor !== '' && !Number.isNaN(Number(rawCursor))
      ? Number(rawCursor)
      : undefined;
  const start =
    rawStart !== null && rawStart !== '' && !Number.isNaN(Number(rawStart))
      ? Number(rawStart)
      : undefined;
  const count =
    rawCount !== null && rawCount !== '' && Number(rawCount) > 0
      ? Math.min(100, Number(rawCount))
      : 20;

  const syncService = getSyncDispatcher().getSyncService();
  const repository = syncService.getRepository() ?? getRepository();

  if (cursor !== undefined || start !== undefined || forceLoadMore) {
    try {
      const result = await syncService.loadMore(platform, puuid, {
        tab,
        cursor,
        start,
        count,
      });
      return NextResponse.json(
        {
          matches: result.matches,
          nextCursor: result.nextCursor,
          hasMore: result.hasMore,
          fetchedCount: result.fetchedCount,
        },
        { status: 200 }
      );
    } catch {
      return NextResponse.json(
        {
          error: 'unavailable',
          message: t('refresh.error'),
        },
        { status: 503 }
      );
    }
  }

  const { matches: rawMatches } = await repository.getMatchesForPlayer(puuid, {
    tab,
    limit: count + 1,
  });
  const matches = rawMatches.slice(0, count);
  const hasMore = rawMatches.length > count || matches.length === count;
  const nextCursor =
    matches.length > 0 ? matches[matches.length - 1].gameStartTimestamp : null;

  return NextResponse.json(
    {
      matches,
      nextCursor,
      hasMore,
      fetchedCount: 0,
    },
    { status: 200 }
  );
}
