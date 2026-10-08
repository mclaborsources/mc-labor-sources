import Link from 'next/link';
import type { ReactNode } from 'react';

export function PublicAppPage({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4 px-6 py-5">
          <span className="text-lg font-bold tracking-tight text-slate-900">MC Labor Sources</span>
          <nav aria-label="App information" className="flex gap-6 text-sm font-semibold text-blue-700">
            <Link href="/support" className="hover:underline">Support</Link>
            <Link href="/privacy" className="hover:underline">Privacy</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
        <p className="mb-3 text-xs font-bold uppercase tracking-widest text-blue-700">MC Labor Sources mobile app</p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{title}</h1>
        <p className="mt-4 text-lg leading-8 text-slate-600">{intro}</p>
        <div className="mt-10 space-y-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">{children}</div>
      </main>
      <footer className="mx-auto max-w-3xl px-6 pb-8 text-sm text-slate-500">© 2026 MC Labor Sources, Inc.</footer>
    </div>
  );
}

export function PublicPageSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 text-base leading-7">
      <h2 className="text-lg font-bold text-slate-900">{title}</h2>
      {children}
    </section>
  );
}
