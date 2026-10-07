'use client';

import { useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Modal } from '@/components/ui/Modal';
import { PortalAccessRulesModal } from '@/components/portal/PortalAccessRules';
import { NextWeekPreviewRulesModal } from '@/components/portal/NextWeekPreviewAccess';
import { TimesheetSendingRulesModal } from '@/components/portal/TimesheetSendingRulesModal';
import { Button } from '@/components/ui/Button';
import { DESTRUCTIVE_ACTION_PASS_CODE, PassCodeDialog } from '@/components/ui/PassCodeDialog';
import { BRAND_HERO_IMAGES } from '@/lib/navigation';
import { createClient } from '@/lib/supabase/client';
import { deleteStorageFile } from '@/lib/supabase/storage';
import { normalizeHelpWorkbookUrl } from '@/lib/help-workbook';

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

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    const code = 'code' in error && typeof error.code === 'string' ? ` (${error.code})` : '';
    return `${error.message}${code}`;
  }
  return fallback;
}

export default function HelpRulesTipsPage() {
  const [topics, setTopics] = useState<Topic[]>(BUILT_IN_TOPICS);
  const [query, setQuery] = useState('');
  const [activeTopic, setActiveTopic] = useState<Topic | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState<TopicCategory>('Help');
  const [newContent, setNewContent] = useState('');
  const [helpUrl, setHelpUrl] = useState<string | null>(null);
  const [helpLoading, setHelpLoading] = useState(true);
  const [helpDialogOpen, setHelpDialogOpen] = useState(false);
  const [helpUrlInput, setHelpUrlInput] = useState('');
  const [helpSaving, setHelpSaving] = useState(false);
  const [helpError, setHelpError] = useState('');
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
  const [topicPassCodeOpen, setTopicPassCodeOpen] = useState(false);
  const [topicPassCode, setTopicPassCode] = useState('');
  const [topicPassCodeError, setTopicPassCodeError] = useState('');
  const [pendingTopicAction, setPendingTopicAction] = useState<{ topic: Topic; action: 'edit' | 'delete' } | null>(null);
  const [topicSaving, setTopicSaving] = useState(false);
  const [topicFormError, setTopicFormError] = useState('');

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

  useEffect(() => {
    let cancelled = false;
    async function refreshBuiltInTopics() {
      const { data, error } = await createClient().from('help_rule_topics')
        .select('id, title, category, content, is_deleted')
        .in('id', BUILT_IN_TOPICS.map((topic) => topic.id));
      if (cancelled || error || !data) return;
      const builtIns = data.filter((topic) => !topic.is_deleted).map((topic) => ({
        id: topic.id,
        title: topic.title,
        category: topic.category as TopicCategory,
        content: topic.content,
      }));
      setTopics((current) => [...builtIns, ...current.filter((topic) => topic.custom)]);
    }
    void refreshBuiltInTopics();
    window.addEventListener('help-rules-updated', refreshBuiltInTopics);
    return () => {
      cancelled = true;
      window.removeEventListener('help-rules-updated', refreshBuiltInTopics);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadHelpWorkbook() {
      try {
        const { data, error } = await createClient()
          .from('help_workbook_settings')
          .select('storage_url, workbook_url, workbook_name')
          .eq('id', 1)
          .maybeSingle();
        if (error) throw error;
        if (!cancelled && data) {
          setHelpUrl(data.workbook_url ?? data.storage_url ?? null);
          setHelpUrlInput(data.workbook_url ?? data.storage_url ?? '');
        }
      } catch (error) {
        if (!cancelled) setHelpError(errorMessage(error, 'Could not load the Help workbook setting.'));
      } finally {
        if (!cancelled) setHelpLoading(false);
      }
    }
    void loadHelpWorkbook();
    return () => { cancelled = true; };
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

  async function addTopic(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTopicFormError('');
    const title = newTitle.trim();
    const content = newContent.trim();
    if (!title || !content) return;

    const topic: Topic = {
      id: editingTopicId ?? `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title,
      category: newCategory,
      content,
      custom: editingTopicId ? Boolean(topics.find((item) => item.id === editingTopicId)?.custom) : true,
    };
    const editingBuiltIn = editingTopicId && BUILT_IN_TOPICS.some((item) => item.id === editingTopicId);
    if (editingBuiltIn) {
      try {
        setTopicSaving(true);
        const { error } = await createClient().from('help_rule_topics').update({
          title,
          category: newCategory,
          content,
          updated_at: new Date().toISOString(),
        }).eq('id', editingTopicId);
        if (error) throw error;
        setTopics((current) => current.map((item) => item.id === editingTopicId ? topic : item));
        window.dispatchEvent(new Event('help-rules-updated'));
      } catch (error) {
        setTopicFormError(errorMessage(error, 'Could not update the rule.'));
        return;
      } finally {
        setTopicSaving(false);
      }
    } else {
      saveTopics(editingTopicId ? topics.map((item) => item.id === editingTopicId ? topic : item) : [...topics, topic]);
    }
    setQuery('');
    setNewTitle('');
    setNewCategory('Help');
    setNewContent('');
    setEditingTopicId(null);
    setAddOpen(false);
  }

  function requestTopicPassCode(topic: Topic, action: 'edit' | 'delete') {
    setPendingTopicAction({ topic, action });
    setTopicPassCode('');
    setTopicPassCodeError('');
    setTopicPassCodeOpen(true);
  }

  async function confirmTopicPassCode(event: React.FormEvent) {
    event.preventDefault();
    if (topicPassCode.trim() !== DESTRUCTIVE_ACTION_PASS_CODE) {
      setTopicPassCodeError('Incorrect pass code.');
      return;
    }
    const pending = pendingTopicAction;
    setTopicPassCodeOpen(false);
    setTopicPassCode('');
    setTopicPassCodeError('');
    setPendingTopicAction(null);
    if (!pending) return;
    if (pending.action === 'delete') {
      if (pending.topic.custom) {
        saveTopics(topics.filter((topic) => topic.id !== pending.topic.id));
      } else {
        try {
          setTopicSaving(true);
          const { error } = await createClient().from('help_rule_topics')
            .update({ is_deleted: true, updated_at: new Date().toISOString() })
            .eq('id', pending.topic.id);
          if (error) throw error;
          setTopics((current) => current.filter((topic) => topic.id !== pending.topic.id));
          window.dispatchEvent(new Event('help-rules-updated'));
        } catch (error) {
          setTopicFormError(errorMessage(error, 'Could not delete the rule.'));
        } finally {
          setTopicSaving(false);
        }
      }
    } else {
      setTopicFormError('');
      setEditingTopicId(pending.topic.id);
      setNewTitle(pending.topic.title);
      setNewCategory(pending.topic.category);
      setNewContent(pending.topic.content ?? '');
      setAddOpen(true);
    }
  }

  function openHelpWorkbook() {
    setHelpError('');
    if (!helpUrl) {
      setHelpDialogOpen(true);
      return;
    }
    try {
      window.open(normalizeHelpWorkbookUrl(helpUrl), '_blank', 'noopener,noreferrer');
    } catch (error) {
      setHelpError(errorMessage(error, 'Could not open Help.'));
    }
  }

  async function saveHelpWorkbook(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setHelpError('');
    let previousStorageUrl: string | null = null;

    try {
      setHelpSaving(true);
      const destination = normalizeHelpWorkbookUrl(helpUrlInput);
      const supabase = createClient();
      const { data: previous, error: previousError } = await supabase
        .from('help_workbook_settings')
        .select('storage_url')
        .eq('id', 1)
        .maybeSingle();
      if (previousError) throw previousError;
      previousStorageUrl = previous?.storage_url ?? null;

      const { error } = await supabase.from('help_workbook_settings').upsert({
        id: 1,
        workbook_url: destination,
        storage_url: null,
        workbook_name: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
      if (error) throw error;

      if (previousStorageUrl && previousStorageUrl !== destination) {
        await deleteStorageFile('documents', previousStorageUrl).catch(() => undefined);
      }
      setHelpUrl(destination);
      setHelpUrlInput(destination);
      setHelpDialogOpen(false);
    } catch (error) {
      setHelpError(errorMessage(error, 'Could not save the Help link.'));
    } finally {
      setHelpSaving(false);
    }
  }

  async function removeHelpWorkbook() {
    setHelpError('');
    try {
      setHelpSaving(true);
      const supabase = createClient();
      const { data: previous, error: previousError } = await supabase
        .from('help_workbook_settings')
        .select('storage_url')
        .eq('id', 1)
        .maybeSingle();
      if (previousError) throw previousError;

      const { error } = await supabase.from('help_workbook_settings').upsert({
        id: 1,
        workbook_url: null,
        storage_url: null,
        workbook_name: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
      if (error) throw error;

      if (previous?.storage_url) {
        await deleteStorageFile('documents', previous.storage_url).catch(() => undefined);
      }
      setHelpUrl(null);
      setHelpUrlInput('');
      setHelpDialogOpen(false);
    } catch (error) {
      setHelpError(errorMessage(error, 'Could not remove the Help workbook.'));
    } finally {
      setHelpSaving(false);
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
            <div className="flex flex-wrap gap-2">
              <Button type="button" icon="info" onClick={openHelpWorkbook} disabled={helpLoading} title="Open the saved Help link in a new tab" className="shrink-0">
                {helpLoading ? 'Loading Help…' : 'Help'}
              </Button>
              <Button type="button" variant="secondary" onClick={() => { setHelpError(''); setHelpDialogOpen(true); }} className="shrink-0">
                {helpUrl ? 'Manage Help Link' : 'Set Up Help'}
              </Button>
              <Button type="button" icon="plus" onClick={() => setAddOpen(true)} className="shrink-0">Add Help / Rules / Tips</Button>
            </div>
          </div>

          {helpUrl ? <p className="mt-3 text-sm text-slate-500">
            Help opens the saved link in a new browser tab.
          </p> : null}
          {helpError && !helpDialogOpen ? <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{helpError}</p> : null}

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
        {topicFormError && !addOpen ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{topicFormError}</p> : null}

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
                <div className="flex shrink-0 flex-col gap-1">
                  <Button type="button" size="sm" variant="softPrimary" icon="edit" onClick={() => requestTopicPassCode(topic, 'edit')}>Edit</Button>
                  <Button type="button" size="sm" variant="danger" icon="trash" aria-label={`Delete ${topic.title}`} onClick={() => requestTopicPassCode(topic, 'delete')}>Delete</Button>
                </div>
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
        <Modal open centered onClose={() => setActiveTopic(null)} title={activeTopic.title} icon="info" size="xl"
          titleClassName="!text-2xl sm:!text-3xl"
          contentClassName="sm:!px-8 sm:!py-6">
          <div className="space-y-5 text-lg leading-relaxed text-slate-700 sm:text-[22px]">
            <p className="text-sm font-bold uppercase tracking-wider text-blue-700">{activeTopic.category}</p>
            <p className="whitespace-pre-wrap">{activeTopic.content ?? ''}</p>
          </div>
        </Modal>
      ) : null}
      <Modal open={addOpen} centered onClose={() => { setAddOpen(false); setEditingTopicId(null); }} title={editingTopicId ? 'Edit help topic' : 'Add a help topic'} subtitle={editingTopicId ? 'Update this reference item.' : 'Create a reference item for this library.'} icon={editingTopicId ? 'edit' : 'plus'} size="lg">
        <form onSubmit={addTopic} className="space-y-5">
          <label className="block space-y-1.5">
            <span className="text-sm font-semibold text-slate-700">Topic title</span>
            <input autoFocus required maxLength={100} value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder="e.g. How to update your profile" className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-semibold text-slate-700">Category</span>
            <select value={newCategory} onChange={(event) => setNewCategory(event.target.value as TopicCategory)} className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
              <option>Help</option><option>Rules</option><option>Tips</option>
            </select>
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-semibold text-slate-700">Details</span>
            <textarea required maxLength={10000} rows={8} value={newContent} onChange={(event) => setNewContent(event.target.value)} placeholder="Write the instructions or information people need…" className="w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base leading-relaxed text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
          </label>
          {topicFormError ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{topicFormError}</p> : null}
          <div className="flex justify-end gap-2 border-t border-blue-200 pt-4">
            <Button type="button" variant="secondary" disabled={topicSaving} onClick={() => { setAddOpen(false); setEditingTopicId(null); setTopicFormError(''); }}>Cancel</Button>
            <Button type="submit" icon="save" loading={topicSaving} loadingText="Saving…">{editingTopicId ? 'Save changes' : 'Save topic'}</Button>
          </div>
        </form>
      </Modal>
      <PassCodeDialog
        open={topicPassCodeOpen}
        value={topicPassCode}
        error={topicPassCodeError}
        pending={topicSaving}
        onChange={(value) => { setTopicPassCode(value); setTopicPassCodeError(''); }}
        onCancel={() => { setTopicPassCodeOpen(false); setTopicPassCode(''); setPendingTopicAction(null); }}
        onSubmit={confirmTopicPassCode}
      />
      <Modal open={helpDialogOpen} centered onClose={() => { if (!helpSaving) setHelpDialogOpen(false); }} title="Set up Help Link" subtitle="Save a shared link that Help opens in a new browser tab." icon="info" size="wide" titleClassName="!text-2xl" contentClassName="sm:!px-8 sm:!py-7">
        <form onSubmit={saveHelpWorkbook} className="space-y-6">
            <label className="block space-y-2">
              <span className="text-base font-semibold text-slate-800">Help link</span>
              <input type="url" required value={helpUrlInput} disabled={helpSaving} onChange={(event) => setHelpUrlInput(event.target.value)} placeholder="Paste your shared HTTPS link" className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
              <span className="block text-sm text-slate-500">Paste a Google Drive, Google Sheets, OneDrive, or other HTTPS link. Help will open this link in a new tab. Give users access through the service’s sharing settings.</span>
            </label>
          {helpError ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{helpError}</p> : null}
          <div className="flex justify-end gap-2 border-t border-blue-200 pt-4">
            {helpUrl ? <Button type="button" variant="danger" onClick={removeHelpWorkbook} loading={helpSaving} className="mr-auto">Remove Help</Button> : null}
            <Button type="button" variant="secondary" disabled={helpSaving} onClick={() => setHelpDialogOpen(false)}>Cancel</Button>
            <Button type="submit" icon="save" loading={helpSaving} loadingText="Saving…">Save Help</Button>
          </div>
        </form>
      </Modal>
    </DashboardLayout>
  );
}
