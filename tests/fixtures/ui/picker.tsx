import { useMemo, useState } from 'react';
import { BindingPicker } from '../../../src/ui/components/binding-picker/binding-picker.js';
import type { LensClient } from '../../../src/ui/client.js';
import { LensError, type Operation, type Params, type Results, type TaskScope, type ViewState } from '../../../src/contracts/index.js';
const scope: TaskScope = { kind: 'section', path: [{ depth: 1, title: '实施', ordinal: 1, total: 1 }] };
const view: ViewState = { monitor: { kind: 'standalone', id: 'fixture' }, generation: 0, bindingVersion: 1, binding: null, snapshot: null, connection: 'standalone' };
export function PickerHarness() {
  const [commits, setCommits] = useState(0), [result, setResult] = useState('未提交'), [epoch, setEpoch] = useState(0), [conflict, setConflict] = useState(false);
  const api = useMemo<Pick<LensClient, 'call'>>(() => ({ async call<K extends Operation>(operation: K, params: Params[K]): Promise<Results[K]> {
    let value: unknown;
    if (operation === 'authorize') { const p = params as Params['authorize']; if (p.path.includes('denied')) throw new LensError('permission_denied', '授权被拒绝'); value = { id: 'grant', kind: p.kind, realPath: p.path, displayPath: p.path }; }
    else if (operation === 'listCandidates') value = { incomplete: true, checked: 2, diagnostics: [], candidates: ['slow', 'fast'].map(name => ({ id: name, title: `${name} 文档`, path: `/fixture/${name}.md`, workspace: '/fixture', sources: ['目录扫描'], total: 2, completed: 1, diagnostics: [] })) };
    else if (operation === 'previewDocument') { const p = params as Params['previewDocument']; await new Promise(resolve => setTimeout(resolve, p.path.includes('slow') ? 500 : 20)); value = { id: p.path, grantId: p.grantId, path: p.path, scope: p.scope, expiresAt: Date.now() + 300000, tasks: { title: p.path, items: [], total: p.scope.kind === 'section' ? 1 : 2, completed: 1, incomplete: p.scope.kind === 'section' ? 0 : 1, sections: [{ label: '实施', scope, line: 1, endLine: 5 }], diagnostics: [] } }; }
    else if (operation === 'confirmBinding' || operation === 'clearBinding') { if (conflict) throw new LensError('conflict', '绑定已被另一窗口更新'); setCommits(count => count + 1); await new Promise(resolve => setTimeout(resolve, 80)); value = view; }
    else throw new Error('Unsupported fixture operation');
    return value as Results[K];
  } }), [conflict]);
  return <><nav><button onClick={() => { setEpoch(value => value + 1); setResult('已切换'); }}>切换视图</button><button onClick={() => setConflict(value => !value)}>模拟版本冲突</button></nav><output data-testid="commits">{commits}</output><output data-testid="picker-result">{result}</output><BindingPicker key={epoch} api={api} bindingVersion={1} hasBinding onCancel={() => setResult('已取消')} onBound={() => setResult('已提交')} /></>;
}
