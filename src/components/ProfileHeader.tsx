'use client';

import React, { useEffect, useState } from 'react';
import { formatRelativeTime, t } from '@/i18n';
import { LeagueEntryData, SummonerProfileData } from '@/server/db/repository';
import { profileIconImg } from '@/server/riot/ddragon';
import { winrate } from '@/server/stats/calculators';
import { getCooldownRemainingSeconds } from '@/server/sync/guards';

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
