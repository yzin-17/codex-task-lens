import { useEffect, useMemo, useRef, useState } from 'react';
import { monitorKey, type MonitorRef, type MonitorSummary, type ViewState } from '../../contracts/index.js';
import { TaskPanel } from '../components/task-panel/task-panel.js';
import { BindingPicker } from '../components/binding-picker/binding-picker.js';
import { LocalClient } from './local-client.js';
import './app.css';
const initialMonitor: MonitorRef = { kind: 'standalone', id: 'local' };
const describe = (ref: MonitorRef) => ref.kind === 'standalone' ? `独立文档 · ${ref.id === 'local' ? '默认' : ref.id.slice(0, 8)}` : `手动查看对话 · ${ref.threadId.slice(0, 8)}`;
export function App({ token }: { token: string | null }) {
  const [selection, setSelection] = useState({ monitor: initialMonitor, generation: 0 });
  const selected = useRef(selection); selected.current = selection;
  const [view, setView] = useState<ViewState | null>(null), [monitors, setMonitors] = useState<MonitorSummary[]>([]), [picker, setPicker] = useState(false);
  const [connection, setConnection] = useState<string | undefined>(), [message, setMessage] = useState('');
  const api = useMemo(() => token ? new LocalClient(token, selection.monitor, selection.generation) : null, [token, selection]);
  useEffect(() => {
    if (!api) return;
    const abort = new AbortController(), generation = selection.generation; let version = -1;
    const current = () => !abort.signal.aborted && selected.current.generation === generation;
    setView(null); setConnection(undefined); setMessage('');
    void api.call('listMonitors', {}, abort.signal).then(result => { if (current()) setMonitors(result); }).catch(() => { if (current()) setMessage('暂时无法读取已保存的绑定'); });
    void api.watch(next => { if (current() && next.bindingVersion >= version) { version = next.bindingVersion; setView(next); } }, next => { if (current()) setConnection(next); }, abort.signal);
    return () => abort.abort();
  }, [api, selection]);
  function choose(monitor: MonitorRef) {
    const next = { monitor, generation: selected.current.generation + 1 }; selected.current = next;
    setView(null); setPicker(false); setMessage(''); setSelection(next);
  }
  function bound(next: ViewState) {
    if (next.generation !== selected.current.generation || monitorKey(next.monitor) !== monitorKey(selected.current.monitor)) return;
    setPicker(false); setView(previous => previous && previous.bindingVersion > next.bindingVersion ? previous : next);
    const generation = selected.current.generation;
    void api?.call('listMonitors', {}).then(result => { if (generation === selected.current.generation) setMonitors(result); }).catch(() => setMessage('绑定已保存；暂时无法刷新绑定列表'));
  }
  async function openSource(line: number) {
    if (!api || !view?.binding) return; const generation = selection.generation;
    try { const result = await api.call('openSource', { expectedBindingVersion: view.bindingVersion, line }); if (generation === selected.current.generation) setMessage(result.opened ? `已打开源文件；源位置第 ${result.line} 行。` : `当前平台不提供系统打开入口。请在编辑器中打开 ${result.path}:${result.line}`); }
    catch (error) { if (generation === selected.current.generation) setMessage(error instanceof Error ? error.message : '打开源文件失败'); }
  }
  const choices = [...monitors]; if (!choices.some(row => monitorKey(row.monitor) === monitorKey(selection.monitor))) choices.unshift({ monitor: selection.monitor, bindingVersion: 0, binding: null });
  return <main className="lens-app">
    <header className="lens-app-header"><div><p className="lens-eyebrow">TASK LENS / 任务透镜</p><h1>Codex Task Lens</h1><p>看清已经完成什么，还有什么待完成。</p></div><span className="lens-mode">本地只读 · 独立模式</span></header>
    {!token ? <section className="lens-onboarding"><h2>需要本次运行的访问凭证</h2><p>请使用启动器打开面板。访问凭证仅保留在当前页面内存中，刷新页面后需要重新打开。</p><p>本页面不会读取文件，直到你明确授权并绑定文档。</p></section> : <>
      <div className="lens-toolbar"><label>当前查看<select aria-label="当前查看" value={monitorKey(selection.monitor)} onChange={event => { const row = choices.find(item => monitorKey(item.monitor) === event.target.value); if (row) choose(row.monitor); }}>{choices.map(row => <option key={monitorKey(row.monitor)} value={monitorKey(row.monitor)}>{describe(row.monitor)}{row.binding ? ` · ${row.binding.displayPath.split('/').at(-1)}` : ''}</option>)}</select></label><button type="button" onClick={() => choose({ kind: 'standalone', id: crypto.randomUUID() })}>新增独立文档</button><button type="button" disabled={!view} onClick={() => { setPicker(true); setMessage(''); }}>{view?.binding ? '更换文档' : '选择文档'}</button></div>
      <p className="lens-manual-note">当前为手动查看，不代表 Codex 正在选中的对话。</p>
      {message && <p className="lens-notice" role="status">{message}</p>}
      {picker && api && view && <BindingPicker key={`${monitorKey(selection.monitor)}:${selection.generation}`} api={api} bindingVersion={view.bindingVersion} hasBinding={!!view.binding} initialGrantId={view.binding?.grantId} onBound={bound} onCancel={() => setPicker(false)} />}
      <TaskPanel key={`${monitorKey(selection.monitor)}:${view?.binding?.id ?? 'none'}`} view={view} transportMessage={connection} onOpenSource={line => { void openSource(line); }} />
      {view?.binding && <div className="lens-source-actions"><button type="button" onClick={() => { const location = `${view.binding!.displayPath}:1`; void navigator.clipboard.writeText(location).then(() => setMessage('已复制源路径与行号')).catch(() => setMessage(`请手动复制：${location}`)); }}>复制源路径与行号</button></div>}
    </>}
    <footer className="lens-app-footer">仅按 Task 文档展示清单；不执行任务，不修改勾选，不估算工作量。</footer>
  </main>;
}
