import React, { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Footer, Header, SearchBar } from '@/components/SearchBar';
import {
  ProfileHeader,
  RankedCards,
  RefreshButton,
} from '@/components/ProfileHeader';
import { PLATFORMS } from '@/server/riot/routing';
import { metadata } from '@/app/layout';
import { SummonerProfileData } from '@/server/db/repository';

function createSampleProfile(
  overrides: Partial<SummonerProfileData> = {}
): SummonerProfileData {
  return {
    summoner: {
      puuid: 'puuid-kami',
      platform: 'BR1',
      gameName: 'Kami',
      tagLine: 'BR1',
      slug: 'Kami-BR1',
      profileIconId: 29,
      summonerLevel: 412,
      lastUpdatedAt: new Date(1_750_000_000_000 - 5 * 60_000).toISOString(),
    },
    leagues: {
      solo: {
        puuid: 'puuid-kami',
        platform: 'BR1',
        queueType: 'RANKED_SOLO_5x5',
        tier: 'CHALLENGER',
        rank: 'I',
        leaguePoints: 1125,
        wins: 120,
        losses: 80,
        winrate: 60,
      },
      flex: {
        puuid: 'puuid-kami',
        platform: 'BR1',
        queueType: 'RANKED_FLEX_SR',
        tier: 'DIAMOND',
        rank: 'II',
        leaguePoints: 74,
        wins: 20,
        losses: 10,
        winrate: 67,
      },
    },
    matches: [],
    nextCursor: null,
    hasMoreMatches: false,
    championStats: {
      solo: {
        champions: [],
        visibleChampions: [],
        hasMore: false,
        totalGames: 0,
        isEmpty: true,
      },
      flex: {
        champions: [],
        visibleChampions: [],
        hasMore: false,
        totalGames: 0,
        isEmpty: true,
      },
    },
    ...overrides,
  };
}

describe('SearchBar and navigation', () => {
  it('SRCH-01 navigates to /{platform}/summoner/{gameName}-{tagLine}', () => {
    const navigatedUrls: string[] = [];
    render(
      <SearchBar
        onNavigate={(url) => {
          navigatedUrls.push(url);
        }}
      />
    );

    const select = screen.getByTestId('region-select') as HTMLSelectElement;
    expect(select.value).toBe('BR1');
    const options = Array.from(select.querySelectorAll('option')).map(
      (o) => o.value
    );
    expect(options).toEqual([...PLATFORMS]);

    const input = screen.getByTestId('riot-id-input');
    fireEvent.change(select, { target: { value: 'KR' } });
    fireEvent.change(input, { target: { value: 'Hide on bush#KR1' } });
    fireEvent.submit(screen.getByTestId('search-form'));

    expect(navigatedUrls).toEqual(['/kr/summoner/Hide%20on%20bush-KR1']);
    expect(screen.queryByTestId('search-error')).toBeNull();
  });

  it('SRCH-03 shows validation message without calling Riot API', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const navigatedUrls: string[] = [];
    render(
      <SearchBar
        onNavigate={(url) => {
          navigatedUrls.push(url);
        }}
      />
    );

    const input = screen.getByTestId('riot-id-input');

    // Missing '#'
    fireEvent.change(input, { target: { value: 'InvalidNameOnly' } });
    fireEvent.click(screen.getByTestId('search-submit'));

    expect(screen.getByTestId('search-error').textContent).toBe(
      'Digite o Riot ID no formato Nome#TAG'
    );
    expect(navigatedUrls).toHaveLength(0);
    expect(fetchSpy).not.toHaveBeenCalled();

    // Name too short (<3 chars)
    fireEvent.change(input, { target: { value: 'ab#BR1' } });
    fireEvent.submit(screen.getByTestId('search-form'));
    expect(screen.getByTestId('search-error').textContent).toBe(
      'Digite o Riot ID no formato Nome#TAG'
    );

    // Tag too long (>5 chars)
    fireEvent.change(input, { target: { value: 'ValidName#TAGTOO' } });
    fireEvent.submit(screen.getByTestId('search-form'));
    expect(screen.getByTestId('search-error').textContent).toBe(
      'Digite o Riot ID no formato Nome#TAG'
    );
    expect(navigatedUrls).toHaveLength(0);
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });
});

