import { expect, it } from 'vitest';
import { resolveToolWorld } from '../../src/host/cdp-bridge/world.js';
import type { CdpPeer } from '../../src/host/cdp-bridge/bridge.js';
import type { CdpEvent } from '../../src/adapters/codex/cdp/session.js';
it('discovers a surviving tool world before Runtime.enable and ignores other frames or default contexts', async () => {
  let listener: ((event: CdpEvent) => void) | undefined; const cleaned: number[] = []; let created = false;
  const peer: CdpPeer = {
    isClosed: false,
    on: (_method, callback) => { listener = callback; return () => { listener = undefined; }; },
    send: async (method, params = {}) => {
      if (method === 'Runtime.enable') for (const context of [
        { id: 1, name: 'CodexTaskLens', auxData: { frameId: 'other', isDefault: false } },
        { id: 2, name: 'CodexTaskLens', auxData: { frameId: 'main', isDefault: true } },
        { id: 7, name: 'CodexTaskLens', auxData: { frameId: 'main', isDefault: false } },
      ]) listener?.({ context });
      if (method === 'Page.createIsolatedWorld') created = true;
      if (method === 'Runtime.callFunctionOn') cleaned.push(params.executionContextId as number);
      return {};
    },
  };
  expect(await resolveToolWorld(peer, 'main')).toEqual({ executionContextId: 7 }); expect(cleaned).toEqual([7]); expect(created).toBe(false); expect(listener).toBeUndefined();
});
