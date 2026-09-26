import { expect, it } from 'vitest';
import { EmbeddedClient } from '../../src/ui/embedded/client.js';
import type { Request, ViewState } from '../../src/contracts/index.js';
const id = '11111111-1111-4111-8111-111111111111';
function setup() {
  const requests: Request[] = [];
  const client = new EmbeddedClient({ bindingName: 'test', nonce: 'test', sourceId: 'test', styles: '' }, { paneId: 'pane', generation: 2, threadId: id }, text => requests.push(JSON.parse(text).request));
  const view: ViewState = { monitor: client.monitor, generation: 2, bindingVersion: 0, binding: null, snapshot: null, connection: 'connected' };
  return { client, requests, view };
}
it('does not regress a pushed snapshot when a slow initial read resolves', async () => {
  const { client, requests, view } = setup(), controller = new AbortController(), values: number[] = [];
  const watching = client.watch(next => values.push(next.bindingVersion), () => undefined, controller.signal);
  client.accept({ kind: 'snapshot', paneId: 'pane', generation: 2, view: { ...view, bindingVersion: 2 } });
  client.accept({ kind: 'reply', paneId: 'pane', generation: 2, requestId: requests[0]!.requestId, ok: true, result: view });
  await Promise.resolve(); expect(values).toEqual([2]); controller.abort(); await watching; client.close();
});
it('ignores other generations and closes pending calls', async () => {
  const { client, requests, view } = setup();
  const task = client.call('getSnapshot', {}), rejected = expect(task).rejects.toThrow('切换');
  client.accept({ kind: 'reply', paneId: 'pane', generation: 1, requestId: requests[0]!.requestId, ok: true, result: view });
  client.close(); await rejected; await expect(client.call('getSnapshot', {})).rejects.toThrow();
});
