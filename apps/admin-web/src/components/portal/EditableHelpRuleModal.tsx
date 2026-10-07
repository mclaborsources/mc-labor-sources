'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { DESTRUCTIVE_ACTION_PASS_CODE, PassCodeDialog } from '@/components/ui/PassCodeDialog';
import { createClient } from '@/lib/supabase/client';

type RuleCategory = 'Rules' | 'Help' | 'Tips';
type RuleRow = { title: string; category: RuleCategory; content: string; is_deleted: boolean };

interface EditableHelpRuleModalProps {
  open: boolean;
  onClose: () => void;
  ruleId: string;
  defaultTitle: string;
  defaultContent: string;
  afterContent?: ReactNode;
}

function errorText(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message;
  return 'Could not update this rule.';
}

export function EditableHelpRuleModal({
  open,
  onClose,
  ruleId,
  defaultTitle,
  defaultContent,
  afterContent,
}: EditableHelpRuleModalProps) {
  const [rule, setRule] = useState<RuleRow>({ title: defaultTitle, category: 'Rules', content: defaultContent, is_deleted: false });
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(defaultTitle);
  const [editCategory, setEditCategory] = useState<RuleCategory>('Rules');
  const [editContent, setEditContent] = useState(defaultContent);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [passCodeOpen, setPassCodeOpen] = useState(false);
  const [passCode, setPassCode] = useState('');
  const [passCodeError, setPassCodeError] = useState('');
  const [pendingAction, setPendingAction] = useState<'edit' | 'delete' | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    void createClient()
      .from('help_rule_topics')
      .select('title, category, content, is_deleted')
      .eq('id', ruleId)
      .maybeSingle()
      .then(({ data, error: loadError }) => {
        if (cancelled) return;
        if (loadError) throw loadError;
        if (data) setRule(data as RuleRow);
        else setRule({ title: defaultTitle, category: 'Rules', content: defaultContent, is_deleted: false });
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(errorText(loadError));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, ruleId, defaultTitle, defaultContent]);

  function requestPassCode(action: 'edit' | 'delete') {
    setPendingAction(action);
    setPassCode('');
    setPassCodeError('');
    setPassCodeOpen(true);
  }

  async function confirmPassCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (passCode.trim() !== DESTRUCTIVE_ACTION_PASS_CODE) {
      setPassCodeError('Incorrect pass code.');
      return;
    }
    const action = pendingAction;
    setPassCodeOpen(false);
    setPassCode('');
    setPassCodeError('');
    setPendingAction(null);
    if (action === 'edit') {
      setEditTitle(rule.title);
      setEditCategory(rule.category);
      setEditContent(rule.content);
      setEditing(true);
      return;
    }
    if (action === 'delete') await deleteRule();
  }

  async function saveRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    try {
      setSaving(true);
      const nextRule = {
        title: editTitle.trim(),
        category: editCategory,
        content: editContent.trim(),
        updated_at: new Date().toISOString(),
      };
      if (!nextRule.title || !nextRule.content) throw new Error('Enter a title and rule details.');
      const { error: updateError } = await createClient().from('help_rule_topics').update(nextRule).eq('id', ruleId);
      if (updateError) throw updateError;
      setRule({ ...nextRule, is_deleted: false });
      setEditing(false);
      window.dispatchEvent(new Event('help-rules-updated'));
    } catch (saveError) {
      setError(errorText(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function deleteRule() {
    setError('');
    try {
      setSaving(true);
      const { error: deleteError } = await createClient().from('help_rule_topics')
        .update({ is_deleted: true, updated_at: new Date().toISOString() })
        .eq('id', ruleId);
      if (deleteError) throw deleteError;
      setRule((current) => ({ ...current, is_deleted: true }));
      setEditing(false);
      window.dispatchEvent(new Event('help-rules-updated'));
    } catch (deleteError) {
      setError(errorText(deleteError));
    } finally {
      setSaving(false);
    }
  }

  return <>
    <Modal
      open={open}
      onClose={onClose}
      title={rule.title}
      subtitle={rule.category}
      icon="info"
      size="xl"
      centered
      titleClassName="!text-2xl sm:!text-3xl"
      contentClassName="sm:!px-8 sm:!py-6"
      headerActions={!loading && !rule.is_deleted && !editing ? <>
        <Button type="button" size="sm" variant="softPrimary" icon="edit" disabled={saving} onClick={() => requestPassCode('edit')}>Edit Rule</Button>
        <Button type="button" size="sm" variant="danger" icon="trash" disabled={saving} onClick={() => requestPassCode('delete')}>Delete Rule</Button>
      </> : undefined}
    >
      {loading ? <p className="text-base text-slate-600">Loading rule…</p> : editing ? (
        <form onSubmit={saveRule} className="space-y-5">
          <label className="block space-y-1.5">
            <span className="text-sm font-semibold text-slate-700">Title</span>
            <input required maxLength={100} value={editTitle} onChange={(event) => setEditTitle(event.target.value)} className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-semibold text-slate-700">Category</span>
            <select value={editCategory} onChange={(event) => setEditCategory(event.target.value as RuleCategory)} className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
              <option>Rules</option><option>Help</option><option>Tips</option>
            </select>
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-semibold text-slate-700">Rule details</span>
            <textarea required rows={10} value={editContent} onChange={(event) => setEditContent(event.target.value)} className="w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base leading-relaxed outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
          </label>
          <div className="flex justify-end gap-2 border-t border-blue-200 pt-4">
            <Button type="button" variant="secondary" disabled={saving} onClick={() => setEditing(false)}>Cancel</Button>
            <Button type="submit" icon="save" loading={saving} loadingText="Saving…">Save Rule</Button>
          </div>
        </form>
      ) : rule.is_deleted ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-base text-amber-900">This rule has been deleted from the Help / Rules / Tips library.</p>
      ) : (
        <div className="space-y-5 text-lg leading-relaxed text-slate-700 sm:text-[22px]">
          <p className="whitespace-pre-wrap">{rule.content}</p>
          {afterContent}
        </div>
      )}
      {error ? <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
    </Modal>
    <PassCodeDialog
      open={passCodeOpen}
      value={passCode}
      error={passCodeError}
      pending={saving}
      onChange={(value) => { setPassCode(value); setPassCodeError(''); }}
      onCancel={() => { if (!saving) { setPassCodeOpen(false); setPendingAction(null); setPassCode(''); setPassCodeError(''); } }}
      onSubmit={confirmPassCode}
    />
  </>;
}
