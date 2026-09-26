import { useState } from 'react';
import type { TaskItem, ViewState } from '../../../contracts/index.js';
import './task-panel.css';
const statusNames = { in_progress: '进行中', validating: '验证中', blocked: '阻塞' } as const;
const sourceNames = { loading: '正在读取文档', ready: '已同步', missing: '源文件不存在', permission_denied: '源文件授权或权限失效', unsupported: '文档格式或大小不受支持', scope_missing: '所选章节已变化，请重新选择', unstable: '文档正在写入，等待稳定', error: '源文件读取失败' } as const;
function TaskRow({ item, onOpenSource }: { item: TaskItem; onOpenSource?: (line: number) => void }) {
  return <li className="lens-task-row">
    <details>
      <summary>
        <span className={item.checked ? 'lens-check checked' : 'lens-check'} aria-hidden="true">{item.checked ? '✓' : '○'}</span>
        <span className="lens-task-title">{item.explicitId && <code>{item.explicitId}</code>} {item.title}</span>
        <span className="lens-task-state">{item.checked ? '已完成' : '未完成'}</span>
      </summary>
      <div className="lens-task-detail">
        {item.groups.length > 0 && <p className="lens-muted">分组：{item.groups.join(' / ')}</p>}
        <p>源位置：第 {item.line}–{item.endLine} 行</p>
        {item.status && <p>文档状态：{statusNames[item.status]}</p>}
        {item.conflict && <p className="lens-warning">文档状态冲突；勾选状态未被工具修改。</p>}
        <pre>{item.raw}</pre>
        {onOpenSource && <button type="button" onClick={() => onOpenSource(item.line)}>打开第 {item.line} 行的源文件</button>}
      </div>
    </details>
    {(item.status || item.conflict) && <div className="lens-task-badges">{item.status && <span>{statusNames[item.status]}</span>}{item.conflict && <span className="lens-warning">文档状态冲突</span>}</div>}
  </li>;
}
function TaskGroup({ title, items, onOpenSource }: { title: string; items: TaskItem[]; onOpenSource?: (line: number) => void }) {
  const [expanded, setExpanded] = useState(true);
  return <section className="lens-task-group" aria-label={title}>
    <h3><button type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}><span>{title} · {items.length}</span><span aria-hidden="true">{expanded ? '−' : '+'}</span></button></h3>
    {expanded && (items.length ? <ul>{items.map(item => <TaskRow key={item.rowId} item={item} onOpenSource={onOpenSource} />)}</ul> : <p className="lens-muted lens-group-empty">暂无{title}项</p>)}
  </section>;
}
export function TaskPanel({ view, transportMessage, onOpenSource }: { view: ViewState | null; transportMessage?: string; onOpenSource?: (line: number) => void }) {
  const snapshot = view?.snapshot, tasks = snapshot?.tasks;
  const unavailable = !!snapshot && snapshot.status !== 'ready';
  return <section className="lens-task-panel" aria-label="任务清单">
    <header className="lens-panel-heading"><h2>任务清单</h2><span className="lens-task-count" aria-live="polite">{tasks ? `${tasks.completed} / ${tasks.total} 已完成${snapshot?.cached || transportMessage ? ' · 缓存' : ''}` : '尚无任务数据'}</span></header>
    {transportMessage && <p className="lens-warning" role="status">{transportMessage}。当前内容仅供缓存查看。</p>}
    {!view && <p className="lens-muted">正在连接本地任务服务…</p>}
    {view && !view.binding && <p className="lens-muted">尚未绑定 Task 文档。请选择本地 Markdown 文件。</p>}
    {view?.binding && <div className="lens-document-meta"><p><span className="lens-muted">文档 </span><code>{view.binding.displayPath}</code></p><p className="lens-muted">{view.binding.scope.kind === 'document' ? '范围：整份文档' : `范围：${view.binding.scope.path.map(part => part.title).join(' / ')}`}</p></div>}
    {snapshot && <p className={unavailable ? 'lens-warning' : 'lens-muted'} role="status">{sourceNames[snapshot.status]}{snapshot.cached ? ' · 显示最近成功读取的缓存，非当前有效进度' : ''}</p>}
    {snapshot?.diagnostics.map((message, index) => <p className="lens-warning" key={`${index}:${message}`}>{message}</p>)}
    {tasks && <>
      {snapshot?.status === 'ready' && !transportMessage && tasks.total === 0 && <p className="lens-empty">所选范围没有任务清单</p>}
      {snapshot?.status === 'ready' && !transportMessage && tasks.total > 0 && tasks.completed === tasks.total && <p className="lens-complete">清单已全部勾选</p>}
      <TaskGroup title="未完成" items={tasks.items.filter(item => !item.checked)} onOpenSource={onOpenSource} />
      <TaskGroup title="已完成" items={tasks.items.filter(item => item.checked)} onOpenSource={onOpenSource} />
      <footer className="lens-muted"><p>最近任务变化：{snapshot?.lastTaskChangeAt ? <time dateTime={new Date(snapshot.lastTaskChangeAt).toISOString()}>{new Date(snapshot.lastTaskChangeAt).toLocaleString()}</time> : '尚未观察到变化'}</p><p>完成状态来自文档勾选，不代表代码已通过验收。</p></footer>
    </>}
  </section>;
}
