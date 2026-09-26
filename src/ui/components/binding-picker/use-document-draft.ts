import { useEffect, useRef, useState } from 'react';
import { DOCUMENT_SCOPE, MAX_DOCUMENTS, documentsOf, type Binding, type CandidateResult, type Preview, type TaskScope, type ViewState } from '../../../contracts/index.js';
import type { LensClient } from '../../client.js';
export type DraftRow = { key: string; path: string; original?: Binding; keep?: Binding; preview?: Preview; error?: string; grantId?: string };
export const sameScope = (a: TaskScope, b: TaskScope) => JSON.stringify(a) === JSON.stringify(b);
export const rowScope = (row: DraftRow): TaskScope => row.preview?.scope ?? row.keep?.scope ?? row.original?.scope ?? DOCUMENT_SCOPE;
const messageOf = (error: unknown) => error instanceof Error ? error.message : '操作失败，请重试';
export function useDocumentDraft(api: Pick<LensClient, 'call'>, view: ViewState, initialGrantId: string | undefined, onBound: (view: ViewState) => void) {
  const [base] = useState(() => ({ version: view.bindingVersion, bindings: documentsOf(view).map(item => item.binding) }));
  const [rows, setRows] = useState<DraftRow[]>(() => base.bindings.map(binding => ({ key: binding.id, path: binding.displayPath, keep: binding, original: binding })));
  const [kind, setKind] = useState<'file' | 'files' | 'directory'>('files'), [input, setInput] = useState(''), [consent, setConsent] = useState(false);
  const [grant, setGrant] = useState(initialGrantId), [candidates, setCandidates] = useState<CandidateResult | null>(null);
  const [busy, setBusy] = useState(false), [scanning, setScanning] = useState(false), [saving, setSaving] = useState(false);
  const [error, setError] = useState(''), [scanError, setScanError] = useState(''), [notice, setNotice] = useState(''), [clearConsent, setClearConsent] = useState(false);
  const latest = useRef(rows), live = useRef(true), occupied = useRef(false), savingRef = useRef(false);
  const controller = useRef<AbortController | null>(null), scanController = useRef<AbortController | null>(null);
  const update = (next: DraftRow[]) => { latest.current = next; setRows(next); };
  useEffect(() => { live.current = true; return () => { live.current = false; controller.current?.abort(); scanController.current?.abort(); }; }, [api]);
  async function run(work: (signal: AbortSignal) => Promise<void>) {
    if (occupied.current || savingRef.current) return;
    occupied.current = true; const abort = new AbortController(); controller.current = abort; setBusy(true); setError('');
    try { await work(abort.signal); }
    catch (failure) { if (live.current && !abort.signal.aborted) setError(messageOf(failure)); }
    finally { occupied.current = false; if (live.current) setBusy(false); }
  }
  async function scan(id = grant) {
    if (!id) return;
    scanController.current?.abort(); const abort = new AbortController(); scanController.current = abort; setScanning(true); setScanError('');
    try { const result = await api.call('listCandidates', { grantId: id }, abort.signal); if (live.current && !abort.signal.aborted) setCandidates(result); }
    catch (failure) { if (live.current && !abort.signal.aborted) setScanError(messageOf(failure)); }
    finally { if (live.current && !abort.signal.aborted) setScanning(false); }
  }
  useEffect(() => { if (initialGrantId) void scan(initialGrantId); }, [api, initialGrantId]);
  async function add(paths: string[], grantId?: string) {
    const unique = [...new Set(paths.map(value => value.trim()).filter(Boolean))].filter(path => !latest.current.some(row => row.path === path));
    if (!unique.length) return;
    if (unique.length + latest.current.length > MAX_DOCUMENTS) { setError('每个对话最多绑定 16 份文档，请先移除多余项'); return; }
    if (unique.some(value => !/\.(md|markdown)$/i.test(value))) { setError('仅支持 .md 或 .markdown 文件，每行一个绝对路径'); return; }
    await run(async signal => {
      const next = [...latest.current]; let added = 0;
      for (const path of unique) {
        let accessId = grantId;
        try {
          if (!accessId) accessId = (await api.call('authorize', { path, kind: 'file', consent: true }, signal)).id;
          const preview = await api.call('previewDocument', { path, grantId: accessId, scope: DOCUMENT_SCOPE }, signal);
          if (signal.aborted || !live.current) return;
          if (next.some(row => (row.keep?.documentRealPath ?? row.preview?.path ?? row.path) === preview.path)) continue;
          const original = base.bindings.find(binding => binding.documentRealPath === preview.path);
          next.push({ key: original?.id ?? crypto.randomUUID(), path: preview.path, preview, original, grantId: accessId }); added++;
        } catch (failure) { if (signal.aborted || !live.current) return; next.push({ key: crypto.randomUUID(), path, grantId: accessId, error: messageOf(failure) }); }
      }
      if (live.current && !signal.aborted) { update(next); setInput(''); setConsent(false); setClearConsent(false); setNotice(added ? `已添加 ${added} 份到待确认清单` : '请处理读取失败的文档'); }
    });
  }
  async function authorize() {
    if (!consent || occupied.current || savingRef.current) return;
    if (kind !== 'directory') { await add(kind === 'file' ? [input] : input.split('\n')); return; }
    await run(async signal => {
      const access = await api.call('authorize', { path: input.trim(), kind: 'directory', consent: true }, signal);
      if (signal.aborted || !live.current) return;
      setGrant(access.id); setConsent(false); setInput(''); await scan(access.id);
    });
  }
  async function chooseFiles() {
    await run(async signal => { const result = await api.call('pickMarkdownFiles', { consent: true }, signal); if (!signal.aborted && live.current && !result.cancelled) { setKind('files'); setInput(result.paths.join('\n')); setConsent(false); } });
  }
  async function repreview(row: DraftRow, scope: TaskScope = rowScope(row)) {
    await run(async signal => {
      try {
        const accessId = row.preview?.grantId ?? row.keep?.grantId ?? row.grantId ?? (await api.call('authorize', { path: row.path, kind: 'file', consent: true }, signal)).id;
        const preview = await api.call('previewDocument', { path: row.path, grantId: accessId, scope }, signal);
        if (signal.aborted || !live.current) return;
        update(latest.current.map(item => item.key === row.key ? { key: row.key, path: preview.path, original: row.original, preview, grantId: accessId } : item));
        setNotice('预览已更新，确认后才改变监控范围');
      } catch (failure) { if (live.current && !signal.aborted) update(latest.current.map(item => item.key === row.key ? { ...item, error: messageOf(failure) } : item)); }
    });
  }
  const added = rows.filter(row => !row.original).length;
  const removed = base.bindings.filter(binding => !rows.some(row => row.original?.id === binding.id)).length;
  const scopeChanged = rows.filter(row => row.original && !sameScope(rowScope(row), row.original.scope)).length;
  const dirty = added + removed + scopeChanged > 0, errors = rows.filter(row => !!row.error).length;
  const remove = (key: string) => { if (occupied.current || savingRef.current) return; update(latest.current.filter(row => row.key !== key)); setClearConsent(false); setNotice('已从待确认清单移除，原绑定尚未更改'); };
  async function save() {
    if (savingRef.current || occupied.current || errors || !dirty || (!rows.length && !clearConsent)) return;
    savingRef.current = true; setSaving(true); setError('');
    try {
      const result = await api.call('confirmBindings', { previewIds: latest.current.flatMap(row => row.preview ? [row.preview.id] : []), keepBindingIds: latest.current.flatMap(row => row.keep ? [row.keep.id] : []), expectedBindingVersion: base.version });
      if (live.current) onBound(result);
    } catch (failure) { if (live.current) setError(messageOf(failure)); }
    finally { savingRef.current = false; if (live.current) setSaving(false); }
  }
  return { rows, kind, setKind, input, setInput, consent, setConsent, grant, candidates, scanning, scanError,
    busy, saving, error, notice, clearConsent, setClearConsent, added, removed, scopeChanged, dirty, errors,
    scan, add, authorize, chooseFiles, repreview, remove, save, hasBinding: base.bindings.length > 0 };
}
