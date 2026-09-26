import { useLayoutEffect, useRef, useState } from 'react';
import { documentsOf, type ViewState } from '../../../contracts/index.js';
import type { LensClient } from '../../client.js';
import { useDocumentDraft, rowScope, sameScope } from './use-document-draft.js';
import { PathModes } from './path-modes.js';
import { ScopePicker } from './scope-picker.js';
import { documentLabels } from './document-labels.js';
import './document-manager.css';
export function DocumentManager({ api, view, initialGrantId, onBound, onCancel }: { api: Pick<LensClient, 'call'>; view: ViewState; initialGrantId?: string; onBound: (view: ViewState) => void; onCancel: () => void }) {
  const draft = useDocumentDraft(api, view, initialGrantId, onBound);
  const { rows, busy, saving } = draft;
  const [page, setPage] = useState<'add' | 'manage'>('add');
  const scroller = useRef<HTMLDivElement>(null), positions = useRef({ add: 0, manage: 0 });
  const targetRow = useRef<string | null>(null), rowElements = useRef(new Map<string, HTMLLIElement>()), pathInput = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const names = documentLabels(rows.map(row => row.path));
  function navigate(next: 'add' | 'manage', key?: string) {
    positions.current[page] = scroller.current?.scrollTop ?? 0; targetRow.current = key ?? null; setPage(next);
    if (next === page && key) reveal(key);
  }
  function reveal(key: string) {
    const row = rowElements.current.get(key), container = scroller.current;
    if (!row || !container) return;
    const rect = row.getBoundingClientRect(), viewport = container.getBoundingClientRect();
    container.scrollTop += rect.top - viewport.top - 8; row.focus({ preventScroll: true });
  }
  useLayoutEffect(() => { if (scroller.current) scroller.current.scrollTop = positions.current[page]; if (targetRow.current) { reveal(targetRow.current); targetRow.current = null; } }, [page]);
  function focusDirectory() { draft.setKind('directory'); draft.setInput(''); requestAnimationFrame(() => pathInput.current?.focus({ preventScroll: true })); }
  const changes = `新增 ${draft.added} 份，移除 ${draft.removed} 份${draft.scopeChanged ? `，范围更改 ${draft.scopeChanged} 份` : ''}`;
  const locked = busy || saving;
  return <section className="lens-document-manager" aria-label="选择 Task 文档" data-page={page}>
    <header className="lens-selected-summary" aria-label="已选摘要">
      <div className="lens-selected-heading"><strong>已选 {rows.length} 份</strong><span className="lens-draft-state">{draft.dirty ? '有未确认更改' : draft.hasBinding ? '已绑定' : '尚未添加'}</span>
        <button type="button" className="lens-text-button" aria-label={page === 'add' ? '管理已选文档' : '返回添加文档'} onClick={() => navigate(page === 'add' ? 'manage' : 'add')}>{page === 'add' ? '管理 ›' : '‹ 返回添加'}</button>
      </div>
      <div className="lens-selected-chips">{rows.slice(0, 2).map(row => <button type="button" key={row.key} title={row.path} aria-label={`查看已选 ${names.get(row.path)}`} data-pending={!row.original || !sameScope(rowScope(row), row.original.scope)} onClick={() => navigate('manage', row.key)}>{names.get(row.path)}</button>)}
        {rows.length > 2 && <button type="button" aria-label={`查看其余 ${rows.length - 2} 份文档`} onClick={() => navigate('manage', rows[2]!.key)}>+{rows.length - 2}</button>}
        {!rows.length && <span className="lens-muted">添加后在这里查看，不影响已保存进度</span>}
        {!!draft.errors && <button type="button" className="lens-error-chip" onClick={() => navigate('manage', rows.find(row => !!row.error)!.key)}>{draft.errors} 份需处理</button>}
      </div>
    </header>
    <div className="lens-manager-scroll" ref={scroller}>
      {page === 'add' && <>
        <section className="lens-manager-candidates" aria-label="候选文档">
          <div className="lens-section-heading"><h3>可添加文档</h3><button type="button" className="lens-text-button" disabled={!draft.grant || draft.scanning || locked} onClick={() => { void draft.scan(); }}>{draft.scanning ? '扫描中…' : '重新扫描'}</button></div>
          <p className="lens-muted">优先显示当前对话线索，仅扫描已授权范围。</p>
          {!draft.grant && <div className="lens-candidate-empty">还没有可扫描的授权范围。<button type="button" className="lens-text-button" onClick={focusDirectory} disabled={locked}>授权项目目录</button><span>也可在下方直接添加文件。</span></div>}
          {draft.scanError && <p role="alert" className="lens-manager-error">扫描不可用：{draft.scanError}。仍可手动添加。</p>}
          {draft.candidates?.incomplete && <p className="lens-manager-error">扫描结果不完整，请缩小范围。</p>}
          {draft.candidates?.diagnostics.map((text, i) => <p key={i} className="lens-muted">{text}</p>)}
          {draft.candidates && !draft.candidates.candidates.length && !draft.scanning && <p className="lens-muted">未找到可添加清单，可在下方输入具体路径。</p>}
          {draft.candidates?.candidates.map(candidate => {
            const selected = rows.some(row => row.path === candidate.path);
            return <article className="lens-candidate" key={candidate.id} data-selected={selected}>
              <div><strong title={candidate.title}>{candidate.path.split('/').at(-1)}</strong><span>{candidate.completed}/{candidate.total}</span><button type="button" disabled={selected || locked} aria-label={`${selected ? '已选' : '添加'} ${candidate.title} 来源：${candidate.sources.join('、')}`} onClick={() => { if (draft.grant) void draft.add([candidate.path], draft.grant); }}>{selected ? '✓ 已选' : '添加'}</button></div>
              <code title={candidate.path}>{candidate.workspace && candidate.path.startsWith(candidate.workspace + '/') ? candidate.path.slice(candidate.workspace.length + 1) : candidate.path}</code><small>来源：{candidate.sources.join('、')}</small>
            </article>;
          })}
        </section>
        <section className="lens-manual-add" aria-label="手动添加">
          <div className="lens-section-heading"><h3>手动添加</h3><button type="button" disabled={locked} onClick={() => { void draft.chooseFiles(); }}>选择文件…</button></div>
          <form onSubmit={event => { event.preventDefault(); void draft.previewInput(); }}>
            <PathModes value={draft.kind} disabled={locked} onChange={value => { if (value !== draft.kind) { draft.setKind(value); draft.setInput(''); } }} />
            <label>{draft.kind === 'files' ? '本地绝对路径（每行一个）' : '本地绝对路径'}{draft.kind === 'files'
              ? <textarea ref={node => { pathInput.current = node; }} aria-label="本地绝对路径" spellCheck={false} rows={3} value={draft.input} disabled={locked} placeholder={'/Users/name/project/docs/tasks/a.md\n/Users/name/project/docs/tasks/b.md'} onChange={event => { draft.setInput(event.target.value); }} />
              : <input ref={node => { pathInput.current = node; }} aria-label="本地绝对路径" autoComplete="off" value={draft.input} disabled={locked} placeholder="/Users/name/project" onChange={event => { draft.setInput(event.target.value); }} />}</label>
            <p className="lens-muted lens-read-hint">{draft.kind === 'directory' ? '点击查找，仅扫描此目录内的 Markdown。' : '支持一个或多个文件；点击预览，仅只读所列路径。'}</p>
            <button type="submit" disabled={!draft.input.trim() || locked}>{draft.kind === 'directory' ? '查找文档' : '预览文件'}</button>
          </form>
        </section>
      </>}
      {page === 'manage' && <section aria-label="绑定预览" className="lens-selected-list">
        <div className="lens-section-heading"><h3>已选文档</h3><span className="lens-muted">{rows.length}/16</span></div>
        {!rows.length && <p className="lens-muted">尚未选择文档，请返回添加。</p>}
        <ul className="lens-draft-files">{rows.map(row => {
          const tasks = row.preview?.tasks ?? documentsOf(view).find(item => item.binding.id === row.original?.id)?.snapshot?.tasks;
          const status = row.error ? '需处理' : !row.original ? '待确认' : !sameScope(rowScope(row), row.original.scope) ? '范围待确认' : '已绑定';
          return <li key={row.key} tabIndex={-1} ref={node => { if (node) rowElements.current.set(row.key, node); else rowElements.current.delete(row.key); }}>
            <div className="lens-draft-title"><strong title={row.path}>{names.get(row.path)}</strong><span className={row.error ? 'lens-manager-error' : ''}>{status}</span><span>{tasks ? `${tasks.completed}/${tasks.total}` : '—'}</span><button type="button" aria-label={`移除 ${names.get(row.path)}`} disabled={locked} onClick={() => draft.remove(row.key)}>×</button></div>
            <code title={row.path}>{row.path}</code>
            {row.error && <p role="alert" className="lens-manager-error">{row.error}</p>}
            <div className="lens-scope-row"><span className="lens-muted">范围</span><ScopePicker label={`计数范围 ${names.get(row.path)}`} value={rowScope(row)} sections={tasks?.sections ?? []} disabled={locked || !tasks || !!row.error} onChange={scope => { void draft.repreview(row, scope); }} />
              <button type="button" className="lens-text-button" disabled={locked} onClick={() => { void draft.repreview(row); }}>重新预览</button></div>
          </li>;
        })}</ul>
      </section>}
    </div>
    <footer className="lens-manager-footer">
      {draft.error && <p role="alert" className="lens-manager-error lens-manager-global-error">{draft.error}；原绑定保持不变。</p>}
      <span className="lens-sr-only" role="status" aria-live="polite">{draft.notice}</span>
      {busy && <p className="lens-muted" role="status">正在读取文档或等待文件选择…</p>}
      {!rows.length && draft.hasBinding && <label className="lens-consent"><input type="checkbox" checked={draft.clearConsent} disabled={locked} onChange={event => draft.setClearConsent(event.target.checked)} />确认解除此对话的全部文档绑定</label>}
      <div className="lens-confirm-bar"><span className="lens-change-summary">{draft.dirty ? changes : draft.hasBinding ? '尚无更改' : '选择并预览后确认'}{draft.errors ? ` · ${draft.errors} 份需处理` : ''}</span><div>
        <button type="button" disabled={saving} onClick={onCancel}>取消</button>
        <button className="lens-primary" type="button" disabled={locked || !!draft.errors || !draft.dirty || (!rows.length && !draft.clearConsent)} onClick={() => { void draft.save(); }}>{saving ? '提交中…' : !rows.length && draft.hasBinding ? '确认解除' : draft.hasBinding ? '确认更改' : '确认绑定'}</button>
      </div></div>
    </footer>
  </section>;
}
