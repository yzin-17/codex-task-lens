import { expect, it } from 'vitest';
import { documentLabels } from '../../src/ui/components/binding-picker/document-labels.js';
import { scopeTitle, scopeTrail } from '../../src/ui/components/binding-picker/scope-picker.js';
import { sameScope } from '../../src/ui/components/binding-picker/use-document-draft.js';
import type { TaskScope } from '../../src/contracts/index.js';
it('uses basenames normally and the shortest unique suffix for duplicate filenames', () => {
  const paths = ['/one/tasks/a.md', '/two/tasks/a.md', '/one/tasks/b.md'];
  expect([...documentLabels(paths).values()]).toEqual(['one/tasks/a.md', 'two/tasks/a.md', 'b.md']);
});
it('does not merge filenames that contain spaces or Unicode', () => {
  expect([...documentLabels(['/one/任务 清单.md', '/two/任务 清单.md']).values()]).toEqual(['one/任务 清单.md', 'two/任务 清单.md']);
});
const scope: TaskScope = { kind: 'section', path: [{ depth: 1, title: '很长的文档标题', ordinal: 1, total: 1 }, { depth: 2, title: '接口验证', ordinal: 1, total: 2 }] };
it('shows a concise scope label without discarding the complete breadcrumb', () => {
  expect(scopeTitle(scope)).toBe('接口验证'); expect(scopeTrail(scope)).toBe('很长的文档标题 / 接口验证'); expect(scopeTitle({ kind: 'document' })).toBe('整份文档');
});
it('compares scope identity including duplicate-heading ordinal, not just its label', () => {
  expect(sameScope(scope, structuredClone(scope))).toBe(true);
  const changed = structuredClone(scope); changed.path[1]!.ordinal = 2;
  expect(sameScope(scope, changed)).toBe(false);
});
