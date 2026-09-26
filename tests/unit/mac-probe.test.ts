import { expect, it } from 'vitest';
import { redactPanes } from '../../src/cli/mac-probe.js';
it('exports only allowlisted structure and salted nonreversible conversation references', () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const result = redactPanes([{ threadId: id, anchorTag: 'DIV', editorTag: 'TEXTAREA', attributes: ['data-thread-id', 'secret-attribute'], body: 'private chat', path: '/Users/private' }], 'local-salt');
  expect(result[0]).toMatchObject({ identified: true, anchorTag: 'DIV', attributes: ['data-thread-id'] });
  expect(JSON.stringify(result)).not.toMatch(/11111111|private|secret/);
  expect(result[0]?.threadHash).not.toBe(redactPanes([{ threadId: id }], 'different-salt')[0]?.threadHash);
  expect(() => redactPanes(new Array(17).fill({}), 'salt')).toThrow();
});
