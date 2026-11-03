import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ChampionStatsPanel } from '@/components/ChampionStatsPanel';
import { MatchDetail } from '@/components/MatchDetail';
import {
  aggregateChampionStats,
  csPerMin,
  DEFAULT_SEASON_START_MS,
  kdaRatio,
  killParticipation,
  ParticipantMatchRecord,
} from '@/server/stats/calculators';
import {
  MatchParticipantData,
  MatchSummaryData,
  MatchTeamData,
} from '@/server/db/repository';

function buildChampionRecords(
  names: string[],
  queueId = 420
): ParticipantMatchRecord[] {
  const records: ParticipantMatchRecord[] = [];
  names.forEach((name, idx) => {
    const gamesCount = names.length - idx;
    for (let g = 0; g < gamesCount; g++) {
      records.push({
        championId: 100 + idx,
        championName: name,
        kills: 8,
        deaths: 2,
        assists: 6,
        cs: 210,
        gameDuration: 1800,
        win: g % 2 === 0,
        earlySurrender: false,
        queueId,
        gameStartTimestamp:
          DEFAULT_SEASON_START_MS + (idx * 10 + g + 1) * 60_000,
      });
    }
  });
  return records;
}

export function buildSampleMatchSummary(
  matchId: string,
  overrides: {
    platform?: string;
    queueId?: number;
    gameStartTimestamp?: number;
    gameDuration?: number;
    ownerPuuid?: string;
    ownerChampion?: string;
    ownerKills?: number;
    ownerDeaths?: number;
    ownerAssists?: number;
    ownerWin?: boolean;
    earlySurrender?: boolean;
    ownerDamage?: number;
  } = {}
): MatchSummaryData {
  const platform = overrides.platform ?? 'BR1';
  const queueId = overrides.queueId ?? 420;
  const gameStartTimestamp =
    overrides.gameStartTimestamp ?? DEFAULT_SEASON_START_MS + 500_000;
  const gameDuration = overrides.gameDuration ?? 1800; // 30:00
  const ownerPuuid = overrides.ownerPuuid ?? 'puuid-kami';
  const ownerWin = overrides.ownerWin ?? true;
  const earlySurrender = Boolean(overrides.earlySurrender);

  const teams: MatchTeamData[] = [
    {
      matchId,
      teamId: 100,
      win: ownerWin,
      kills: 25,
      towers: 9,
      dragons: 3,
      barons: 1,
    },
    {
      matchId,
      teamId: 200,
      win: !ownerWin,
      kills: 15,
      towers: 3,
      dragons: 1,
      barons: 0,
    },
  ];

  const participants: MatchParticipantData[] = Array.from(
    { length: 10 },
    (_, idx) => {
      const isBlue = idx < 5;
      const isOwner = idx === 0;
      const puuid = isOwner ? ownerPuuid : `puuid-p-${idx + 1}`;
      const kills = isOwner ? overrides.ownerKills ?? 10 : 3;
      const deaths = isOwner ? overrides.ownerDeaths ?? 2 : 4;
      const assists = isOwner ? overrides.ownerAssists ?? 10 : 5;
      const cs = isOwner ? 240 : 180;
      const teamKills = isBlue ? 25 : 15;
      const damageToChampions = isOwner
        ? overrides.ownerDamage ?? 40000
        : idx === 1
        ? 20000
        : 10000;

      return {
        matchId,
        puuid,
        participantId: idx + 1,
        teamId: isBlue ? 100 : 200,
        riotIdGameName: isOwner ? 'Kami' : `Player${idx + 1}`,
        riotIdTagline: isOwner ? 'BR1' : `TAG${idx + 1}`,
        championId: 100 + idx,
        championName: isOwner
          ? overrides.ownerChampion ?? 'Ahri'
          : `Champ${idx + 1}`,
        champLevel: isOwner ? 18 : 15,
        kills,
        deaths,
        assists,
        kda: kdaRatio(kills, deaths, assists),
        cs,
        csPerMin: csPerMin(cs, gameDuration),
        killParticipation: killParticipation(kills, assists, teamKills),
        goldEarned: isOwner ? 16200 : 11500,
        visionScore: isOwner ? 42 : 25,
        damageToChampions,
        items: [3157, 3020, 3089, 3135, 3165, 0, 3340],
        summoner1Id: 4,
        summoner2Id: 14,
        keystoneId: 8112,
        secondaryStyleId: 8200,
        win: isBlue ? ownerWin : !ownerWin,
        earlySurrender,
        queueId,
        gameStartTimestamp,
      };
    }
  );

  return {
    matchId,
    platform,
    queueId,
    gameStartTimestamp,
    gameDuration,
    gameVersion: '14.22.1',
    owner: participants[0],
    teams,
    participants,
  };
}

