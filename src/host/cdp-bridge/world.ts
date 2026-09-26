import type { CdpPeer } from './bridge.js';
const WORLD = 'CodexTaskLens';
/** CDP clients do not necessarily reuse each other's named worlds. Discover surviving contexts first. */
export async function resolveToolWorld(peer: CdpPeer, frameId: string): Promise<{ executionContextId: number }> {
  const existing = new Set<number>();
  const stop = peer.on('Runtime.executionContextCreated', event => {
    const context = event.context as { id?: number; name?: string; auxData?: { frameId?: string; isDefault?: boolean } } | undefined;
    if (context?.name === WORLD && context.auxData?.frameId === frameId && context.auxData.isDefault === false && Number.isSafeInteger(context.id) && context.id! > 0 && existing.size < 16) existing.add(context.id!);
  });
  try {
    await peer.send('Runtime.enable');
    // A fixed, side-effect-free round trip lets already queued context notifications arrive.
    await peer.send('Runtime.evaluate', { expression: '0', returnByValue: true });
  } finally { stop(); }
  if (existing.size) {
    for (const contextId of existing) {
      await peer.send('Runtime.callFunctionOn', { executionContextId: contextId, functionDeclaration: 'function(){ return globalThis.CodexTaskLensBuild?.dispose(); }', returnByValue: true, awaitPromise: true }).catch(() => undefined);
    }
    return { executionContextId: [...existing][0]! };
  }
  const world = await peer.send('Page.createIsolatedWorld', { frameId, worldName: WORLD });
  return { executionContextId: world.executionContextId as number };
}
