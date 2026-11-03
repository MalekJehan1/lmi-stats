import { NextRequest, NextResponse } from 'next/server';
import { t } from '@/i18n';
import { getRepository } from '@/server/db/repository';
import { normalizePlatform } from '@/server/riot/routing';
import { getSyncDispatcher } from '@/server/sync/dispatcher';
import { getRefreshGuard, RefreshRateLimitError } from '@/server/sync/guards';

export interface RefreshRouteParams {
  platform: string;
  puuid: string;
}

export interface RefreshRouteContext {
  params: RefreshRouteParams | Promise<RefreshRouteParams>;
}

function extractClientIp(req: NextRequest | Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;
  return '127.0.0.1';
}

export async function POST(
  req: NextRequest | Request,
  context: RefreshRouteContext
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

  const dispatcher = getSyncDispatcher();
  const repository =
    dispatcher.getSyncService().getRepository() ?? getRepository();
  const guard = getRefreshGuard();

  const existingSummoner = await repository.findSummonerByPuuid(
    platform,
    puuid
  );
  const clientIp = extractClientIp(req);

  try {
    guard.assertRefreshAllowed({
      lastUpdatedAt: existingSummoner?.lastUpdatedAt ?? null,
      ip: clientIp,
    });
  } catch (err) {
    if (err instanceof RefreshRateLimitError) {
      return NextResponse.json(
        {
          error: 'rate_limited',
          reason: err.reason,
          retryAfterSeconds: err.retryAfterSeconds,
          message: t('refresh.cooldown', { seconds: err.retryAfterSeconds }),
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(err.retryAfterSeconds),
          },
        }
      );
    }
    throw err;
  }

  try {
    const result = await dispatcher.dispatchRefresh(platform, puuid);
    return NextResponse.json(
      {
        profile: result.profile,
        renamed: result.renamed,
        newSlug: result.newSlug,
        previousSlug: result.previousSlug,
        newMatchesFetched: result.newMatchesFetched,
        jobId: result.jobId,
      },
      { status: 200 }
    );
  } catch {
    const preservedProfile = await repository.getProfileData(platform, puuid);
    return NextResponse.json(
      {
        error: 'unavailable',
        message: t('refresh.error'),
        profile: preservedProfile,
      },
      { status: 503 }
    );
  }
}
