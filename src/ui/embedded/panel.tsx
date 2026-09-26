import { useEffect, useState } from 'react';
import type { ViewState } from '../../contracts/index.js';
import type { EmbeddedClient } from './client.js';
import { BindingPicker } from '../components/binding-picker/binding-picker.js';
import { TaskPanel } from '../components/task-panel/task-panel.js';
export function EmbeddedPanel({ client, initialGrantId }: { client: EmbeddedClient; initialGrantId?: string }) {
  const [view, setView] = useState<ViewState | null>(null), [error, setError] = useState<string | undefined>(), [picker, setPicker] = useState(false);
  useEffect(() => { const controller = new AbortController(); void client.watch(setView, setError, controller.signal); return () => controller.abort(); }, [client]);
  const tasks = view?.snapshot?.tasks;
  return <details className="lens-embedded-shell">
    <summary aria-label="展开任务清单">任务清单 <span>{tasks ? `${tasks.completed} / ${tasks.total} 已完成${error || view?.snapshot?.cached ? ' · 缓存' : ''}` : '尚未绑定'}</span></summary>
    <div className="lens-embedded-body">
      <p className="lens-thread-label">当前对话 · {client.monitor.kind === 'thread' ? client.monitor.threadId.slice(0, 8) : ''}</p>
      <TaskPanel view={view} transportMessage={error} onOpenSource={line => { if (view) void client.call('openSource', { expectedBindingVersion: view.bindingVersion, line }).then(result => { if (!result.opened) setError('未打开编辑器，可复制下方源文件路径'); }).catch(failure => setError(failure instanceof Error ? failure.message : '无法打开源文件')); }} />
      {view && !picker && <button type="button" disabled={!!error} onClick={() => setPicker(true)}>{view.binding ? '更换文档' : '绑定 Task 文档'}</button>}
      {picker && view && <BindingPicker key={`${client.identity.generation}:${view.monitor.kind === 'thread' ? view.monitor.threadId : ''}`} api={client} bindingVersion={view.bindingVersion} hasBinding={!!view.binding} initialGrantId={view.binding?.grantId ?? initialGrantId} onBound={next => { setView(next); setPicker(false); }} onCancel={() => setPicker(false)} />}
      {view?.binding && <button type="button" onClick={() => { void navigator.clipboard.writeText(`${view.binding!.displayPath}:1`).catch(() => setError('剪贴板不可用，请手动复制文档路径')); }}>复制源路径</button>}
    </div>
  </details>;
}