describe('ChampionStatsPanel', () => {
  it('CHMP-03 offers Solo/Duo and Flex tabs with Solo/Duo selected by default', () => {
    const soloSummary = aggregateChampionStats(
      buildChampionRecords(['Ahri', 'Orianna'], 420),
      { queue: 'solo' }
    );
    const flexSummary = aggregateChampionStats(
      buildChampionRecords(['LeeSin'], 440),
      { queue: 'flex' }
    );

    render(<ChampionStatsPanel solo={soloSummary} flex={flexSummary} />);

    const soloTab = screen.getByTestId('champion-tab-solo');
    const flexTab = screen.getByTestId('champion-tab-flex');

    expect(soloTab.textContent).toBe('Ranqueada Solo/Duo');
    expect(flexTab.textContent).toBe('Ranqueada Flex');
    expect(soloTab.getAttribute('aria-selected')).toBe('true');
    expect(flexTab.getAttribute('aria-selected')).toBe('false');

    expect(screen.getByTestId('champion-row-Ahri')).toBeTruthy();
    expect(screen.queryByTestId('champion-row-LeeSin')).toBeNull();

    fireEvent.click(flexTab);
    expect(flexTab.getAttribute('aria-selected')).toBe('true');
    expect(soloTab.getAttribute('aria-selected')).toBe('false');
    expect(screen.getByTestId('champion-row-LeeSin')).toBeTruthy();
    expect(screen.queryByTestId('champion-row-Ahri')).toBeNull();
  });

  it('CHMP-06 shows top 7 champions and expands all on Ver todos', () => {
    const nineChamps = [
      'Ahri',
      'Azir',
      'Corki',
      'LeBlanc',
      'Orianna',
      'Syndra',
      'Taliyah',
      'Viktor',
      'Yone',
    ];
    const soloSummary = aggregateChampionStats(
      buildChampionRecords(nineChamps, 420),
      { queue: 'solo' }
    );
    const flexSummary = aggregateChampionStats([], { queue: 'flex' });

    render(<ChampionStatsPanel solo={soloSummary} flex={flexSummary} />);

    const list = screen.getByTestId('champion-stats-list');
    expect(list.querySelectorAll('li')).toHaveLength(7);
    expect(screen.queryByTestId('champion-row-Viktor')).toBeNull();
    expect(screen.queryByTestId('champion-row-Yone')).toBeNull();

    const showAllBtn = screen.getByTestId('champion-show-all');
    expect(showAllBtn.textContent).toBe('Ver todos');

    fireEvent.click(showAllBtn);

    expect(list.querySelectorAll('li')).toHaveLength(9);
    expect(screen.getByTestId('champion-row-Viktor')).toBeTruthy();
    expect(screen.getByTestId('champion-row-Yone')).toBeTruthy();
    expect(screen.queryByTestId('champion-show-all')).toBeNull();
  });

  it('CHMP-07 displays Baseado em N partidas salvas', () => {
    const soloSummary = aggregateChampionStats(
      buildChampionRecords(['Ahri', 'Lux', 'Zed'], 420),
      { queue: 'solo' }
    );
    const flexSummary = aggregateChampionStats([], { queue: 'flex' });

    render(<ChampionStatsPanel solo={soloSummary} flex={flexSummary} />);

    // 3 + 2 + 1 = 6 games
    expect(screen.getByTestId('champion-based-on').textContent).toBe(
      'Baseado em 6 partidas salvas'
    );
  });

  it('CHMP-08 displays Sem partidas ranqueadas nesta temporada when empty', () => {
    const emptySolo = aggregateChampionStats([], { queue: 'solo' });
    const emptyFlex = aggregateChampionStats([], { queue: 'flex' });

    render(<ChampionStatsPanel solo={emptySolo} flex={emptyFlex} />);

    expect(screen.getByTestId('champion-stats-empty').textContent).toBe(
      'Sem partidas ranqueadas nesta temporada'
    );
  });
});

