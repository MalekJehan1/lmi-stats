'use client';

import React, { useEffect, useState } from 'react';
import { formatRelativeTime, t } from '@/i18n';
import { LeagueEntryData, SummonerProfileData } from '@/server/db/repository';
import { profileIconImg } from '@/server/riot/ddragon';
import { fromSummonerSlug } from '@/server/riot/riot-id';
import { DEFAULT_PLATFORM, normalizePlatform } from '@/server/riot/routing';
import { winrate } from '@/server/stats/calculators';
import { getCooldownRemainingSeconds } from '@/server/sync/guards';
import { Footer, Header } from './SearchBar';
import { ChampionStatsPanel } from './ChampionStatsPanel';
import { MatchHistory } from './MatchHistory';

export interface RefreshButtonProps {
  platform: string;
  puuid: string;
  lastUpdatedAt: string | Date;
  nowMs?: number;
  initialRefreshing?: boolean;
  onRefreshed?: (
    updatedProfile: SummonerProfileData,
    meta?: { renamed?: boolean; newSlug?: string }
  ) => void;
  onError?: (errorMessage: string) => void;
}

export function RefreshButton({
  platform,
  puuid,
  lastUpdatedAt,
  nowMs,
  initialRefreshing = false,
  onRefreshed,
  onError,
}: RefreshButtonProps) {
  const [isRefreshing, setIsRefreshing] = useState(initialRefreshing);
  const [cooldownSec, setCooldownSec] = useState(() =>
    getCooldownRemainingSeconds(lastUpdatedAt, nowMs ?? Date.now())
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setCooldownSec(
      getCooldownRemainingSeconds(lastUpdatedAt, nowMs ?? Date.now())
    );
  }, [lastUpdatedAt, nowMs]);

  useEffect(() => {
    if (cooldownSec <= 0 || nowMs !== undefined) return;
    const timer = setInterval(() => {
      setCooldownSec((prev) => {
        const next = getCooldownRemainingSeconds(lastUpdatedAt, Date.now());
        return next > 0 ? next : Math.max(0, prev - 1);
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSec, lastUpdatedAt, nowMs]);

  const handleClick = async () => {
    if (isRefreshing || cooldownSec > 0) return;
    setIsRefreshing(true);
    setErrorMessage(null);

    try {
      const res = await fetch(
        `/api/summoners/${encodeURIComponent(platform)}/${encodeURIComponent(puuid)}/refresh`,
        { method: 'POST' }
      );
      const data = await res.json().catch(() => ({}));

      if (res.status === 429) {
        const retry =
          typeof data.retryAfterSeconds === 'number' &&
          data.retryAfterSeconds > 0
            ? data.retryAfterSeconds
            : 120;
        setCooldownSec(retry);
        setIsRefreshing(false);
        return;
      }

      if (!res.ok) {
        const msg =
          typeof data.message === 'string' && data.message
            ? data.message
            : t('refresh.error');
        setErrorMessage(msg);
        onError?.(msg);
        setIsRefreshing(false);
        return;
      }

      if (data.profile) {
        onRefreshed?.(data.profile as SummonerProfileData, {
          renamed: Boolean(data.renamed),
          newSlug: data.newSlug,
        });
        const newUpdatedAt =
          data.profile.summoner?.lastUpdatedAt ?? new Date().toISOString();
        setCooldownSec(
          getCooldownRemainingSeconds(newUpdatedAt, nowMs ?? Date.now())
        );
      }
    } catch {
      const msg = t('refresh.error');
      setErrorMessage(msg);
      onError?.(msg);
    } finally {
      setIsRefreshing(false);
    }
  };

  const disabled = isRefreshing || cooldownSec > 0;
  const label = isRefreshing
    ? t('refresh.loading')
    : cooldownSec > 0
    ? t('refresh.cooldown', { seconds: cooldownSec })
    : t('refresh.idle');

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        data-testid="refresh-button"
        disabled={disabled}
        onClick={handleClick}
        className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
          disabled
            ? 'cursor-not-allowed bg-slate-800 text-slate-400 border border-slate-700'
            : 'bg-indigo-600 text-white hover:bg-indigo-500'
        }`}
      >
        {label}
      </button>
      {errorMessage && (
        <p
          role="alert"
          data-testid="refresh-error"
          className="text-xs font-medium text-rose-400"
        >
          {errorMessage}
        </p>
      )}
    </div>
  );
}

export interface ProfileHeaderProps {
  summoner: SummonerProfileData['summoner'];
  nowMs?: number;
  initialRefreshing?: boolean;
  onRefreshed?: (
    updatedProfile: SummonerProfileData,
    meta?: { renamed?: boolean; newSlug?: string }
  ) => void;
}

export function ProfileHeader({
  summoner,
  nowMs,
  initialRefreshing = false,
  onRefreshed,
}: ProfileHeaderProps) {
  const iconUrl = profileIconImg(summoner.profileIconId);
  const relativeStr = formatRelativeTime(
    new Date(summoner.lastUpdatedAt),
    nowMs ?? Date.now()
  );
  const updatedText = t('profile.updatedAgo', { time: relativeStr });

  return (
    <section
      data-testid="profile-header"
      className="flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-900/90 p-5 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-center gap-4">
        <div className="relative h-20 w-20 shrink-0">
          {iconUrl ? (
            <img
              src={iconUrl}
              alt={`${summoner.gameName}#${summoner.tagLine}`}
              data-testid="summoner-icon"
              className="h-20 w-20 rounded-xl border-2 border-indigo-500/60 object-cover"
            />
          ) : (
            <div
              data-testid="summoner-icon-placeholder"
              className="h-20 w-20 rounded-xl border-2 border-slate-700 bg-slate-800"
            />
          )}
          <span
            data-testid="summoner-level"
            className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full border border-slate-700 bg-slate-950 px-2.5 py-0.5 text-xs font-bold text-slate-100 whitespace-nowrap"
          >
            {t('profile.level', { level: summoner.summonerLevel })}
          </span>
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <h1
              data-testid="summoner-riot-id"
              className="text-2xl font-bold text-slate-100"
            >
              <span>{summoner.gameName}</span>
              <span className="ml-1 text-lg font-medium text-slate-400">
                #{summoner.tagLine}
              </span>
            </h1>
            <span
              data-testid="summoner-region"
              className="rounded bg-indigo-500/20 px-2 py-0.5 text-xs font-bold uppercase text-indigo-300 border border-indigo-500/30"
            >
              {summoner.platform}
            </span>
          </div>

          <p
            data-testid="summoner-updated-ago"
            className="text-xs text-slate-400"
          >
            {updatedText}
          </p>
        </div>
      </div>

      <RefreshButton
        platform={summoner.platform}
        puuid={summoner.puuid}
        lastUpdatedAt={summoner.lastUpdatedAt}
        nowMs={nowMs}
        initialRefreshing={initialRefreshing}
        onRefreshed={onRefreshed}
      />
    </section>
  );
}

