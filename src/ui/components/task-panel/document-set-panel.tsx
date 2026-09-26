import { documentsOf, type ViewState } from '../../../contracts/index.js';
import { TaskPanel } from './task-panel.js';
export function DocumentSetPanel({ view, transportMessage, onOpenSource }: { view: ViewState | null; transportMessage?: string; onOpenSource?: (bindingId: string, line: number) => void }) {
  const documents = documentsOf(view);
  if (!view || !documents.length) return <TaskPanel view={view} transportMessage={transportMessage} />;
  return <div className="lens-documents">{documents.map(({ binding, snapshot }) => <section className="lens-file-section" key={binding.id} aria-label={`文档 ${binding.displayPath.split('/').at(-1)}`}>
    <div className="lens-file-name" title={binding.displayPath}><span aria-hidden="true">▤</span><strong>{binding.displayPath.split('/').at(-1)}</strong><span>{snapshot?.status === 'ready' ? '已同步' : snapshot?.cached ? '缓存' : '待读取'}</span></div>
    <TaskPanel view={{ ...view, binding, snapshot, documents: undefined }} transportMessage={transportMessage} onOpenSource={line => onOpenSource?.(binding.id, line)} />
  </section>)}</div>;
}
