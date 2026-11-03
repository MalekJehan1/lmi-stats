import { NextRequest, NextResponse } from 'next/server';
import { t } from '@/i18n';
import { getRepository } from '@/server/db/repository';
import { fromSummonerSlug } from '@/server/riot/riot-id';
import { normalizePlatform } from '@/server/riot/routing';
import {
  getSyncDispatcher,
  LookupTimeoutError,
} from '@/server/sync/dispatcher';
import {
  PlayerNotFoundError,
  PlayerNotInRegionError,
} from '@/server/sync/sync-service';

export interface LookupRouteParams {
  platform: string;
  slug: string;
}

export interface LookupRouteContext {
  params: LookupRouteParams | Promise<LookupRouteParams>;
}

async function handleLookup(
  _req: NextRequest | Request,
  context: LookupRouteContext
): Promise<NextResponse> {
  const { platform: rawPlatform, slug } = await Promise.resolve(context.params);
  const platform = normalizePlatform(rawPlatform);
  if (!platform) {
    return NextResponse.json(
      {
        error: 'not_found',
        message: t('error.playerNotFound'),
        platform: rawPlatform,
      },
      { status: 404 }
    );
  }

  const parsed = fromSummonerSlug(slug);
  if (!parsed.ok) {
    return NextResponse.json(
      {
        error: 'invalid_format',
        message: parsed.error,
      },
      { status: 400 }
    );
  }

  const dispatcher = getSyncDispatcher();
  const repository =
    dispatcher.getSyncService().getRepository() ?? getRepository();

  // SRCH-05: If summoner is already saved in DB, return directly with 0 Riot API calls
  const existing = await repository.findSummonerByRiotId(
    platform,
    parsed.gameName,
    parsed.tagLine
  );
  if (existing) {
    const profile = await repository.getProfileData(platform, existing.puuid);
    if (profile) {
      return NextResponse.json(
        {
          profile,
          fromCache: true,
        },
        { status: 200 }
      );
    }
  }

  // SRCH-04: First search fetches from Riot API via SyncDispatcher with 30s timeout (SRCH-10)
  try {
    const result = await dispatcher.dispatchLookup(
      platform,
      parsed.gameName,
      parsed.tagLine
    );
    return NextResponse.json(
      {
        profile: result.profile,
        fromCache: result.fromCache,
        jobId: result.jobId,
      },
      { status: 200 }
    );
  } catch (err) {
    if (err instanceof PlayerNotFoundError) {
      return NextResponse.json(
        {
          error: 'not_found',
          message: t('error.playerNotFound'),
          riotId: `${parsed.gameName}#${parsed.tagLine}`,
          platform,
        },
        { status: 404 }
      );
    }

    if (err instanceof PlayerNotInRegionError) {
      return NextResponse.json(
        {
          error: 'not_in_region',
          message: t('error.playerNotInRegion'),
          riotId: `${parsed.gameName}#${parsed.tagLine}`,
          platform,
        },
        { status: 404 }
      );
    }

    if (err instanceof LookupTimeoutError) {
      return NextResponse.json(
        {
          error: 'timeout',
          message: t('error.searchTimeout'),
          jobId: err.jobId,
        },
        { status: 504 }
      );
    }

    return NextResponse.json(
      {
        error: 'unavailable',
        message: t('refresh.error'),
      },
      { status: 503 }
    );
  }
}

export async function GET(
  req: NextRequest | Request,
  context: LookupRouteContext
): Promise<NextResponse> {
  return handleLookup(req, context);
}

export async function POST(
  req: NextRequest | Request,
  context: LookupRouteContext
): Promise<NextResponse> {
  return handleLookup(req, context);
}
