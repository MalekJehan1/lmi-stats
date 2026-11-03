'use client';

import React, { useState } from 'react';
import { t } from '@/i18n';
import {
  DEFAULT_PLATFORM,
  Platform,
  PLATFORMS,
  isPlatform,
} from '@/server/riot/routing';
import { buildSummonerUrl, parseRiotId } from '@/server/riot/riot-id';

export interface SearchBarProps {
  defaultPlatform?: Platform;
  defaultQuery?: string;
  onNavigate?: (url: string) => void;
  compact?: boolean;
}

export function Header({
  defaultPlatform = DEFAULT_PLATFORM,
  onNavigate,
  showSearch = false,
}: {
  defaultPlatform?: Platform;
  onNavigate?: (url: string) => void;
  showSearch?: boolean;
}) {
  return (
    <header
      data-testid="app-header"
      className="w-full border-b border-slate-800 bg-slate-900/90 backdrop-blur"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3">
        <a
          href="/"
          className="flex items-center gap-2 text-xl font-extrabold tracking-tight text-indigo-400 hover:text-indigo-300"
        >
          <span>{t('brand.name')}</span>
        </a>
        {showSearch && (
          <div className="w-full max-w-md">
            <SearchBar
              defaultPlatform={defaultPlatform}
              onNavigate={onNavigate}
              compact
            />
          </div>
        )}
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer
      data-testid="app-footer"
      className="mt-auto w-full border-t border-slate-800 bg-slate-950 px-4 py-6 text-center text-xs text-slate-400"
    >
      <div className="mx-auto max-w-5xl leading-relaxed">
        <p data-testid="legal-disclaimer">{t('legal.disclaimer')}</p>
      </div>
    </footer>
  );
}

export function SearchBar({
  defaultPlatform = DEFAULT_PLATFORM,
  defaultQuery = '',
  onNavigate,
  compact = false,
}: SearchBarProps) {
  const [platform, setPlatform] = useState<Platform>(defaultPlatform);
  const [query, setQuery] = useState<string>(defaultQuery);
  const [error, setError] = useState<string | null>(null);

  const handlePlatformChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (isPlatform(val)) {
      setPlatform(val);
    }
  };

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    if (error) {
      setError(null);
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const parsed = parseRiotId(query);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(null);
    const targetUrl = buildSummonerUrl(platform, parsed.gameName, parsed.tagLine);
    if (onNavigate) {
      onNavigate(targetUrl);
      return;
    }
    if (typeof window !== 'undefined') {
      window.location.assign(targetUrl);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      data-testid="search-form"
      className="w-full"
      noValidate
    >
      <div
        className={`flex w-full flex-col gap-2 sm:flex-row ${
          compact ? 'items-stretch' : 'items-stretch'
        }`}
      >
        <div className="flex items-center">
          <label htmlFor="region-select" className="sr-only">
            {t('search.regionLabel')}
          </label>
          <select
            id="region-select"
            aria-label={t('search.regionLabel')}
            data-testid="region-select"
            value={platform}
            onChange={handlePlatformChange}
            className="h-11 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm font-semibold text-slate-100 focus:border-indigo-500 focus:outline-none sm:w-28"
          >
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-1 gap-2">
          <input
            type="text"
            aria-label={t('search.placeholder')}
            data-testid="riot-id-input"
            placeholder={t('search.placeholder')}
            value={query}
            onChange={handleQueryChange}
            className="h-11 flex-1 min-w-0 rounded-lg border border-slate-700 bg-slate-900 px-4 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
          />
          <button
            type="submit"
            data-testid="search-submit"
            className="h-11 rounded-lg bg-indigo-600 px-5 text-sm font-semibold text-white transition hover:bg-indigo-500 focus:outline-none"
          >
            {t('search.submit')}
          </button>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          data-testid="search-error"
          className="mt-2 text-xs font-medium text-rose-400"
        >
          {error}
        </p>
      )}
    </form>
  );
}
