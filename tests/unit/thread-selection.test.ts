import { expect, it } from 'vitest';
import { uniqueThread } from '../../src/adapters/codex/dom/selection.js';
const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222';
it('requires one exact thread identity, deduplicating repeated same-thread attributes', () => {
  expect(uniqueThread([a, a.toUpperCase()])).toBe(a);
  for (const values of [[], [a, b], ['chatgpt:' + a], ['prefix-' + a], [''], [a, 'unknown']]) expect(uniqueThread(values)).toBeNull();
});
