'use client';

import React, { useState } from 'react';
import { t } from '@/i18n';
import { championImg } from '@/server/riot/ddragon';
import {
  ChampionStatsSummary,
  DEFAULT_RANKED_TAB,
  RankedQueueTab,
} from '@/server/stats/calculators';

export interface ChampionStatsPanelProps {
  solo: ChampionStatsSummary;
  flex: ChampionStatsSummary;
  defaultTab?: RankedQueueTab;
}

export function ChampionStatsPanel({
  solo,
  flex,
  defaultTab = DEFAULT_RANKED_TAB,
}: ChampionStatsPanelProps) {
  const [activeTab, setActiveTab] = useState<RankedQueueTab>(defaultTab);
  const [expandedByTab, setExpandedByTab] = useState<
    Record<RankedQueueTab, boolean>
  >({
    solo: false,
    flex: false,
  });

  const currentSummary = activeTab === 'solo' ? solo : flex;
  const isExpanded = expandedByTab[activeTab];
  const championsToShow = isExpanded
    ? currentSummary.champions
    : currentSummary.champions.slice(0, 7);
  const showExpandButton =
    !isExpanded && currentSummary.champions.length > 7;

  return (
    <section
      data-testid="champion-stats-panel"
      className="flex flex-col rounded-xl border border-slate-800 bg-slate-900/90 p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-slate-100">
          {t('champions.title')}
        </h2>
      </div>

      <div
        role="tablist"
        aria-label={t('champions.title')}
        className="mt-3 grid grid-cols-2 gap-1 rounded-lg bg-slate-950 p-1"
      >
        <button
          type="button"
          role="tab"
          data-testid="champion-tab-solo"
          aria-selected={activeTab === 'solo'}
          onClick={() => setActiveTab('solo')}
          className={`rounded-md py-1.5 text-xs font-semibold transition ${
            activeTab === 'solo'
              ? 'bg-indigo-600 text-white'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {t('ranked.soloTitle')}
        </button>
        <button
          type="button"
          role="tab"
          data-testid="champion-tab-flex"
          aria-selected={activeTab === 'flex'}
          onClick={() => setActiveTab('flex')}
          className={`rounded-md py-1.5 text-xs font-semibold transition ${
            activeTab === 'flex'
              ? 'bg-indigo-600 text-white'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {t('ranked.flexTitle')}
        </button>
      </div>

      {currentSummary.isEmpty || currentSummary.champions.length === 0 ? (
        <div
          data-testid="champion-stats-empty"
          className="my-6 text-center text-xs text-slate-400"
        >
          {t('champions.empty')}
        </div>
      ) : (
        <>
          <ul
            data-testid="champion-stats-list"
            className="mt-3 divide-y divide-slate-800/80"
          >
            {championsToShow.map((champ) => {
              const imgUrl = championImg(champ.championName);
              const kdaText =
                champ.kda === 'perfect'
                  ? t('history.perfectKda')
                  : `${champ.kda.toFixed(2)} KDA`;

              return (
                <li
                  key={champ.championName}
                  data-testid={`champion-row-${champ.championName}`}
                  className="flex items-center justify-between gap-2 py-2.5 text-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {imgUrl ? (
                      <img
                        src={imgUrl}
                        alt={champ.championName}
                        className="h-8 w-8 shrink-0 rounded-full border border-slate-700 object-cover"
                      />
                    ) : (
                      <div className="h-8 w-8 shrink-0 rounded-full border border-slate-700 bg-slate-800" />
                    )}
                    <div className="truncate">
                      <div className="font-semibold text-slate-100 truncate">
                        {champ.championName}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        CS {champ.csPerMin.toFixed(1)}/min
                      </div>
                    </div>
                  </div>

                  <div className="text-center">
                    <div className="font-semibold text-slate-200">
                      {kdaText}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {champ.avgKills.toFixed(1)} / {champ.avgDeaths.toFixed(1)}{' '}
                      / {champ.avgAssists.toFixed(1)}
                    </div>
                  </div>

                  <div className="text-right">
                    <div
                      className={`font-bold ${
                        champ.winrate >= 60
                          ? 'text-emerald-400'
                          : 'text-slate-200'
                      }`}
                    >
                      {champ.winrate}%
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {t('champions.games', { games: champ.games })} (
                      {champ.wins}V {champ.losses}D)
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {showExpandButton && (
            <button
              type="button"
              data-testid="champion-show-all"
              onClick={() =>
                setExpandedByTab((prev) => ({
                  ...prev,
                  [activeTab]: true,
                }))
              }
              className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-800/70 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-800"
            >
              {t('champions.showAll')}
            </button>
          )}

          <p
            data-testid="champion-based-on"
            className="mt-3 text-right text-[11px] text-slate-400"
          >
            {t('champions.basedOnMatches', {
              count: currentSummary.totalGames,
            })}
          </p>
        </>
      )}
    </section>
  );
}
