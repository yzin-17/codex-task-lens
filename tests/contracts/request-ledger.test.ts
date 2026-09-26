import { expect, it } from 'vitest';
import { RequestLedger } from '../../src/contracts/request-ledger.js';
it('bounds large completed results by bytes instead of retaining hundreds of document copies', async () => {
  const ledger = new RequestLedger(128, 512);
  for (let i = 0; i < 20; i++) await ledger.execute(String(i), 'request', async () => 'x'.repeat(400));
  expect(ledger.resources().retainedBytes).toBeLessThanOrEqual(512); expect(ledger.resources().entries).toBe(1);
  await ledger.execute('huge', 'request', async () => 'x'.repeat(1024)); expect(ledger.resources()).toEqual({ entries: 0, retainedBytes: 0 });
});
it('never evicts an active request and does not repopulate after clear', async () => {
  const ledger = new RequestLedger(1); let complete!: (value: string) => void;
  const first = ledger.execute('first', 'value', () => new Promise<string>(resolve => { complete = resolve; }));
  await expect(ledger.execute('second', 'value', async () => 'second')).rejects.toMatchObject({ code: 'busy' });
  ledger.clear(); complete('done'); expect(await first).toBe('done'); expect(ledger.resources()).toEqual({ entries: 0, retainedBytes: 0 });
});
