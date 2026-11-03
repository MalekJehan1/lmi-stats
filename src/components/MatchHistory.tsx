'use client';

import React, { useEffect, useState } from 'react';
import { formatRelativeTime, getQueueName, t, TranslationKey } from '@/i18n';
import { MatchSummaryData } from '@/server/db/repository';
import {
  championImg,
  itemImg,
  runeImg,
  spellImg,
} from '@/server/riot/ddragon';
import {
  DEFAULT_QUEUE_TAB,
  filterMatchesByTab,
  formatDurationMmSs,
  formatKdaRatio,
  isRemake,
  matchResultLabel,
  QUEUE_TAB_LIST,
  QueueTab,
} from '@/server/stats/calculators';
import { MatchDetail } from './MatchDetail';

const TAB_LABEL_KEYS: Record<QueueTab, TranslationKey> = {
  all: 'tabs.all',
  solo: 'tabs.solo',
  flex: 'tabs.flex',
  normal: 'tabs.normal',
  aram: 'tabs.aram',
};

export interface MatchHistoryProps {
  platform: string;
  puuid: string;
  initialMatches: MatchSummaryData[];
  initialHasMore?: boolean;
  defaultTab?: QueueTab;
  nowMs?: number;
}

export function MatchHistory({
  platform,
  puuid,
  initialMatches,
  initialHasMore,
  defaultTab = DEFAULT_QUEUE_TAB,
  nowMs,
}: MatchHistoryProps) {
  const [activeTab, setActiveTab] = useState<QueueTab>(defaultTab);
  const [allMatches, setAllMatches] = useState<MatchSummaryData[]>(() =>
    [...initialMatches].sort(
      (a, b) => b.gameStartTimestamp - a.gameStartTimestamp
    )
  );
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [loadingMore, setLoadingMore] = useState(false);
  const [exhaustedTabs, setExhaustedTabs] = useState<Record<QueueTab, boolean>>(
    () => ({
      all:
        initialHasMore !== undefined
          ? !initialHasMore
          : initialMatches.length < 20,
      solo: false,
      flex: false,
      normal: false,
      aram: false,
    })
  );
  const [visibleLimitByTab, setVisibleLimitByTab] = useState<
    Record<QueueTab, number>
  >({
    all: 20,
    solo: 20,
    flex: 20,
    normal: 20,
    aram: 20,
  });

  useEffect(() => {
    const sorted = [...initialMatches].sort(
      (a, b) => b.gameStartTimestamp - a.gameStartTimestamp
    );
    setAllMatches(sorted);
    setExhaustedTabs((prev) => ({
      ...prev,
      all:
        initialHasMore !== undefined
          ? !initialHasMore
          : sorted.length < 20,
    }));
  }, [initialMatches, initialHasMore]);

  const tabMatchesAll = filterMatchesByTab(allMatches, activeTab).sort(
    (a, b) => b.gameStartTimestamp - a.gameStartTimestamp
  );
  const currentLimit = visibleLimitByTab[activeTab] ?? 20;
  const visibleMatches = tabMatchesAll.slice(0, currentLimit);

  const hasMoreForTab =
    !exhaustedTabs[activeTab] &&
    (tabMatchesAll.length > currentLimit ||
      (visibleMatches.length >= 20 && visibleMatches.length % 20 === 0));

  const toggleExpand = (matchId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(matchId)) {
        next.delete(matchId);
      } else {
        next.add(matchId);
      }
      return next;
    });
  };

  const handleLoadMore = async () => {
    if (loadingMore) return;
    const nextLimit = currentLimit + 20;

    if (tabMatchesAll.length >= nextLimit) {
      setVisibleLimitByTab((prev) => ({
        ...prev,
        [activeTab]: nextLimit,
      }));
      return;
    }

    setLoadingMore(true);
    try {
      const oldestVisible =
        visibleMatches[visibleMatches.length - 1] ??
        tabMatchesAll[tabMatchesAll.length - 1];
      const cursorParam = oldestVisible
        ? `&cursor=${oldestVisible.gameStartTimestamp}`
        : '&loadMore=1';
      const res = await fetch(
        `/api/summoners/${encodeURIComponent(platform)}/${encodeURIComponent(puuid)}/matches?tab=${encodeURIComponent(activeTab)}${cursorParam}`
      );
      if (res.ok) {
        const data = await res.json();
        const incoming: MatchSummaryData[] = Array.isArray(data.matches)
          ? data.matches
          : [];
        setAllMatches((prev) => {
          const map = new Map<string, MatchSummaryData>();
          for (const m of prev) map.set(m.matchId, m);
          for (const m of incoming) map.set(m.matchId, m);
          return Array.from(map.values()).sort(
            (a, b) => b.gameStartTimestamp - a.gameStartTimestamp
          );
        });
        setVisibleLimitByTab((prev) => ({
          ...prev,
          [activeTab]: nextLimit,
        }));
        if (!data.hasMore || incoming.length < 20) {
          setExhaustedTabs((prev) => ({
            ...prev,
            [activeTab]: true,
          }));
        }
      } else {
        setExhaustedTabs((prev) => ({
          ...prev,
          [activeTab]: true,
        }));
      }
    } catch {
      setExhaustedTabs((prev) => ({
        ...prev,
        [activeTab]: true,
      }));
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <section
      data-testid="match-history"
      className="flex flex-col gap-3"
    >
      <div
        role="tablist"
        aria-label="Filas do histórico"
        className="flex flex-wrap gap-1.5 rounded-xl border border-slate-800 bg-slate-900/90 p-1.5"
      >
        {QUEUE_TAB_LIST.map((tab) => {
          const isSelected = activeTab === tab;
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              data-testid={`history-tab-${tab}`}
              aria-selected={isSelected}
              onClick={() => setActiveTab(tab)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                isSelected
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              {t(TAB_LABEL_KEYS[tab])}
            </button>
          );
        })}
      </div>

      {visibleMatches.length === 0 ? (
        <div
          data-testid="history-empty"
          className="rounded-xl border border-slate-800 bg-slate-900/90 p-8 text-center text-sm text-slate-400"
        >
          {t('history.empty')}
        </div>
      ) : (
        <div data-testid="match-history-list" className="flex flex-col gap-2.5">
          {visibleMatches.map((match) => {
            const owner = match.owner;
            const remake = isRemake(owner);
            const resultText = matchResultLabel(owner);
            const queueName = getQueueName(match.queueId);
            const endTimestampMs =
              match.gameStartTimestamp + match.gameDuration * 1000;
            const endedAgo = formatRelativeTime(
              endTimestampMs,
              nowMs ?? Date.now()
            );
            const durationStr = formatDurationMmSs(match.gameDuration);
            const kdaStr = formatKdaRatio(
              owner.kills,
              owner.deaths,
              owner.assists
            );
            const champUrl = championImg(owner.championName);
            const spell1Url = spellImg(owner.summoner1Id);
            const spell2Url = spellImg(owner.summoner2Id);
            const keystoneUrl = runeImg(owner.keystoneId);
            const secondaryUrl = runeImg(owner.secondaryStyleId);
            const paddedItems = Array.from(
              { length: 7 },
              (_, idx) => owner.items[idx] ?? 0
            );
            const isExpanded = expandedIds.has(match.matchId);

            const cardAccent = remake
              ? 'border-l-4 border-l-slate-500 border-slate-800 bg-slate-900/80'
              : owner.win
              ? 'border-l-4 border-l-emerald-500 border-slate-800 bg-emerald-950/20'
              : 'border-l-4 border-l-rose-500 border-slate-800 bg-rose-950/20';

            const badgeClass = remake
              ? 'bg-slate-700/80 text-slate-200'
              : owner.win
              ? 'bg-emerald-500/20 text-emerald-300'
              : 'bg-rose-500/20 text-rose-300';

            return (
              <div
                key={match.matchId}
                data-testid={`match-card-${match.matchId}`}
                data-match-id={match.matchId}
              >
                <div
                  role="button"
                  tabIndex={0}
                  aria-expanded={isExpanded}
                  data-testid={`match-row-${match.matchId}`}
                  onClick={() => toggleExpand(match.matchId)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleExpand(match.matchId);
                    }
                  }}
                  className={`flex cursor-pointer flex-wrap items-center justify-between gap-3 rounded-xl border p-3.5 transition hover:brightness-110 ${cardAccent}`}
                >
                  {/* Queue, Result & Duration */}
                  <div className="flex w-28 flex-col gap-0.5 text-xs">
                    <span
                      data-testid={`match-queue-${match.matchId}`}
                      className="font-bold text-slate-200 truncate"
                    >
                      {queueName}
                    </span>
                    <span
                      data-testid={`match-ended-ago-${match.matchId}`}
                      className="text-[11px] text-slate-400"
                    >
                      {endedAgo}
                    </span>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span
                        data-testid={`match-result-${match.matchId}`}
                        data-remake={remake ? 'true' : 'false'}
                        className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${badgeClass}`}
                      >
                        {resultText}
                      </span>
                      <span
                        data-testid={`match-duration-${match.matchId}`}
                        className="text-[11px] text-slate-400"
                      >
                        {durationStr}
                      </span>
                    </div>
                  </div>

                  {/* Champion, Level, Spells & Runes */}
                  <div className="flex items-center gap-2.5">
                    <div className="relative h-12 w-12 shrink-0">
                      {champUrl ? (
                        <img
                          src={champUrl}
                          alt={owner.championName}
                          data-testid={`match-champ-img-${match.matchId}`}
                          className="h-12 w-12 rounded-full border border-slate-700 object-cover"
                        />
                      ) : (
                        <div className="h-12 w-12 rounded-full border border-slate-700 bg-slate-800" />
                      )}
                      <span
                        data-testid={`match-champ-level-${match.matchId}`}
                        className="absolute -bottom-1 -right-1 rounded-full border border-slate-700 bg-slate-950 px-1.5 py-0.2 text-[10px] font-bold text-slate-100"
                      >
                        {owner.champLevel}
                      </span>
                    </div>

                    <div
                      data-testid={`match-spells-runes-${match.matchId}`}
                      className="grid grid-cols-2 gap-1"
                    >
                      {spell1Url ? (
                        <img
                          src={spell1Url}
                          alt={`Spell ${owner.summoner1Id}`}
                          data-testid={`match-spell1-${match.matchId}`}
                          className="h-5 w-5 rounded"
                        />
                      ) : (
                        <span
                          data-testid={`match-spell1-${match.matchId}`}
                          className="h-5 w-5 rounded bg-slate-800 inline-block"
                        />
                      )}
                      {keystoneUrl ? (
                        <img
                          src={keystoneUrl}
                          alt={`Keystone ${owner.keystoneId}`}
                          data-testid={`match-keystone-${match.matchId}`}
                          className="h-5 w-5 rounded-full"
                        />
                      ) : (
                        <span
                          data-testid={`match-keystone-${match.matchId}`}
                          className="h-5 w-5 rounded-full bg-slate-800 inline-block"
                        />
                      )}
                      {spell2Url ? (
                        <img
                          src={spell2Url}
                          alt={`Spell ${owner.summoner2Id}`}
                          data-testid={`match-spell2-${match.matchId}`}
                          className="h-5 w-5 rounded"
                        />
                      ) : (
                        <span
                          data-testid={`match-spell2-${match.matchId}`}
                          className="h-5 w-5 rounded bg-slate-800 inline-block"
                        />
                      )}
                      {secondaryUrl ? (
                        <img
                          src={secondaryUrl}
                          alt={`Secondary ${owner.secondaryStyleId}`}
                          data-testid={`match-secondary-rune-${match.matchId}`}
                          className="h-5 w-5 rounded-full"
                        />
                      ) : (
                        <span
                          data-testid={`match-secondary-rune-${match.matchId}`}
                          className="h-5 w-5 rounded-full bg-slate-800 inline-block"
                        />
                      )}
                    </div>

                    <div className="hidden sm:block text-xs font-semibold text-slate-200">
                      {owner.championName}
                    </div>
                  </div>

                  {/* K/D/A & KDA Ratio */}
                  <div className="flex flex-col items-center text-xs">
                    <div
                      data-testid={`match-kda-counts-${match.matchId}`}
                      className="text-sm font-bold text-slate-100"
                    >
                      {owner.kills} /{' '}
                      <span className="text-rose-400">{owner.deaths}</span> /{' '}
                      {owner.assists}
                    </div>
                    <div
                      data-testid={`match-kda-ratio-${match.matchId}`}
                      className="text-[11px] font-semibold text-indigo-300"
                    >
                      {kdaStr === 'Perfeito' ? 'Perfeito' : `${kdaStr} KDA`}
                    </div>
                  </div>

                  {/* CS, CS/min & Kill Participation */}
                  <div className="flex flex-col text-right text-xs text-slate-300">
                    <div data-testid={`match-kp-${match.matchId}`}>
                      {t('history.killParticipation', {
                        kp: owner.killParticipation,
                      })}
                    </div>
                    <div data-testid={`match-cs-${match.matchId}`}>
                      CS {owner.cs} ({owner.csPerMin.toFixed(1)}/min)
                    </div>
                  </div>

                  {/* 7 Item Slots */}
                  <div
                    data-testid={`match-items-${match.matchId}`}
                    className="flex items-center gap-1"
                  >
                    {paddedItems.map((itemId, slotIdx) => {
                      const url = itemImg(itemId);
                      return (
                        <div
                          key={slotIdx}
                          data-testid={`match-item-slot-${match.matchId}-${slotIdx}`}
                          data-item-id={itemId}
                          className="h-7 w-7 rounded bg-slate-800/90 border border-slate-700 overflow-hidden shrink-0"
                        >
                          {url ? (
                            <img
                              src={url}
                              alt={`Item ${itemId}`}
                              className="h-full w-full object-cover"
                            />
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {isExpanded && (
                  <MatchDetail match={match} ownerPuuid={puuid} />
                )}
              </div>
            );
          })}
        </div>
      )}

      {hasMoreForTab && visibleMatches.length > 0 && (
        <button
          type="button"
          data-testid="history-load-more"
          disabled={loadingMore}
          onClick={handleLoadMore}
          className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-900 py-3 text-xs font-bold text-slate-200 transition hover:bg-slate-800 disabled:opacity-50"
        >
          {loadingMore ? t('history.loadingMore') : t('history.loadMore')}
        </button>
      )}
    </section>
  );
}
