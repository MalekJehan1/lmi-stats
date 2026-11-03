import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Footer, Header, SearchBar } from '@/components/SearchBar';
import { PLATFORMS } from '@/server/riot/routing';
import { metadata } from '@/app/layout';

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
