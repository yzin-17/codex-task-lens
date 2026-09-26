import { useEffect, useRef, useState } from 'react';
import { DOCUMENT_SCOPE, MAX_DOCUMENTS, documentsOf, type Binding, type CandidateResult, type Preview, type TaskScope, type ViewState } from '../../../contracts/index.js';
import type { LensClient } from '../../client.js';
import './document-manager.css';
type Row = { key: string; path: string; keep?: Binding; preview?: Preview; error?: string };
const messageOf = (error: unknown) => error instanceof Error ? error.message : '操作失败，请重试';
export function DocumentManager({ api, view, initialGrantId, onBound, onCancel }: { api: Pick<LensClient, 'call'>; view: ViewState; initialGrantId?: string; onBound: (view: ViewState) => void; onCancel: () => void }) {
  const [baseVersion] = useState(view.bindingVersion);
  const [rows, setRows] = useState<Row[]>(() => documentsOf(view).map(({ binding }) => ({ key: binding.id, path: binding.displayPath, keep: binding })));
  const [kind, setKind] = useState<'file' | 'files' | 'directory'>('files'), [input, setInput] = useState(''), [consent, setConsent] = useState(false);
  const [grant, setGrant] = useState(initialGrantId), [candidates, setCandidates] = useState<CandidateResult | null>(null);
  const [busy, setBusy] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState(''), [clearConsent, setClearConsent] = useState(false);
  const controller = useRef<AbortController | null>(null), epoch = useRef(0), live = useRef(true), savingRef = useRef(false);
  const latest = useRef(rows); latest.current = rows;
  useEffect(() => { live.current = true; return () => { live.current = false; epoch.current++; controller.current?.abort(); }; }, [api]);
  async function run(work: (signal: AbortSignal) => Promise<void>) {
    const id = ++epoch.current; controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    setBusy(true); setError('');
    try { await work(abort.signal); } catch (failure) { if (live.current && id === epoch.current && !abort.signal.aborted) setError(messageOf(failure)); }
    finally { if (live.current && id === epoch.current) setBusy(false); }
  }
  const scan = (id: string) => run(async signal => { const found = await api.call('listCandidates', { grantId: id }, signal); if (!signal.aborted && live.current) setCandidates(found); });
  useEffect(() => { if (initialGrantId) void scan(initialGrantId); }, [api, initialGrantId]);
  async function add(paths: string[], grantId?: string) {
    const unique = [...new Set(paths.map(value => value.trim()).filter(Boolean))];
    if (!unique.length) return;
    if (unique.length + rows.length > MAX_DOCUMENTS) { setError('每个对话最多绑定 16 份文档，请先移除多余项'); return; }
    if (unique.some(value => !/\.(md|markdown)$/i.test(value))) { setError('仅支持 .md 或 .markdown 文件，每行一个绝对路径'); return; }
    await run(async signal => {
      const next = [...latest.current];
      for (const path of unique) {
        if (next.some(row => row.path === path)) continue;
        try {
          const access = grantId ? { id: grantId } : await api.call('authorize', { path, kind: 'file', consent: true }, signal);
          const preview = await api.call('previewDocument', { path, grantId: access.id, scope: DOCUMENT_SCOPE }, signal);
          if (signal.aborted) return;
          if (!next.some(row => (row.keep?.documentRealPath ?? row.preview?.path ?? row.path) === preview.path)) next.push({ key: crypto.randomUUID(), path: preview.path, preview });
        } catch (failure) { if (signal.aborted) return; next.push({ key: crypto.randomUUID(), path, error: messageOf(failure) }); }
      }
      if (live.current && !signal.aborted) { latest.current = next; setRows(next); setInput(''); setConsent(false); }
    });
  }
  async function authorize() {
    if (!consent || busy || saving) return;
    if (kind !== 'directory') { await add(kind === 'file' ? [input] : input.split('\n')); return; }
    await run(async signal => {
      const access = await api.call('authorize', { path: input.trim(), kind: 'directory', consent: true }, signal);
      const found = await api.call('listCandidates', { grantId: access.id }, signal);
      if (!signal.aborted && live.current) { setGrant(access.id); setCandidates(found); }
    });
  }
  async function chooseFiles() {
    await run(async signal => { const result = await api.call('pickMarkdownFiles', { consent: true }, signal); if (!signal.aborted && live.current && !result.cancelled) { setKind('files'); setInput(result.paths.join('\n')); setConsent(false); } });
  }
  async function repreview(row: Row, scope: TaskScope = row.preview?.scope ?? DOCUMENT_SCOPE) {
    await run(async signal => {
      const access = row.preview ? { id: row.preview.grantId } : await api.call('authorize', { path: row.path, kind: 'file', consent: true }, signal);
      const preview = await api.call('previewDocument', { path: row.path, grantId: access.id, scope }, signal);
      if (!signal.aborted && live.current) setRows(items => items.map(item => item.key === row.key ? { key: row.key, path: preview.path, preview } : item));
    });
  }
  async function save() {
    if (savingRef.current || busy || rows.some(row => !!row.error) || (!rows.length && !clearConsent)) return;
    savingRef.current = true; setSaving(true); setError('');
    try {
      const result = await api.call('confirmBindings', { previewIds: rows.flatMap(row => row.preview ? [row.preview.id] : []), keepBindingIds: rows.flatMap(row => row.keep ? [row.keep.id] : []), expectedBindingVersion: baseVersion });
      if (live.current) onBound(result);
    } catch (failure) { if (live.current) setError(messageOf(failure)); }
    finally { savingRef.current = false; if (live.current) setSaving(false); }
  }
  return <section className="lens-document-manager" aria-label="选择 Task 文档">
    <div className="lens-add-heading"><span>添加 Markdown</span><button type="button" disabled={busy || saving} onClick={() => { void chooseFiles(); }}>选择文件…</button></div>
    <p className="lens-muted">可多选，先授权预览，再确认绑定。只读，不上传。</p>
    <form onSubmit={event => { event.preventDefault(); void authorize(); }}>
      <label className="lens-mode-select">路径类型<select aria-label="路径类型" disabled={busy || saving} value={kind} onChange={event => { setKind(event.target.value as typeof kind); setConsent(false); setInput(''); }}><option value="files">多个 Markdown 文件</option><option value="file">单个 Markdown 文件</option><option value="directory">项目目录 · 查找候选</option></select></label>
      <label>{kind === 'files' ? '本地绝对路径（每行一个）' : '本地绝对路径'}{kind === 'files' ? <textarea aria-label="本地绝对路径" spellCheck={false} rows={3} value={input} disabled={busy || saving} placeholder={'/Users/name/project/docs/tasks/a.md\n/Users/name/project/docs/tasks/b.md'} onChange={event => { setInput(event.target.value); setConsent(false); }} /> : <input aria-label="本地绝对路径" autoComplete="off" value={input} disabled={busy || saving} placeholder={kind === 'directory' ? '/Users/name/project' : '/Users/name/project/docs/tasks/a.md'} onChange={event => { setInput(event.target.value); setConsent(false); }} />}</label>
      <label className="lens-consent"><input type="checkbox" checked={consent} disabled={busy || saving} onChange={event => setConsent(event.target.checked)} />{kind === 'directory' ? '授权读取此目录内的 Markdown' : '授权读取以上文件，不扩展到父目录'}</label>
      <button type="submit" disabled={!consent || !input.trim() || busy || saving}>{kind === 'directory' ? '授权并查找' : '授权并预览'}</button>
    </form>
    {busy && <p role="status">正在读取文档或等待文件选择…</p>}
    {error && <p role="alert" className="lens-manager-error">{error}；原绑定保持不变。</p>}
    {candidates && <section className="lens-manager-candidates" aria-label="候选文档"><h3>可添加的文档</h3>{candidates.incomplete && <p className="lens-manager-error">扫描结果不完整，请缩小范围。</p>}{candidates.diagnostics.map((text, i) => <p key={i} className="lens-muted">{text}</p>)}{candidates.candidates.map(candidate => <button type="button" key={candidate.id} disabled={busy || saving || rows.some(row => row.path === candidate.path)} onClick={() => { if (grant) void add([candidate.path], grant); }}><span>{candidate.title}</span><small>{candidate.completed}/{candidate.total} · 来源：{candidate.sources.join('、')}</small><code>{candidate.path}</code></button>)}</section>}
    {rows.length > 0 && <section aria-label="绑定预览"><h3>绑定文档 <span>{rows.length}/{MAX_DOCUMENTS}</span></h3><ul className="lens-draft-files">{rows.map(row => <li key={row.key}>
      <div className="lens-draft-title"><strong title={row.path}>{row.path.split('/').at(-1)}</strong><span>{row.keep ? '已绑定' : row.preview ? `${row.preview.tasks.completed}/${row.preview.tasks.total}` : '读取失败'}</span><button type="button" aria-label={`移除 ${row.path.split('/').at(-1)}`} disabled={busy || saving} onClick={() => { setRows(items => items.filter(item => item.key !== row.key)); setClearConsent(false); }}>×</button></div>
      <code title={row.path}>{row.path}</code>
      {row.error && <p role="alert" className="lens-manager-error">{row.error}</p>}
      {!row.keep && <div className="lens-scope-row"><label>范围<select aria-label={`计数范围 ${row.path.split('/').at(-1)}`} disabled={busy || saving || !row.preview} value={JSON.stringify(row.preview?.scope ?? DOCUMENT_SCOPE)} onChange={event => { const scope = [DOCUMENT_SCOPE, ...(row.preview?.tasks.sections.map(section => section.scope) ?? [])].find(item => JSON.stringify(item) === event.target.value); if (scope) void repreview(row, scope); }}><option value={JSON.stringify(DOCUMENT_SCOPE)}>整份文档</option>{row.preview?.tasks.sections.map((section, i) => <option key={i} value={JSON.stringify(section.scope)}>{section.label}</option>)}</select></label><button type="button" disabled={busy || saving} onClick={() => { void repreview(row); }}>重新预览</button></div>}
    </li>)}</ul></section>}
    {!rows.length && view.binding && <label className="lens-consent"><input type="checkbox" checked={clearConsent} disabled={saving} onChange={event => setClearConsent(event.target.checked)} />确认解除此对话的全部文档绑定</label>}
    <footer className="lens-manager-footer"><button type="button" disabled={saving} onClick={onCancel}>取消</button><button className="lens-primary" type="button" disabled={busy || saving || rows.some(row => !!row.error) || (!rows.length && !clearConsent)} onClick={() => { void save(); }}>{saving ? '提交中…' : !rows.length && view.binding ? '确认解除全部绑定' : view.binding ? '确认更改' : '确认绑定'}</button></footer>
  </section>;
}
