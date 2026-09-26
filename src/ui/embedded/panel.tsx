import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { documentsOf, type ViewState } from '../../contracts/index.js';
import { summarizeDocuments } from '../../core/document-set.js';
import type { EmbeddedClient } from './client.js';
import { DocumentManager } from '../components/binding-picker/document-manager.js';
import { DocumentSetPanel } from '../components/task-panel/document-set-panel.js';
export function EmbeddedPanel({ client, initialGrantId }: { client: EmbeddedClient; initialGrantId?: string }) {
  const [view, setView] = useState<ViewState | null>(null), [connection, setConnection] = useState<string | undefined>();
  const [open, setOpen] = useState(false), [tab, setTab] = useState<'tasks' | 'documents'>('tasks'), [message, setMessage] = useState('');
  const trigger = useRef<HTMLButtonElement>(null), popup = useRef<HTMLDivElement>(null), titleId = useId();
  const progress = summarizeDocuments(view, !!connection), documents = documentsOf(view);
  useEffect(() => { const abort = new AbortController(); void client.watch(setView, setConnection, abort.signal); return () => abort.abort(); }, [client]);
  const close = (restoreFocus = true) => { popup.current?.hidePopover(); if (restoreFocus) trigger.current?.focus({ preventScroll: true }); };
  useEffect(() => {
    const node = popup.current!;
    const toggle = () => { const showing = node.matches(':popover-open'); setOpen(showing); if (!showing) { setTab('tasks'); setMessage(''); } };
    node.addEventListener('toggle', toggle);
    return () => { node.removeEventListener('toggle', toggle); if (node.matches(':popover-open')) node.hidePopover(); };
  }, [client]);
  useLayoutEffect(() => {
    if (!open || !popup.current || !trigger.current) return;
    const node = popup.current, button = trigger.current;
    const place = () => {
      const viewport = window.visualViewport, width = viewport?.width ?? innerWidth, height = viewport?.height ?? innerHeight;
      const ox = viewport?.offsetLeft ?? 0, oy = viewport?.offsetTop ?? 0, rect = button.getBoundingClientRect(), margin = 12, gap = 8;
      const availableAbove = rect.top - oy - margin - gap, availableBelow = oy + height - rect.bottom - margin - gap;
      const above = availableAbove >= Math.min(360, height * .55) || availableAbove >= availableBelow;
      const maxHeight = Math.max(48, Math.min(560, above ? availableAbove : availableBelow));
      node.style.width = `${Math.min(460, width - margin * 2)}px`; node.style.maxHeight = `${maxHeight}px`;
      const box = node.getBoundingClientRect();
      node.style.left = `${Math.max(ox + margin, Math.min(rect.left, ox + width - margin - box.width))}px`;
      node.style.top = `${Math.max(oy + margin, Math.min(above ? rect.top - gap - box.height : rect.bottom + gap, oy + height - margin - box.height))}px`;
    };
    const resize = new ResizeObserver(place); resize.observe(node); resize.observe(button);
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true); window.visualViewport?.addEventListener('resize', place);
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); } };
    document.addEventListener('keydown', escape, true); place();
    return () => { resize.disconnect(); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); window.visualViewport?.removeEventListener('resize', place); document.removeEventListener('keydown', escape, true); };
  }, [open]);
  function toggle() {
    if (!popup.current || !trigger.current) return;
    if (popup.current.matches(':popover-open')) close();
    else { popup.current.showPopover(); setOpen(true); requestAnimationFrame(() => popup.current?.querySelector<HTMLButtonElement>('[data-lens-close]')?.focus({ preventScroll: true })); }
  }
  function bound(next: ViewState) { setView(previous => previous && previous.bindingVersion > next.bindingVersion ? previous : next); setTab('tasks'); }
  async function openSource(bindingId: string, line: number) {
    if (!view) return;
    try { const result = await client.call('openSource', { expectedBindingVersion: view.bindingVersion, bindingId, line }); setMessage(result.opened ? '' : `请在编辑器中打开 ${result.path}:${line}`); }
    catch (failure) { setMessage(failure instanceof Error ? failure.message : '无法打开源文件'); }
  }
  return <>
    <button type="button" ref={trigger} className="lens-trigger" aria-label="展开任务清单" aria-haspopup="dialog" aria-expanded={open} aria-controls={titleId + '-popup'} title={`${progress.label}${progress.suffix ? ' · ' + progress.suffix : ''} · 点击查看任务文档`} onClick={toggle}>
      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m3 5 1.5 1.5L7 4M10 5h7M3 11h4m3 0h7M3 16h4m3 0h7" /></svg>
      <span>{progress.label}</span>{progress.warning && <span className="lens-trigger-warning" title={progress.suffix || '连接异常'} aria-label={progress.suffix || '连接异常'}>!</span>}
    </button>
    <div ref={popup} popover="auto" role="dialog" aria-modal="false" aria-labelledby={titleId} className="lens-embedded-shell" id={titleId + '-popup'} tabIndex={-1}>
      <header className="lens-popover-header"><h2 id={titleId}>任务清单</h2><span className="lens-total-count">{progress.hasData ? `${progress.completed}/${progress.total}${progress.suffix ? ' · ' + progress.suffix : ''}` : '尚未绑定'}</span><button type="button" data-lens-close aria-label="关闭任务清单" onClick={() => close()}>×</button></header>
      <div className="lens-popover-subhead"><span className="lens-thread-label">当前对话 · {client.monitor.kind === 'thread' ? client.monitor.threadId.slice(0, 8) : ''}</span><span>本地只读</span></div>
      <nav className="lens-tabs" aria-label="任务视图"><button type="button" aria-pressed={tab === 'tasks'} onClick={() => setTab('tasks')}>清单</button><button type="button" aria-pressed={tab === 'documents'} disabled={!view || !!connection} onClick={() => setTab('documents')}>文档{documents.length ? ` ${documents.length}` : ''}</button></nav>
      <div className="lens-embedded-body">
        {connection && <p className="lens-popover-warning" role="status">{connection}；当前计数可能为缓存。</p>}
        {message && <p role="alert" className="lens-popover-warning">{message}</p>}
        {tab === 'tasks' && open && <>{documents.length ? <DocumentSetPanel view={view} transportMessage={connection} onOpenSource={(id, line) => { void openSource(id, line); }} /> : <div className="lens-empty-binding"><span className="lens-empty-icon" aria-hidden="true">☷</span><strong>{view ? '添加你的任务文档' : '正在连接任务服务…'}</strong><p>绑定一份或多份 Markdown，随时查看已完成和未完成项。</p><button type="button" disabled={!view || !!connection} onClick={() => setTab('documents')}>绑定 Task 文档</button></div>}</>}
        {tab === 'documents' && view && open && <DocumentManager api={client} view={view} initialGrantId={view.binding?.grantId ?? initialGrantId} onBound={bound} onCancel={() => setTab('tasks')} />}
      </div>
      {tab === 'tasks' && <footer className="lens-popover-footer"><span>{documents.length ? `${documents.length} 份文档 · 自动同步` : '勾选数来自文档，不代表代码验收'}</span>{!!documents.length && <button type="button" disabled={!!connection} onClick={() => setTab('documents')}>管理文档</button>}</footer>}
    </div>
  </>;
}
