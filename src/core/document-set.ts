import { documentsOf, type ViewState } from '../contracts/index.js';
/** Checkbox totals only. No estimates or inferred completion. */
export function summarizeDocuments(view: ViewState | null, disconnected = false) {
  const documents = documentsOf(view);
  const known = documents.filter(item => !!item.snapshot?.tasks);
  const total = known.reduce((sum, item) => sum + item.snapshot!.tasks!.total, 0);
  const completed = known.reduce((sum, item) => sum + item.snapshot!.tasks!.completed, 0);
  const partial = known.length < documents.length;
  const stale = documents.some(item => item.snapshot?.cached || item.snapshot?.status !== 'ready');
  const warning = disconnected || stale;
  return { total, completed, partial, warning, hasData: known.length > 0, documents: documents.length,
    label: !documents.length ? '进度' : known.length ? `进度 ${completed}/${total}` : '进度 —',
    suffix: partial ? '部分' : warning ? '缓存' : '',
  };
}
