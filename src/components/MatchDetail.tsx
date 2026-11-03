'use client';

import React from 'react';
import { t } from '@/i18n';
import {
  MatchParticipantData,
  MatchSummaryData,
  MatchTeamData,
} from '@/server/db/repository';
import {
  championImg,
  itemImg,
  runeImg,
  spellImg,
} from '@/server/riot/ddragon';
import { buildSummonerUrl } from '@/server/riot/riot-id';
import { formatKdaRatio, isRemake } from '@/server/stats/calculators';

export interface MatchDetailProps {
  match: MatchSummaryData;
  ownerPuuid: string;
}

function TeamSection({
  team,
  participants,
  maxDamage,
  ownerPuuid,
  platform,
  earlySurrender,
}: {
  team: MatchTeamData;
  participants: MatchParticipantData[];
  maxDamage: number;
  ownerPuuid: string;
  platform: string;
  earlySurrender: boolean;
}) {
  const isBlue = team.teamId === 100;
  const teamLabel = isBlue ? t('detail.blueTeam') : t('detail.redTeam');
  const resultLabel = earlySurrender
    ? t('history.remake')
    : team.win
    ? t('history.victory')
    : t('history.defeat');

  return (
    <div
      data-testid={`match-team-${team.teamId}`}
      className="rounded-lg border border-slate-800 bg-slate-950/80 overflow-hidden"
    >
      <div
        data-testid={`match-team-header-${team.teamId}`}
        className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs font-semibold ${
          earlySurrender
            ? 'bg-slate-800/70 text-slate-300'
            : team.win
            ? 'bg-emerald-950/60 text-emerald-300'
            : 'bg-rose-950/60 text-rose-300'
        }`}
      >
        <div className="flex items-center gap-2">
          <span data-testid={`team-result-${team.teamId}`}>{resultLabel}</span>
          <span className="text-slate-400">({teamLabel})</span>
        </div>

        <div
          data-testid={`team-objectives-${team.teamId}`}
          className="flex flex-wrap items-center gap-3 text-[11px] text-slate-300"
        >
          <span>
            {t('detail.kills')}: <strong>{team.kills}</strong>
          </span>
          <span>
            {t('detail.towers')}: <strong>{team.towers}</strong>
          </span>
          <span>
            {t('detail.dragons')}: <strong>{team.dragons}</strong>
          </span>
          <span>
            {t('detail.barons')}: <strong>{team.barons}</strong>
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-xs">
          <thead>
            <tr className="border-b border-slate-800/80 text-[11px] text-slate-400">
              <th className="py-1.5 pl-3 pr-2 font-medium">{teamLabel}</th>
              <th className="px-2 py-1.5 font-medium">KDA</th>
              <th className="px-2 py-1.5 font-medium">{t('detail.damage')}</th>
              <th className="px-2 py-1.5 font-medium">{t('detail.gold')}</th>
              <th className="px-2 py-1.5 font-medium">{t('detail.cs')}</th>
              <th className="px-2 py-1.5 font-medium">{t('detail.vision')}</th>
              <th className="py-1.5 pl-2 pr-3 font-medium">
                {t('detail.items')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {participants.map((p) => {
              const isOwner = p.puuid === ownerPuuid;
              const champUrl = championImg(p.championName);
              const spell1Url = spellImg(p.summoner1Id);
              const spell2Url = spellImg(p.summoner2Id);
              const keystoneUrl = runeImg(p.keystoneId);
              const secondaryUrl = runeImg(p.secondaryStyleId);
              const damagePct =
                maxDamage > 0
                  ? Math.round((p.damageToChampions / maxDamage) * 100)
                  : 0;
              const kdaText = formatKdaRatio(p.kills, p.deaths, p.assists);
              const profileHref = buildSummonerUrl(
                platform,
                p.riotIdGameName,
                p.riotIdTagline
              );
              const paddedItems = Array.from(
                { length: 7 },
                (_, idx) => p.items[idx] ?? 0
              );

              return (
                <tr
                  key={`${p.matchId}-${p.participantId}`}
                  data-testid={`detail-player-row-${p.puuid}`}
                  data-owner={isOwner ? 'true' : 'false'}
                  className={
                    isOwner
                      ? 'bg-indigo-950/60 font-semibold ring-1 ring-inset ring-indigo-500/40'
                      : 'hover:bg-slate-900/60'
                  }
                >
                  <td className="py-2 pl-3 pr-2">
                    <div className="flex items-center gap-2">
                      <div className="relative h-8 w-8 shrink-0">
                        {champUrl ? (
                          <img
                            src={champUrl}
                            alt={p.championName}
                            className="h-8 w-8 rounded-full object-cover"
                          />
                        ) : (
                          <div className="h-8 w-8 rounded-full bg-slate-800" />
                        )}
                        <span
                          data-testid={`detail-champ-level-${p.puuid}`}
                          className="absolute -bottom-1 -right-1 rounded bg-slate-950 px-1 text-[10px] font-bold text-slate-200 border border-slate-700"
                        >
                          {p.champLevel}
                        </span>
                      </div>

                      <div
                        data-testid={`detail-spells-runes-${p.puuid}`}
                        className="grid grid-cols-2 gap-0.5 shrink-0"
                      >
                        {spell1Url ? (
                          <img
                            src={spell1Url}
                            alt={`Spell ${p.summoner1Id}`}
                            className="h-3.5 w-3.5 rounded-sm"
                          />
                        ) : (
                          <span
                            data-spell-id={p.summoner1Id}
                            className="h-3.5 w-3.5 rounded-sm bg-slate-800 inline-block"
                          />
                        )}
                        {keystoneUrl ? (
                          <img
                            src={keystoneUrl}
                            alt={`Keystone ${p.keystoneId}`}
                            className="h-3.5 w-3.5 rounded-full"
                          />
                        ) : (
                          <span
                            data-keystone-id={p.keystoneId}
                            className="h-3.5 w-3.5 rounded-full bg-slate-800 inline-block"
                          />
                        )}
                        {spell2Url ? (
                          <img
                            src={spell2Url}
                            alt={`Spell ${p.summoner2Id}`}
                            className="h-3.5 w-3.5 rounded-sm"
                          />
                        ) : (
                          <span
                            data-spell-id={p.summoner2Id}
                            className="h-3.5 w-3.5 rounded-sm bg-slate-800 inline-block"
                          />
                        )}
                        {secondaryUrl ? (
                          <img
                            src={secondaryUrl}
                            alt={`Rune style ${p.secondaryStyleId}`}
                            className="h-3.5 w-3.5 rounded-full"
                          />
                        ) : (
                          <span
                            data-style-id={p.secondaryStyleId}
                            className="h-3.5 w-3.5 rounded-full bg-slate-800 inline-block"
                          />
                        )}
                      </div>

                      <div className="min-w-0">
                        <a
                          href={profileHref}
                          data-testid={`detail-player-link-${p.puuid}`}
                          className="block truncate text-slate-100 hover:text-indigo-400 hover:underline"
                        >
                          {p.riotIdGameName}#{p.riotIdTagline}
                        </a>
                        <span className="text-[10px] text-slate-400">
                          {p.championName}
                        </span>
                      </div>
                    </div>
                  </td>

                  <td className="px-2 py-2 whitespace-nowrap">
                    <div
                      data-testid={`detail-kda-counts-${p.puuid}`}
                      className="text-slate-200"
                    >
                      {p.kills}/{p.deaths}/{p.assists}
                    </div>
                    <div
                      data-testid={`detail-kda-ratio-${p.puuid}`}
                      className="text-[11px] text-slate-400"
                    >
                      {kdaText === 'Perfeito' ? 'Perfeito' : `${kdaText} KDA`}
                    </div>
                  </td>

                  <td className="px-2 py-2">
                    <div className="w-24">
                      <div
                        data-testid={`detail-damage-value-${p.puuid}`}
                        className="text-[11px] text-slate-200"
                      >
                        {p.damageToChampions}
                      </div>
                      <div className="mt-1 h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                        <div
                          data-testid={`detail-damage-bar-${p.puuid}`}
                          style={{ width: `${damagePct}%` }}
                          className="h-full bg-rose-500"
                        />
                      </div>
                    </div>
                  </td>

                  <td
                    data-testid={`detail-gold-${p.puuid}`}
                    className="px-2 py-2 whitespace-nowrap text-slate-300"
                  >
                    {p.goldEarned}
                  </td>

                  <td
                    data-testid={`detail-cs-${p.puuid}`}
                    className="px-2 py-2 whitespace-nowrap text-slate-300"
                  >
                    {p.cs} ({p.csPerMin.toFixed(1)}/m)
                  </td>

                  <td
                    data-testid={`detail-vision-${p.puuid}`}
                    className="px-2 py-2 whitespace-nowrap text-slate-300"
                  >
                    {p.visionScore}
                  </td>

                  <td className="py-2 pl-2 pr-3">
                    <div
                      data-testid={`detail-items-${p.puuid}`}
                      className="flex items-center gap-1"
                    >
                      {paddedItems.map((itemId, slotIdx) => {
                        const url = itemImg(itemId);
                        return (
                          <div
                            key={slotIdx}
                            data-testid={`detail-item-slot-${p.puuid}-${slotIdx}`}
                            data-item-id={itemId}
                            className="h-5 w-5 rounded bg-slate-800 border border-slate-700/80 overflow-hidden shrink-0"
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
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function MatchDetail({ match, ownerPuuid }: MatchDetailProps) {
  const maxDamage = match.participants.reduce(
    (max, p) => Math.max(max, p.damageToChampions),
    0
  );
  const earlySurrender = isRemake(match.owner);

  const blueTeam: MatchTeamData = match.teams.find((t) => t.teamId === 100) ?? {
    matchId: match.matchId,
    teamId: 100,
    win: true,
    kills: 0,
    towers: 0,
    dragons: 0,
    barons: 0,
  };
  const redTeam: MatchTeamData = match.teams.find((t) => t.teamId === 200) ?? {
    matchId: match.matchId,
    teamId: 200,
    win: false,
    kills: 0,
    towers: 0,
    dragons: 0,
    barons: 0,
  };

  const blueParticipants = match.participants.filter((p) => p.teamId === 100);
  const redParticipants = match.participants.filter((p) => p.teamId === 200);

  return (
    <div
      data-testid={`match-detail-${match.matchId}`}
      className="mt-2 flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/95 p-3"
    >
      <TeamSection
        team={blueTeam}
        participants={blueParticipants}
        maxDamage={maxDamage}
        ownerPuuid={ownerPuuid}
        platform={match.platform}
        earlySurrender={earlySurrender}
      />
      <TeamSection
        team={redTeam}
        participants={redParticipants}
        maxDamage={maxDamage}
        ownerPuuid={ownerPuuid}
        platform={match.platform}
        earlySurrender={earlySurrender}
      />
    </div>
  );
}
