import { expect, it } from 'vitest';
import { parseTasks } from '../../src/core/task-parser.js';
it('rejects repeated huge group labels before a small file amplifies into an oversized snapshot', () => {
  const source = '- [ ] ' + 'group'.repeat(20000) + '\n' + '  - [ ] child\n'.repeat(200);
  expect(Buffer.byteLength(source)).toBeLessThan(2 * 1024 * 1024);
  expect(() => parseTasks(source)).toThrow('解析后的任务数据超过安全大小限制');
});
it('bounds source line count before constructing a very large Markdown tree', () => { expect(() => parseTasks('# heading\n'.repeat(50001))).toThrow('50000 行'); });
