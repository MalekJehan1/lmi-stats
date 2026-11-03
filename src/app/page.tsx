import React from 'react';
import { t } from '@/i18n';
import { Footer, Header, SearchBar } from '@/components/SearchBar';

export default function HomePage() {
  return (
    <div
      data-testid="home-page"
      className="flex min-h-screen w-full flex-col overflow-x-hidden bg-slate-950 text-slate-100"
    >
      <Header />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-4 py-12">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-extrabold tracking-tight text-indigo-400 sm:text-5xl">
            {t('brand.name')}
          </h1>
          <p className="mt-2 text-sm text-slate-400 sm:text-base">
            {t('brand.subtitle')}
          </p>
        </div>

        <div className="w-full rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl">
          <SearchBar />
        </div>
      </main>
      <Footer />
    </div>
  );
}
