'use client';

import { useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Modal } from '@/components/ui/Modal';
import { PortalAccessRulesModal } from '@/components/portal/PortalAccessRules';
import { NextWeekPreviewRulesModal } from '@/components/portal/NextWeekPreviewAccess';
import { TimesheetSendingRulesModal } from '@/components/portal/TimesheetSendingRulesModal';
import { BRAND_HERO_IMAGES } from '@/lib/navigation';

type TopicCategory = 'Rules' | 'Help' | 'Tips';
type Topic = { id: string; title: string; category: TopicCategory; content?: string; custom?: boolean };

const STORAGE_KEY = 'mc-labor-help-rules-tips-v1';
const BUILT_IN_TOPICS: Topic[] = [
  {
    id: 'portal-access-rules',
    title: 'Portal Access Rules',
    category: 'Rules',
  },
  {
    id: 'next-week-rules',
    title: 'Next Work Week Rules',
    category: 'Rules',
  },
  {
    id: 'timesheet-sending-rules',
    title: 'Timesheet Sending Rules',
    category: 'Rules',
  },
];

export default function HelpRulesTipsPage() {
  const [topics, setTopics] = useState<Topic[]>(BUILT_IN_TOPICS);
  const [query, setQuery] = useState('');
  const [activeTopic, setActiveTopic] = useState<Topic | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Topic[];
        if (Array.isArray(parsed)) setTopics([...BUILT_IN_TOPICS, ...parsed.filter((topic) => topic.custom)]);
      }
    } catch {
      // Keep the built-in topics available if saved browser data is unavailable.
    }
  }, []);

  const filteredTopics = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    if (!search) return topics;
    return topics.filter((topic) => `${topic.title} ${topic.category} ${topic.content ?? ''}`.toLocaleLowerCase().includes(search));
  }, [query, topics]);

  function saveTopics(nextTopics: Topic[]) {
    setTopics(nextTopics);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextTopics.filter((topic) => topic.custom)));
    } catch {
      // The current session still keeps its edits if browser storage is full or disabled.
    }
  }

  return (
    <DashboardLayout heroTitle="Help / Rules / Tips" heroImage={BRAND_HERO_IMAGES.inner}>
      <div className="mx-auto w-full max-w-6xl space-y-5 pb-8">
        <section className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.14em] text-blue-700">Reference library</p>
              <h1 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">Help, rules, and tips</h1>
              <p className="mt-2 text-base text-slate-600">Browse the current portal and timesheet rules. Search to find a topic.</p>
            </div>
          </div>

          <label className="mt-5 block">
            <span className="sr-only">Search help, rules, and tips</span>
            <span className="relative block">
              <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg text-slate-400">⌕</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search rules, help, and tips…" className="h-12 w-full rounded-xl border border-slate-300 bg-slate-50 pl-10 pr-4 text-base text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100" />
            </span>
          </label>

        </section>

        <div className="flex items-center justify-between px-1 text-sm text-slate-500">
          <p>{filteredTopics.length} {filteredTopics.length === 1 ? 'topic' : 'topics'}</p>
          {query ? <button type="button" className="font-semibold text-blue-700 hover:underline" onClick={() => setQuery('')}>Clear search</button> : null}
        </div>

        {filteredTopics.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filteredTopics.map((topic) => (
              <article key={topic.id} className="group flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm transition hover:border-blue-300 hover:shadow-md">
                <button type="button" onClick={() => setActiveTopic(topic)} className="flex min-h-16 min-w-0 flex-1 items-center justify-between gap-3 rounded-lg px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                  <span className="min-w-0">
                    <span className="block truncate text-lg font-bold text-slate-900">{topic.title}</span>
                    <span className="mt-0.5 block text-sm font-medium text-slate-500">{topic.category} · Open details</span>
                  </span>
                  <span aria-hidden="true" className="shrink-0 text-xl text-blue-700 transition-transform group-hover:translate-x-1">›</span>
                </button>
                {topic.custom ? <button type="button" aria-label={`Delete ${topic.title}`} onClick={() => saveTopics(topics.filter((item) => item.id !== topic.id))} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-red-50 hover:text-red-700">Delete</button> : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
            <h2 className="text-lg font-bold text-slate-800">No matching topics</h2>
            <p className="mt-1 text-slate-500">Try another search, or add a topic to the library.</p>
          </div>
        )}
      </div>
      <PortalAccessRulesModal open={activeTopic?.id === 'portal-access-rules'} onClose={() => setActiveTopic(null)} />
      <NextWeekPreviewRulesModal open={activeTopic?.id === 'next-week-rules'} onClose={() => setActiveTopic(null)} />
      <TimesheetSendingRulesModal open={activeTopic?.id === 'timesheet-sending-rules'} onClose={() => setActiveTopic(null)} />
      {activeTopic?.custom ? (
        <Modal open onClose={() => setActiveTopic(null)} title={activeTopic.title} icon="info" size="xl"
          titleClassName="!text-2xl sm:!text-3xl"
          contentClassName="sm:!px-8 sm:!py-6">
          <div className="space-y-5 text-lg leading-relaxed text-slate-700 sm:text-[22px]">
            <p className="text-sm font-bold uppercase tracking-wider text-blue-700">{activeTopic.category}</p>
            <p className="whitespace-pre-wrap">{activeTopic.content ?? ''}</p>
          </div>
        </Modal>
      ) : null}
    </DashboardLayout>
  );
}