describe('Branding and Legal', () => {
  it('LEGAL-01 renders exact Riot legal disclaimer in footer', () => {
    render(<Footer />);
    const disclaimer = screen.getByTestId('legal-disclaimer');
    expect(disclaimer.textContent).toBe(
      "LMI Stats isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc."
    );
  });

  it('BRAND-01 displays LMI Stats in header and title', () => {
    render(<Header showSearch />);
    const header = screen.getByTestId('app-header');
    expect(header.textContent).toContain('LMI Stats');
    expect(metadata.title).toBe('LMI Stats');
  });
});

describe('ProfileHeader and RankedCards', () => {
  it('PROF-01 displays icon, level, Riot ID and region', () => {
    const profile = createSampleProfile();
    render(
      <ProfileHeader summoner={profile.summoner} nowMs={1_750_000_000_000} />
    );

    const icon = screen.getByTestId('summoner-icon') as HTMLImageElement;
    expect(icon.src).toContain('/img/profileicon/29.png');
    expect(screen.getByTestId('summoner-level').textContent).toBe('Nível 412');
    expect(screen.getByTestId('summoner-riot-id').textContent).toBe('Kami#BR1');
    expect(screen.getByTestId('summoner-region').textContent).toBe('BR1');
  });

  it('PROF-02 displays Solo/Duo and Flex tier, division, LP, wins, losses and rounded winrate', () => {
    const profile = createSampleProfile();
    render(
      <RankedCards
        solo={profile.leagues.solo}
        flex={profile.leagues.flex}
      />
    );

    const soloCard = screen.getByTestId('ranked-card-solo');
    expect(soloCard.textContent).toContain('Ranqueada Solo/Duo');
    expect(soloCard.textContent).toContain('CHALLENGER I');
    expect(soloCard.textContent).toContain('1125 PdL');
    expect(soloCard.textContent).toContain('120V 80D');
    expect(soloCard.textContent).toContain('60% Taxa de vitória');

    const flexCard = screen.getByTestId('ranked-card-flex');
    expect(flexCard.textContent).toContain('Ranqueada Flex');
    expect(flexCard.textContent).toContain('DIAMOND II');
    expect(flexCard.textContent).toContain('74 PdL');
    expect(flexCard.textContent).toContain('20V 10D');
    expect(flexCard.textContent).toContain('67% Taxa de vitória');
  });

  it('PROF-03 displays Unranked when queue has no rank', () => {
    const profile = createSampleProfile();
    render(<RankedCards solo={profile.leagues.solo} flex={null} />);

    expect(screen.getByTestId('ranked-card-solo').textContent).toContain(
      'CHALLENGER I'
    );
    expect(
      screen.getByTestId('ranked-card-flex-unranked').textContent
    ).toBe('Unranked');
  });

  it('PROF-04 displays relative time since last update', () => {
    const nowMs = 1_750_000_000_000;
    const profile = createSampleProfile({
      summoner: {
        ...createSampleProfile().summoner,
        lastUpdatedAt: new Date(nowMs - 5 * 60_000).toISOString(),
      },
    });
    render(<ProfileHeader summoner={profile.summoner} nowMs={nowMs} />);

    expect(screen.getByTestId('summoner-updated-ago').textContent).toBe(
      'Atualizado há 5 minutos'
    );
  });
});

