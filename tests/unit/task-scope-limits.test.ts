import { expect, it } from 'vitest';
import { parseTasks } from '../../src/core/task-parser.js';
import { parseScope } from '../../src/contracts/index.js';
it('handles thousands of duplicate sibling scopes without merging their tasks', () => {
  const source = Array.from({ length: 2000 }, (_, index) => `## 重复\n- [ ] 工作 ${index}\n`).join('');
  const parsed = parseTasks(source); expect(parsed.total).toBe(2000); expect(parsed.sections).toHaveLength(2000);
  const scope = parsed.sections[1234]!.scope; expect(parseScope(scope)).toEqual(scope); expect(parseTasks(source, scope).items[0]?.title).toBe('工作 1234');
});
it('bounds heading count and title length rather than returning scopes the protocol cannot accept', () => {
  expect(() => parseTasks('# ' + 'a'.repeat(513))).toThrow('512');
  expect(() => parseTasks('# h\n'.repeat(10001))).toThrow('10000');
});
