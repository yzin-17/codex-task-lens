import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { documentsOf, type ViewState } from '../../contracts/index.js';
import { summarizeDocuments } from '../../core/document-set.js';
import type { EmbeddedClient } from './client.js';
import { DocumentManager } from '../components/binding-picker/document-manager.js';
import { DocumentSetPanel } from '../components/task-panel/document-set-panel.js';
import { usePopover } from './use-popover.js';
import { useFloatingWindow } from './use-floating-window.js';
import { checkboxPercentage, type Rectangle } from './floating-geometry.js';
const viewportBounds = (): Rectangle => ({ left: 0, top: 0, width: innerWidth, height: innerHeight });
export function EmbeddedPanel({ client, initialGrantId, bounds = viewportBounds }: { client: EmbeddedClient; initialGrantId?: string; bounds?: () => Rectangle }) {
  const [view, setView] = useState<ViewState | null>(null), [connection, setConnection] = useState<string | undefined>();
  const [tab, setTab] = useState<'tasks' | 'documents' | 'settings'>('tasks'), [message, setMessage] = useState(''), [exitArmed, setExitArmed] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null), popup = useRef<HTMLDivElement>(null), titleId = useId();
  const progress = summarizeDocuments(view, !!connection), documents = documentsOf(view);
  useEffect(() => { const abort = new AbortController(); void client.watch(setView, setConnection, abort.signal); return () => abort.abort(); }, [client]);
  const { open, pinned, close, togglePin } = usePopover({ popup, trigger });
  const floating = useFloatingWindow({ popup, trigger, open, bounds });
  const percentage = checkboxPercentage(progress.completed, progress.total, progress.hasData && !progress.warning && !progress.partial);
  useEffect(() => { if (!open) { setTab('tasks'); setMessage(''); setExitArmed(false); } }, [open]);
  useLayoutEffect(() => { if (open) popup.current?.querySelector<HTMLButtonElement>('[data-lens-close]')?.focus({ preventScroll: true }); }, [open]);
  function bound(next: ViewState) { setView(previous => previous && previous.bindingVersion > next.bindingVersion ? previous : next); setTab('tasks'); }
  async function openSource(bindingId: string, line: number) {
    if (!view) return;
    try { const result = await client.call('openSource', { expectedBindingVersion: view.bindingVersion, bindingId, line }); setMessage(result.opened ? '' : `请在编辑器中打开 ${result.path}:${line}`); }
    catch (failure) { setMessage(failure instanceof Error ? failure.message : '无法打开源文件'); }
  }
  async function shutdown() {
    setMessage('正在退出 Task Lens…');
    try { await client.call('shutdown', { consent: true }); }
    catch (failure) { setMessage(failure instanceof Error ? failure.message : '无法退出 Task Lens'); setExitArmed(false); }
  }
  return <>
    <button type="button" ref={trigger} className="lens-trigger" aria-label="展开任务清单" aria-haspopup="dialog" aria-expanded={open} aria-controls={titleId + '-popup'} title={`${progress.label}${progress.suffix ? ' · ' + progress.suffix : percentage === null ? '' : ` · 勾选 ${Math.round(percentage)}%`} · 点击查看任务文档`} onClick={event => event.currentTarget.focus({ preventScroll: true })} popoverTarget={titleId + '-popup'} popoverTargetAction="toggle">
      <svg className="lens-progress-ring" data-percent={percentage === null ? 'unknown' : percentage} aria-hidden="true" width="16" height="16" viewBox="0 0 20 20" fill="none" strokeWidth="2">
        <circle className="lens-ring-track" cx="10" cy="10" r="7.5" />
        {percentage !== null && <circle className="lens-ring-value" cx="10" cy="10" r="7.5" pathLength="100" strokeDasharray={`${percentage} 100`} transform="rotate(-90 10 10)" />}
      </svg>
      <span>{progress.label}</span>{progress.warning && <span className="lens-trigger-warning" title={progress.suffix || '连接异常'} aria-label={progress.suffix || '连接异常'}>!</span>}
    </button>
    <div ref={popup} popover="manual" role="dialog" aria-modal="false" aria-labelledby={titleId} className="lens-embedded-shell" id={titleId + '-popup'} tabIndex={-1}>
      <header className="lens-popover-header" data-lens-drag-handle {...floating.dragHandlers}>
        <button type="button" data-lens-move aria-label="移动进度浮窗" title="拖动标题栏；此按钮支持方向键移动，Shift 加速" onKeyDown={floating.onKeyDown}><svg width="14" height="16" viewBox="0 0 14 16" aria-hidden="true" fill="currentColor"><circle cx="4" cy="4" r="1"/><circle cx="10" cy="4" r="1"/><circle cx="4" cy="8" r="1"/><circle cx="10" cy="8" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="10" cy="12" r="1"/></svg></button>
        <h2 id={titleId}>任务清单</h2><span className="lens-total-count">{progress.hasData ? `${progress.completed}/${progress.total}${progress.suffix ? ' · ' + progress.suffix : ''}` : documents.length ? '正在读取' : '尚未绑定'}</span>
        <button type="button" data-lens-pin aria-label={pinned ? '取消固定浮窗' : '固定浮窗'} title={pinned ? '已固定：点击页面不收起' : '固定后点击页面不收起'} aria-pressed={pinned} onClick={() => { floating.holdPosition(); togglePin(); }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M16 3H8l1 7-4 4v2h14v-2l-4-4zM12 16v5"/></svg></button>
        <button type="button" data-lens-close aria-label="关闭任务清单" onClick={() => close()}>×</button>
      </header>
      <div className="lens-popover-subhead"><span className="lens-thread-label">当前对话 · {client.monitor.kind === 'thread' ? client.monitor.threadId.slice(0, 8) : ''}</span><span>{pinned ? '已固定 · 可拖动' : '本地只读'}</span></div>
      <nav className="lens-tabs" aria-label="任务视图"><button type="button" aria-pressed={tab === 'tasks'} onClick={() => { setTab('tasks'); setExitArmed(false); }}>清单</button><button type="button" aria-pressed={tab === 'documents'} disabled={!view || !!connection} onClick={() => { setTab('documents'); setExitArmed(false); }}>文档{documents.length ? ` ${documents.length}` : ''}</button><button type="button" aria-pressed={tab === 'settings'} onClick={() => { setTab('settings'); setExitArmed(false); }}>设置</button></nav>
      <div className={tab === 'documents' ? 'lens-embedded-body lens-manager-body' : 'lens-embedded-body'}>
        {connection && <p className="lens-popover-warning" role="status">{connection}；当前计数可能为缓存。</p>}
        {message && <p role="alert" className="lens-popover-warning">{message}</p>}
        {tab === 'tasks' && open && <>{documents.length ? <DocumentSetPanel view={view} transportMessage={connection} onOpenSource={(id, line) => { void openSource(id, line); }} /> : <div className="lens-empty-binding"><span className="lens-empty-icon" aria-hidden="true">☷</span><strong>{view ? '添加你的任务文档' : '正在连接任务服务…'}</strong><p>绑定一份或多份 Markdown，随时查看已完成和未完成项。</p><button type="button" disabled={!view || !!connection} onClick={() => setTab('documents')}>绑定 Task 文档</button></div>}</>}
        {tab === 'documents' && view && open && <DocumentManager api={client} view={view} initialGrantId={view.binding?.grantId ?? initialGrantId} onBound={bound} onCancel={() => setTab('tasks')} />}
        {tab === 'settings' && open && <section className="lens-settings"><h3>后台 Agent</h3><p>退出只会停止 Task Lens 的 CDP 注入、文件监听和本地服务，不会关闭 Codex。之后再次双击 Codex Task Lens 即可重新启动。</p>{exitArmed ? <div className="lens-settings-actions"><button type="button" onClick={() => setExitArmed(false)}>取消</button><button type="button" className="lens-danger-button" disabled={!!connection} onClick={() => { void shutdown(); }}>确认退出</button></div> : <button type="button" className="lens-secondary-button" disabled={!!connection} onClick={() => setExitArmed(true)}>退出 Task Lens</button>}</section>}
      </div>
      {tab === 'tasks' && <footer className="lens-popover-footer"><span>{documents.length ? `${documents.length} 份文档 · 自动同步` : '勾选数来自文档，不代表代码验收'}</span>{!!documents.length && <button type="button" disabled={!!connection} onClick={() => setTab('documents')}>管理文档</button>}</footer>}
    </div>
  </>;
}