describe('RefreshButton', () => {
  it('REFR-02 disables button and shows Atualizando... while refreshing', async () => {
    const nowMs = 1_750_000_000_000;
    let resolveFetch!: (val: Response) => void;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        })
    );

    render(
      <RefreshButton
        platform="BR1"
        puuid="puuid-kami"
        lastUpdatedAt={new Date(nowMs - 300_000).toISOString()}
        nowMs={nowMs}
      />
    );

    const btn = screen.getByTestId('refresh-button') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toBe('Atualizar');

    fireEvent.click(btn);

    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toBe('Atualizando...');

    const updated = createSampleProfile();
    resolveFetch(
      new Response(JSON.stringify({ profile: updated }), { status: 200 })
    );

    await waitFor(() => {
      expect(btn.textContent).not.toBe('Atualizando...');
    });

    fetchSpy.mockRestore();
  });

  it('REFR-03 disables button and shows remaining cooldown seconds', () => {
    const nowMs = 1_750_000_000_000;
    render(
      <RefreshButton
        platform="BR1"
        puuid="puuid-kami"
        lastUpdatedAt={new Date(nowMs - 35_000).toISOString()} // 35s ago -> 85s cooldown remaining
        nowMs={nowMs}
      />
    );

    const btn = screen.getByTestId('refresh-button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toBe('85s');
  });

  it('REFR-07 updates profile, history and stats in place when refresh finishes', async () => {
    const nowMs = 1_750_000_000_000;
    const initial = createSampleProfile();
    const updated = createSampleProfile({
      summoner: {
        ...initial.summoner,
        summonerLevel: 415,
        lastUpdatedAt: new Date(nowMs).toISOString(),
      },
      leagues: {
        ...initial.leagues,
        solo: {
          ...initial.leagues.solo!,
          leaguePoints: 1180,
          wins: 122,
        },
      },
      championStats: {
        ...initial.championStats,
        solo: {
          champions: [
            {
              championId: 103,
              championName: 'Ahri',
              games: 15,
              wins: 12,
              losses: 3,
              winrate: 80,
              avgKills: 9.2,
              avgDeaths: 1.8,
              avgAssists: 7.4,
              kda: 9.22,
              csPerMin: 8.5,
            },
          ],
          visibleChampions: [],
          hasMore: false,
          totalGames: 15,
          isEmpty: false,
        },
      },
    });

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          profile: updated,
          renamed: false,
          newSlug: 'Kami-BR1',
        }),
        { status: 200 }
      )
    );

    function Harness() {
      const [data, setData] = useState(initial);
      return (
        <div>
          <ProfileHeader
            summoner={data.summoner}
            nowMs={nowMs}
            onRefreshed={(newProfile) => setData(newProfile)}
          />
          <RankedCards solo={data.leagues.solo} flex={data.leagues.flex} />
          <div data-testid="live-champ-games">
            {data.championStats.solo.totalGames} partidas
          </div>
        </div>
      );
    }

    render(<Harness />);
    expect(screen.getByTestId('summoner-level').textContent).toBe('Nível 412');
    expect(screen.getByTestId('ranked-card-solo').textContent).toContain(
      '1125 PdL'
    );
    expect(screen.getByTestId('live-champ-games').textContent).toBe(
      '0 partidas'
    );

    fireEvent.click(screen.getByTestId('refresh-button'));

    await waitFor(() => {
      expect(screen.getByTestId('summoner-level').textContent).toBe(
        'Nível 415'
      );
    });
    expect(screen.getByTestId('ranked-card-solo').textContent).toContain(
      '1180 PdL'
    );
    expect(screen.getByTestId('live-champ-games').textContent).toBe(
      '15 partidas'
    );

    fetchSpy.mockRestore();
  });

  it('REFR-08 preserves saved data and shows error message when refresh fails', async () => {
    const nowMs = 1_750_000_000_000;
    const initial = createSampleProfile();

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          error: 'unavailable',
          message:
            'Não foi possível atualizar agora. Tente novamente em instantes.',
        }),
        { status: 503 }
      )
    );

    function Harness() {
      const [data, setData] = useState(initial);
      return (
        <div>
          <ProfileHeader
            summoner={data.summoner}
            nowMs={nowMs}
            onRefreshed={(newProfile) => setData(newProfile)}
          />
          <RankedCards solo={data.leagues.solo} flex={data.leagues.flex} />
        </div>
      );
    }

    render(<Harness />);
    fireEvent.click(screen.getByTestId('refresh-button'));

    await waitFor(() => {
      expect(screen.getByTestId('refresh-error').textContent).toBe(
        'Não foi possível atualizar agora. Tente novamente em instantes.'
      );
    });

    // Saved data remained untouched
    expect(screen.getByTestId('summoner-riot-id').textContent).toBe('Kami#BR1');
    expect(screen.getByTestId('summoner-level').textContent).toBe('Nível 412');
    expect(screen.getByTestId('ranked-card-solo').textContent).toContain(
      '1125 PdL'
    );

    fetchSpy.mockRestore();
  });
});
