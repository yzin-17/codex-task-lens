import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { TaskPanel } from '../../../src/ui/components/task-panel/task-panel.js';
import type { ViewState, TaskItem } from '../../../src/contracts/index.js';
const monitor = { kind: 'standalone', id: 'fixture' } as const;
const items: TaskItem[] = [{ rowId: 'a', explicitId: 'T1', title: '读取任务文件', checked: true, line: 3, endLine: 4, groups: ['实施'], raw: '- [x] T1：读取任务文件\n  - 验证：通过', conflict: false }, { rowId: 'b', title: '检查更新', checked: false, line: 5, endLine: 6, groups: ['实施'], raw: '- [ ] 检查更新\n  - 状态：阻塞', status: 'blocked', conflict: false }, { rowId: 'c', title: '<img src="https://evil.invalid/pixel" onerror="alert(1)">', checked: false, line: 7, endLine: 7, groups: [], raw: '- [ ] [运行](javascript:alert(1)) <script>alert(1)</script>', conflict: false }];
const initial: ViewState = { monitor, generation: 0, bindingVersion: 1, connection: 'standalone', binding: { id: 'binding', monitor, grantId: 'grant', documentRealPath: '/fixture/tasks.md', displayPath: '/fixture/tasks.md', workspaceRealPath: '/fixture', scope: { kind: 'document' }, version: 1, confirmedAt: 0 }, snapshot: { monitor, bindingVersion: 1, revision: '1', status: 'ready', cached: false, lastReadAt: 1, lastTaskChangeAt: null, diagnostics: [], tasks: { title: '实施', items, total: 3, completed: 1, incomplete: 2, sections: [], diagnostics: [] } } };
function Harness() {
  const [view, setView] = useState(initial);
  function state(kind: 'empty' | 'complete' | 'missing' | 'update') {
    setView(previous => {
      const next = structuredClone(previous), snapshot = next.snapshot!;
      if (kind === 'missing') { snapshot.status = 'missing'; snapshot.cached = true; }
      else { snapshot.status = 'ready'; snapshot.cached = false; const nextItems = kind === 'empty' ? [] : kind === 'complete' ? items.map(item => ({ ...item, checked: true })) : items; snapshot.tasks = { ...snapshot.tasks!, items: nextItems, total: nextItems.length, completed: nextItems.filter(item => item.checked).length, incomplete: nextItems.filter(item => !item.checked).length }; }
      return next;
    });
  }
  return <><nav aria-label="测试状态"><button onClick={() => state('empty')}>零任务</button><button onClick={() => state('complete')}>全部勾选</button><button onClick={() => state('missing')}>源删除</button><button onClick={() => state('update')}>普通更新</button></nav><TaskPanel view={view} onOpenSource={() => undefined} /></>;
}
createRoot(document.getElementById('root')!).render(<Harness />);
