'use client';

import React, { useEffect, useState } from 'react';
import { t } from '@/i18n';
import { SummonerProfileData } from '@/server/db/repository';
import { fromSummonerSlug } from '@/server/riot/riot-id';
import { DEFAULT_PLATFORM, normalizePlatform } from '@/server/riot/routing';
import { Footer, Header } from '@/components/SearchBar';
import { ProfileHeader, RankedCards } from '@/components/ProfileHeader';
import { ChampionStatsPanel } from '@/components/ChampionStatsPanel';
import { MatchHistory } from '@/components/MatchHistory';

export type ProfileStateType =
  | 'loading'
  | 'ready'
  | 'not_found'
  | 'not_in_region'
  | 'timeout'
  | 'error';

export function ProfileLoadingSkeleton() {
  return (
    <div
      data-testid="profile-loading-skeleton"
      className="mx-auto w-full max-w-7xl px-4 py-6"
    >
      <p className="mb-4 text-sm font-medium text-indigo-400">
        {t('skeleton.loadingProfile')}
      </p>
      <div className="h-28 w-full animate-pulse rounded-xl border border-slate-800 bg-slate-900/80" />
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="flex flex-col gap-4 lg:col-span-4">
          <div className="h-24 animate-pulse rounded-xl border border-slate-800 bg-slate-900/80" />
          <div className="h-24 animate-pulse rounded-xl border border-slate-800 bg-slate-900/80" />
          <div className="h-64 animate-pulse rounded-xl border border-slate-800 bg-slate-900/80" />
        </div>
        <div className="flex flex-col gap-3 lg:col-span-8">
          <div className="h-12 animate-pulse rounded-xl border border-slate-800 bg-slate-900/80" />
          <div className="h-24 animate-pulse rounded-xl border border-slate-800 bg-slate-900/80" />
          <div className="h-24 animate-pulse rounded-xl border border-slate-800 bg-slate-900/80" />
          <div className="h-24 animate-pulse rounded-xl border border-slate-800 bg-slate-900/80" />
        </div>
      </div>
    </div>
  );
}

export function ProfileErrorState({
  state,
  riotId,
  platform,
}: {
  state: 'not_found' | 'not_in_region' | 'timeout' | 'error';
  riotId: string;
  platform: string;
}) {
  const title =
    state === 'not_found'
      ? t('error.playerNotFound')
      : state === 'not_in_region'
      ? t('error.playerNotInRegion')
      : state === 'timeout'
      ? t('error.searchTimeout')
      : t('refresh.error');

  return (
    <div
      data-testid={`profile-state-${state}`}
      className="mx-auto my-12 max-w-xl rounded-2xl border border-slate-800 bg-slate-900/90 p-8 text-center"
    >
      <h1 className="text-xl font-bold text-slate-100">{title}</h1>
      <p className="mt-2 text-sm text-slate-400">
        <span data-testid="searched-riot-id" className="font-semibold text-slate-200">
          {riotId}
        </span>{' '}
        —{' '}
        <span data-testid="searched-region" className="uppercase font-semibold text-indigo-400">
          {platform}
        </span>
      </p>
    </div>
  );
}

export interface SummonerProfileViewProps {
  platform: string;
  slug: string;
  initialProfile?: SummonerProfileData | null;
  initialState?: ProfileStateType;
  lookupTimeoutMs?: number;
  nowMs?: number;
  onNavigate?: (url: string) => void;
}

export function SummonerProfileView({
  platform: rawPlatform,
  slug,
  initialProfile = null,
  initialState,
  lookupTimeoutMs = 30_000,
  nowMs,
  onNavigate,
}: SummonerProfileViewProps) {
  const platform = normalizePlatform(rawPlatform) ?? DEFAULT_PLATFORM;
  const parsedSlug = fromSummonerSlug(slug);
  const searchedRiotId = parsedSlug.ok
    ? `${parsedSlug.gameName}#${parsedSlug.tagLine}`
    : slug;

  const [state, setState] = useState<ProfileStateType>(
    initialState ?? (initialProfile ? 'ready' : 'loading')
  );
  const [profile, setProfile] = useState<SummonerProfileData | null>(
    initialProfile
  );

  useEffect(() => {
    if (initialState !== undefined || initialProfile !== null) {
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      if (!cancelled) {
        setState('timeout');
      }
    }, lookupTimeoutMs);

    (async () => {
      try {
        const res = await fetch(
          `/api/summoners/${encodeURIComponent(platform)}/${encodeURIComponent(slug)}`
        );
        if (cancelled) return;
        const data = await res.json().catch(() => ({}));

        if (res.status === 200 && data.profile) {
          clearTimeout(timer);
          setProfile(data.profile as SummonerProfileData);
          setState('ready');
          return;
        }

        clearTimeout(timer);
        if (res.status === 404 && data.error === 'not_in_region') {
          setState('not_in_region');
        } else if (res.status === 404) {
          setState('not_found');
        } else if (res.status === 504 || data.error === 'timeout') {
          setState('timeout');
        } else {
          setState('error');
        }
      } catch {
        if (!cancelled) {
          clearTimeout(timer);
          setState('error');
        }
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [platform, slug, initialProfile, initialState, lookupTimeoutMs]);

  const handleRefreshed = (
    updatedProfile: SummonerProfileData,
    meta?: { renamed?: boolean; newSlug?: string }
  ) => {
    setProfile(updatedProfile);
    if (meta?.renamed && meta.newSlug) {
      const newUrl = `/${platform.toLowerCase()}/summoner/${meta.newSlug}`;
      if (onNavigate) {
        onNavigate(newUrl);
      } else if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', newUrl);
      }
    }
  };

  return (
    <div
      data-testid="summoner-profile-page"
      className="flex min-h-screen w-full flex-col overflow-x-hidden bg-slate-950 text-slate-100"
    >
      <Header
        defaultPlatform={platform}
        showSearch
        onNavigate={onNavigate}
      />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        {state === 'loading' && <ProfileLoadingSkeleton />}

        {(state === 'not_found' ||
          state === 'not_in_region' ||
          state === 'timeout' ||
          state === 'error') && (
          <ProfileErrorState
            state={state}
            riotId={searchedRiotId}
            platform={platform}
          />
        )}

        {state === 'ready' && profile && (
          <div data-testid="profile-content" className="flex flex-col gap-6">
            <ProfileHeader
              summoner={profile.summoner}
              nowMs={nowMs}
              onRefreshed={handleRefreshed}
            />

            <div
              data-testid="profile-responsive-grid"
              className="grid grid-cols-1 gap-6 lg:grid-cols-12"
            >
              <aside className="flex flex-col gap-4 lg:col-span-4">
                <RankedCards
                  solo={profile.leagues.solo}
                  flex={profile.leagues.flex}
                />
                <ChampionStatsPanel
                  solo={profile.championStats.solo}
                  flex={profile.championStats.flex}
                />
              </aside>

              <div className="flex flex-col gap-4 min-w-0 lg:col-span-8">
                <MatchHistory
                  platform={profile.summoner.platform}
                  puuid={profile.summoner.puuid}
                  initialMatches={profile.matches}
                  initialHasMore={profile.hasMoreMatches}
                  nowMs={nowMs}
                />
              </div>
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}

export default function SummonerProfilePage({
  params,
}: {
  params: { platform: string; slug: string };
}) {
  return (
    <SummonerProfileView
      platform={params.platform}
      slug={params.slug}
    />
  );
}
