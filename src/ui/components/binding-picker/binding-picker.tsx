import { useEffect, useRef, useState } from 'react';
import { DOCUMENT_SCOPE, type CandidateResult, type Grant, type Preview, type TaskScope, type ViewState } from '../../../contracts/index.js';
import type { LensClient } from '../../client.js';
import './binding-picker.css';
const messageOf = (error: unknown) => error instanceof Error ? error.message : '操作失败，请重试';
export function BindingPicker({ api, bindingVersion, hasBinding, initialGrantId, onBound, onCancel }: { api: Pick<LensClient, 'call'>; bindingVersion: number; hasBinding: boolean; initialGrantId?: string; onBound: (view: ViewState) => void; onCancel: () => void }) {
  const [baseVersion] = useState(bindingVersion);
  const [input, setInput] = useState(''), [kind, setKind] = useState<Grant['kind']>('file'), [consent, setConsent] = useState(false);
  const [grantId, setGrantId] = useState<string | undefined>(initialGrantId), [candidates, setCandidates] = useState<CandidateResult | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [saving, setSaving] = useState(false);
  const sequence = useRef(0), controller = useRef<AbortController | null>(null), live = useRef(true), savingRef = useRef(false);
  const selected = useRef<{ grantId: string; path: string } | null>(null);
  useEffect(() => { live.current = true; return () => { live.current = false; sequence.current++; controller.current?.abort(); }; }, [api]);
  function invalidate() { sequence.current++; controller.current?.abort(); setPreview(null); selected.current = null; setBusy(false); setError(''); }
  async function run<T>(work: (signal: AbortSignal) => Promise<T>, accept: (result: T) => void) {
    const current = ++sequence.current; controller.current?.abort(); const next = new AbortController(); controller.current = next;
    setBusy(true); setError('');
    try { const result = await work(next.signal); if (live.current && current === sequence.current) accept(result); }
    catch (failure) { if (live.current && current === sequence.current && !next.signal.aborted) setError(messageOf(failure)); }
    finally { if (live.current && current === sequence.current) setBusy(false); }
  }
  function choose(id: string, file: string, scope: TaskScope = DOCUMENT_SCOPE) {
    selected.current = { grantId: id, path: file }; setPreview(null);
    void run(signal => api.call('previewDocument', { grantId: id, path: file, scope }, signal), setPreview);
  }
  function authorize() {
    if (!consent || !input.trim() || savingRef.current) return;
    setPreview(null); selected.current = null; setCandidates(null);
    void run(async signal => {
      const grant = await api.call('authorize', { path: input.trim(), kind, consent: true }, signal);
      const result = kind === 'file' ? await api.call('previewDocument', { grantId: grant.id, path: grant.realPath, scope: DOCUMENT_SCOPE }, signal) : await api.call('listCandidates', { grantId: grant.id }, signal);
      return { grant, result };
    }, ({ grant, result }) => {
      setGrantId(grant.id);
      if ('candidates' in result) setCandidates(result);
      else { selected.current = { grantId: grant.id, path: grant.realPath }; setPreview(result); }
    });
  }
  function scanExisting() {
    if (!grantId) return; setPreview(null); selected.current = null;
    void run(signal => api.call('listCandidates', { grantId }, signal), setCandidates);
  }
  useEffect(() => {
    if (initialGrantId) {
      setGrantId(initialGrantId);
      void run(signal => api.call('listCandidates', { grantId: initialGrantId }, signal), setCandidates);
    }
  }, [api, initialGrantId]);
  async function save(clear = false) {
    if (savingRef.current || (!clear && !preview)) return;
    savingRef.current = true; setSaving(true); setError('');
    try {
      const view = clear ? await api.call('clearBinding', { expectedBindingVersion: baseVersion }) : await api.call('confirmBinding', { previewId: preview!.id, expectedBindingVersion: baseVersion });
      if (live.current) onBound(view);
    } catch (failure) { if (live.current) setError(messageOf(failure)); }
    finally { savingRef.current = false; if (live.current) setSaving(false); }
  }
  return <section className="lens-binding-picker" aria-label="选择 Task 文档">
    <header><h2>{hasBinding ? '更换 Task 文档' : '选择 Task 文档'}</h2><p>只读本地文件。先授权和预览，再确认绑定；不会上传文件。</p></header>
    <form onSubmit={event => { event.preventDefault(); authorize(); }}>
      <label>路径类型<select aria-label="路径类型" value={kind} disabled={saving} onChange={event => { invalidate(); setKind(event.target.value as Grant['kind']); setConsent(false); }}><option value="file">单个 Markdown 文件</option><option value="directory">项目目录</option></select></label>
      <label>本地绝对路径<input autoComplete="off" spellCheck={false} aria-label="本地绝对路径" value={input} placeholder={kind === 'file' ? '/Users/name/project/docs/tasks/example.md' : '/Users/name/project'} disabled={saving} onChange={event => { invalidate(); setInput(event.target.value); setConsent(false); }} /></label>
      <label className="lens-consent"><input type="checkbox" checked={consent} disabled={saving} onChange={event => setConsent(event.target.checked)} />授权读取以上{kind === 'file' ? '文件（不包含同目录其他文件）' : '目录内的 Markdown 文件'}</label>
      <div className="lens-picker-actions"><button type="submit" disabled={!consent || !input.trim() || busy || saving}>{kind === 'file' ? '授权并预览' : '授权并查找'}</button>{grantId && <button type="button" disabled={busy || saving} onClick={scanExisting}>扫描当前授权范围</button>}</div>
    </form>
    {busy && <p role="status">正在读取候选或预览…</p>}
    {error && <p className="lens-picker-error" role="alert">{error}。原绑定不会因失败而被清空。</p>}
    {candidates && <section aria-label="候选文档"><h3>发现的候选文档</h3>{candidates.incomplete && <p className="lens-picker-warning">扫描结果不完整，请缩小范围。</p>}{candidates.diagnostics.map((diagnostic, index) => <p className="lens-picker-warning" key={index}>{diagnostic}</p>)}{!candidates.candidates.length && <p>未发现候选。仍可输入具体文件路径。</p>}<ul className="lens-candidates">{candidates.candidates.map(candidate => <li key={candidate.id}><button type="button" disabled={saving} onClick={() => { if (grantId) choose(grantId, candidate.path); }}><strong>{candidate.title}</strong><span>{candidate.completed} / {candidate.total} 已完成</span><code>{candidate.path}</code><small>来源：{candidate.sources.join('、')}{candidate.workspace ? ` · 工作目录：${candidate.workspace}` : ''}</small></button></li>)}</ul></section>}
    {preview && <section className="lens-binding-preview" aria-label="绑定预览"><h3>绑定预览</h3><code>{preview.path}</code><label>计数范围<select aria-label="计数范围" disabled={saving} value={JSON.stringify(preview.scope)} onChange={event => { const option = [DOCUMENT_SCOPE, ...preview.tasks.sections.map(section => section.scope)].find(scope => JSON.stringify(scope) === event.target.value); const selection = selected.current; if (option && selection) choose(selection.grantId, selection.path, option); }}><option value={JSON.stringify(DOCUMENT_SCOPE)}>整份文档</option>{preview.tasks.sections.map((section, index) => <option key={index} value={JSON.stringify(section.scope)}>{section.label}</option>)}</select></label><p>{preview.tasks.completed} / {preview.tasks.total} 已完成；{preview.tasks.incomplete} 项未完成</p>{preview.tasks.total === 0 && <p>所选范围没有任务清单；仍可绑定并等待文档更新。</p>}<p className="lens-picker-hint">仅统计叶子勾选项，分组父项不重复计数。</p></section>}
    <footer className="lens-picker-actions"><button type="button" className="lens-primary" disabled={!preview || busy || saving} onClick={() => { void save(); }}>{saving ? '正在提交…' : hasBinding ? '确认更换绑定' : '确认绑定'}</button><button type="button" disabled={saving} onClick={() => { invalidate(); onCancel(); }}>取消</button>{hasBinding && <button type="button" className="lens-danger" disabled={saving} onClick={() => { void save(true); }}>解除当前绑定</button>}</footer>
  </section>;
}