function SingleRankedCard({
  title,
  entry,
  testId,
}: {
  title: string;
  entry: LeagueEntryData | null;
  testId: string;
}) {
  if (!entry) {
    return (
      <div
        data-testid={testId}
        className="flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-900/90 p-4"
      >
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          {title}
        </h2>
        <div className="mt-3 flex items-center justify-between">
          <span
            data-testid={`${testId}-unranked`}
            className="text-lg font-bold text-slate-500"
          >
            {t('ranked.unranked')}
          </span>
        </div>
      </div>
    );
  }

  const computedWinrate =
    typeof entry.winrate === 'number'
      ? entry.winrate
      : winrate(entry.wins, entry.losses);

  return (
    <div
      data-testid={testId}
      className="flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-900/90 p-4"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          {title}
        </h2>
        <span className="text-xs font-medium text-indigo-400">
          {t('ranked.lp', { lp: entry.leaguePoints })}
        </span>
      </div>

      <div className="mt-2 flex items-baseline justify-between gap-2">
        <div className="text-lg font-bold text-slate-100">
          <span>{entry.tier}</span>{' '}
          <span>{entry.rank}</span>
        </div>
        <div className="text-right text-xs text-slate-300">
          <div>
            {t('ranked.record', { wins: entry.wins, losses: entry.losses })}
          </div>
          <div className="font-semibold text-emerald-400">
            {t('ranked.winrate', { winrate: computedWinrate })}
          </div>
        </div>
      </div>
    </div>
  );
}

export interface RankedCardsProps {
  solo: LeagueEntryData | null;
  flex: LeagueEntryData | null;
}

export function RankedCards({ solo, flex }: RankedCardsProps) {
  return (
    <div
      data-testid="ranked-cards"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1"
    >
      <SingleRankedCard
        title={t('ranked.soloTitle')}
        entry={solo}
        testId="ranked-card-solo"
      />
      <SingleRankedCard
        title={t('ranked.flexTitle')}
        entry={flex}
        testId="ranked-card-flex"
      />
    </div>
  );
}

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
        <span
          data-testid="searched-riot-id"
          className="font-semibold text-slate-200"
        >
          {riotId}
        </span>{' '}
        —{' '}
        <span
          data-testid="searched-region"
          className="font-semibold uppercase text-indigo-400"
        >
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