describe('MatchDetail', () => {
  it('MATCH-03 renders all 10 players with full stats and 7 items', () => {
    const match = buildSampleMatchSummary('BR1_100');
    render(<MatchDetail match={match} ownerPuuid="puuid-kami" />);

    for (const p of match.participants) {
      expect(screen.getByTestId(`detail-player-row-${p.puuid}`)).toBeTruthy();
      expect(
        screen.getByTestId(`detail-champ-level-${p.puuid}`).textContent
      ).toBe(String(p.champLevel));
      expect(
        screen.getByTestId(`detail-kda-counts-${p.puuid}`).textContent
      ).toBe(`${p.kills}/${p.deaths}/${p.assists}`);
      expect(screen.getByTestId(`detail-gold-${p.puuid}`).textContent).toBe(
        String(p.goldEarned)
      );
      expect(screen.getByTestId(`detail-vision-${p.puuid}`).textContent).toBe(
        String(p.visionScore)
      );
      expect(screen.getByTestId(`detail-cs-${p.puuid}`).textContent).toContain(
        String(p.cs)
      );

      for (let slot = 0; slot < 7; slot++) {
        expect(
          screen.getByTestId(`detail-item-slot-${p.puuid}-${slot}`)
        ).toBeTruthy();
      }
    }
  });

  it('MATCH-04 renders damage bar proportional to max damage in match', () => {
    const match = buildSampleMatchSummary('BR1_100', { ownerDamage: 40000 });
    render(<MatchDetail match={match} ownerPuuid="puuid-kami" />);

    const ownerBar = screen.getByTestId('detail-damage-bar-puuid-kami');
    const secondBar = screen.getByTestId('detail-damage-bar-puuid-p-2');
    const thirdBar = screen.getByTestId('detail-damage-bar-puuid-p-3');

    expect(ownerBar.style.width).toBe('100%');
    expect(secondBar.style.width).toBe('50%'); // 20000 / 40000
    expect(thirdBar.style.width).toBe('25%'); // 10000 / 40000
  });

  it('MATCH-05 displays team result, kills, towers, dragons and barons', () => {
    const match = buildSampleMatchSummary('BR1_100', { ownerWin: true });
    render(<MatchDetail match={match} ownerPuuid="puuid-kami" />);

    expect(screen.getByTestId('team-result-100').textContent).toBe('Vitória');
    const blueObj = screen.getByTestId('team-objectives-100').textContent;
    expect(blueObj).toContain('Abates: 25');
    expect(blueObj).toContain('Torres: 9');
    expect(blueObj).toContain('Dragões: 3');
    expect(blueObj).toContain('Barões: 1');

    expect(screen.getByTestId('team-result-200').textContent).toBe('Derrota');
    const redObj = screen.getByTestId('team-objectives-200').textContent;
    expect(redObj).toContain('Abates: 15');
    expect(redObj).toContain('Torres: 3');
    expect(redObj).toContain('Dragões: 1');
    expect(redObj).toContain('Barões: 0');
  });

  it('MATCH-06 highlights the profile owner row', () => {
    const match = buildSampleMatchSummary('BR1_100');
    render(<MatchDetail match={match} ownerPuuid="puuid-kami" />);

    const ownerRow = screen.getByTestId('detail-player-row-puuid-kami');
    const otherRow = screen.getByTestId('detail-player-row-puuid-p-2');

    expect(ownerRow.getAttribute('data-owner')).toBe('true');
    expect(ownerRow.className).toContain('bg-indigo-950/60');
    expect(otherRow.getAttribute('data-owner')).toBe('false');
  });

  it('MATCH-07 links each participant Riot ID to their profile in the same region', () => {
    const match = buildSampleMatchSummary('BR1_100', { platform: 'KR' });
    render(<MatchDetail match={match} ownerPuuid="puuid-kami" />);

    const link2 = screen.getByTestId(
      'detail-player-link-puuid-p-2'
    ) as HTMLAnchorElement;
    expect(link2.getAttribute('href')).toBe('/kr/summoner/Player2-TAG2');
  });

  it('MATCH-08 opens match detail using saved data with zero network calls', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const match = buildSampleMatchSummary('BR1_100');
    render(<MatchDetail match={match} ownerPuuid="puuid-kami" />);

    expect(screen.getByTestId('match-detail-BR1_100')).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
