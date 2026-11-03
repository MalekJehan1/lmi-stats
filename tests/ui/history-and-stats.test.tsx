import React from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ChampionStatsPanel } from '@/components/ChampionStatsPanel';
import {
  aggregateChampionStats,
  DEFAULT_SEASON_START_MS,
  ParticipantMatchRecord,
} from '@/server/stats/calculators';

function buildChampionRecords(names: string[], queueId = 420): ParticipantMatchRecord[] {
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
        gameStartTimestamp: DEFAULT_SEASON_START_MS + (idx * 10 + g + 1) * 60_000,
      });
    }
  });
  return records;
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
