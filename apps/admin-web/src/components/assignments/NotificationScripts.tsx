'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

type Script = { id: string; name: string; title: string; message: string };

export function NotificationScripts({ title, message, onChoose, disabled, initialMode = 'freehand', children, onAddingChange }: {
  initialMode?: 'freehand' | 'saved';
  children?: ReactNode;
  onAddingChange?: (adding: boolean) => void;
  title: string; message: string; onChoose: (title: string, message: string) => void; disabled: boolean;
}) {
  const client = useQueryClient();
  const [mode, setMode] = useState<'freehand' | 'saved'>(initialMode);
  const [selected, setSelected] = useState('');
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [name, setName] = useState('');
  const [scriptMessage, setScriptMessage] = useState('');
  useEffect(() => { onAddingChange?.(adding); return () => onAddingChange?.(false); }, [adding, onAddingChange]);
  const scripts = useQuery({ queryKey: ['notification-scripts'], queryFn: async () => {
    const { data, error } = await createClient().from('notification_scripts').select('id,name,title,message').order('name');
    if (error) throw error;
    return data as Script[];
  } });
  const save = useMutation({ mutationFn: async () => {
    const { data, error } = await createClient().from('notification_scripts').insert({ name: name.trim(), title: name.trim(), message: scriptMessage.trim() }).select('id,name,title,message').single();
    if (error) throw error;
    return data as Script;
  }, onSuccess: script => {
    client.setQueryData<Script[]>(['notification-scripts'], current => [...(current ?? []), script].sort((a, b) => a.name.localeCompare(b.name)));
    onChoose(script.title, script.message); setSelected(script.id); setMode('saved'); setAdding(false); setName('');
  } });
  const remove = useMutation({ mutationFn: async (id: string) => {
    const { data, error } = await createClient().from('notification_scripts').delete().eq('id', id).select('id');
    if (error) throw error;
    if (!data?.length) throw new Error('Script could not be deleted. Refresh and try again.');
    return id;
  }, onSuccess: id => {
    client.setQueryData<Script[]>(['notification-scripts'], current => current?.filter(script => script.id !== id) ?? []);
    setSelected(''); setConfirmDelete(false); onChoose('', '');
  } });
  return <fieldset disabled={disabled || save.isPending || remove.isPending} className="space-y-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-lg">
    <legend className="px-1 font-bold">Message scripts</legend>
    <div className="flex flex-wrap items-center gap-4">
      <label className="flex items-center gap-2"><input type="radio" name="script-mode" checked={mode === 'freehand'} onChange={() => { setMode('freehand'); setAdding(false); }} />Freehand</label>
      <label className="flex items-center gap-2"><input type="radio" name="script-mode" checked={mode === 'saved'} onChange={() => { setMode('saved'); setAdding(false); const script = scripts.data?.find(item => item.id === selected); onChoose(script?.title ?? '', script?.message ?? ''); }} />Select from list</label>
      <button type="button" onClick={() => { save.reset(); setName(''); setScriptMessage(''); setAdding(true); }} className="rounded-lg border border-blue-300 bg-white px-3 py-2 font-semibold">Add new script</button>
    </div>
    {mode === 'saved' && !adding ? <>
      <select aria-label="Saved message script" className="w-full rounded-lg border border-slate-300 bg-white p-2 text-lg" value={selected} onChange={event => {
        setSelected(event.target.value); setConfirmDelete(false); remove.reset();
        const script = scripts.data?.find(item => item.id === event.target.value);
        onChoose(script?.title ?? '', script?.message ?? '');
      }}>
        <option value="">{scripts.isPending ? 'Loading scripts…' : 'Choose a script'}</option>
        {scripts.data?.map(script => <option key={script.id} value={script.id}>{script.name}</option>)}
      </select>
      {selected ? <div className="flex flex-wrap items-center gap-2">
        {confirmDelete ? <>
          <p className="w-full text-base">Delete “{scripts.data?.find(script => script.id === selected)?.name}” from the shared list for all office users?</p>
          <button type="button" onClick={() => remove.mutate(selected)} className="rounded bg-red-700 px-3 py-2 font-bold text-white">{remove.isPending ? 'Deleting…' : 'Delete script'}</button>
          <button type="button" onClick={() => setConfirmDelete(false)} className="px-3 py-2">Cancel</button>
        </> : <button type="button" onClick={() => { remove.reset(); setConfirmDelete(true); }} className="rounded border border-red-300 bg-white px-3 py-2 font-semibold text-red-700">Delete selected script</button>}
      </div> : null}
      {!scripts.isPending && !scripts.error && !scripts.data?.length ? <p>No scripts yet. Use Add new script to create one.</p> : null}

    </> : null}
    {adding ? <div className="space-y-2 border-t border-blue-200 pt-3">
      <label className="block font-semibold">Script name<input value={name} maxLength={100} onChange={event => setName(event.target.value)} className="mt-1 w-full rounded border border-slate-300 p-2 font-normal" placeholder="For example: Office address for interview" /></label>
      <label className="block font-semibold">Script text<textarea value={scriptMessage} maxLength={500} rows={4} onChange={event => setScriptMessage(event.target.value)} className="mt-1 w-full rounded border border-slate-300 p-2 text-lg font-normal" placeholder="Write the saved message…" /></label><p className="text-base">The script name will also be the notification title.</p>
      <div className="flex gap-2"><button type="button" disabled={!name.trim() || !scriptMessage.trim() || save.isPending} onClick={() => save.mutate()} className="rounded bg-blue-600 px-3 py-2 font-bold text-white disabled:opacity-50">{save.isPending ? 'Saving…' : 'Save script'}</button><button type="button" onClick={() => { setAdding(false); if (mode === 'saved') { const script = scripts.data?.find(item => item.id === selected); onChoose(script?.title ?? '', script?.message ?? ''); } }} className="px-3 py-2">Cancel</button></div>
    </div> : null}
    {mode === 'freehand' && !adding ? <div className="space-y-3">{children}</div> : null}
    {scripts.error || save.error || remove.error ? <p role="alert" className="text-base text-red-700">{scripts.error?.message || save.error?.message || remove.error?.message}</p> : null}
  </fieldset>;
}
