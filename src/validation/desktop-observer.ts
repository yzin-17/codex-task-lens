import type { CdpSession, CdpEvent } from '../adapters/codex/cdp/session.js';
import type { PanelObservation } from './document-checks.js';

type Context = { id: number; name: string; frameId: string };
/** An additional read-only CDP client. It never installs, disposes, navigates or sends host input. */
export class DesktopObserver {
  private contexts = new Map<number, Context>();
  private stops: (() => void)[] = [];
  constructor(readonly peer: CdpSession) {
    this.stops.push(peer.on('Runtime.executionContextCreated', event => {
      const context = event.context as { id?: number; name?: string; auxData?: { frameId?: string; isDefault?: boolean } } | undefined;
      if (context?.name === 'CodexTaskLens' && context.auxData?.isDefault === false && Number.isSafeInteger(context.id) && typeof context.auxData.frameId === 'string') this.contexts.set(context.id!, { id: context.id!, name: context.name, frameId: context.auxData.frameId });
    }));
    this.stops.push(peer.on('Runtime.executionContextDestroyed', event => this.contexts.delete(Number(event.executionContextId))));
    this.stops.push(peer.on('Runtime.executionContextsCleared', () => this.contexts.clear()));
  }
  async start(): Promise<void> { await this.peer.send('Runtime.enable'); await this.peer.send('Runtime.evaluate', { expression: '0', returnByValue: true }); }
  private async call(contextId: number, functionDeclaration: string, args: unknown[] = []): Promise<unknown> {
    const result = await this.peer.send('Runtime.callFunctionOn', { executionContextId: contextId, functionDeclaration, arguments: args.map(value => ({ value })), returnByValue: true, silent: true });
    if (result.exceptionDetails) throw new Error('Read-only observation failed');
    return (result.result as { value?: unknown } | undefined)?.value;
  }
  private async world(): Promise<number> {
    const tree = await this.peer.send('Page.getFrameTree'); const frameId = (tree.frameTree as { frame?: { id?: string } } | undefined)?.frame?.id;
    const matches = [...this.contexts.values()].filter(context => context.frameId === frameId);
    for (const context of matches) {
      const value = await this.call(context.id, 'function(){return globalThis.CodexTaskLensBuild?.resources();}').catch(() => null) as { observers?: number } | null;
      if (value?.observers === 1) return context.id;
    }
    throw new Error('No active Task Lens world');
  }
  async assertUnoccupied(): Promise<void> {
    const result = await this.peer.send('Runtime.evaluate', { expression: 'document.querySelectorAll("[data-task-lens-host]").length', returnByValue: true });
    if (result.exceptionDetails || (result.result as { value?: unknown } | undefined)?.value !== 0) throw new Error('Task Lens is already running or has retained roots');
    for (const context of this.contexts.values()) {
      const value = await this.call(context.id, 'function(){return globalThis.CodexTaskLensBuild?.resources();}').catch(() => null) as { observers?: number; timers?: number } | null;
      if (value?.observers || value?.timers) throw new Error('An active Task Lens instance must not be replaced by acceptance');
    }
  }
  async capture(): Promise<{ threadId: string; identifiedPanes: number }> {
    const value = await this.call(await this.world(), 'function(){return globalThis.CodexTaskLensBuild.probe();}');
    if (!Array.isArray(value) || value.length !== 1) throw new Error('Use exactly one conversation pane for the A/B stages');
    const threadId = (value[0] as { threadId?: unknown }).threadId;
    if (typeof threadId !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(threadId)) throw new Error('Current conversation is unknown');
    return { threadId, identifiedPanes: 1 };
  }
  async expand(threadId: string): Promise<void> {
    await this.call(await this.world(), 'function(id){const pane=globalThis.CodexTaskLensBuild.inspect().find(p=>p.threadId===id);const host=pane&&Array.from(document.querySelectorAll("[data-task-lens-host]")).find(h=>h.dataset.taskLensHost===pane.paneId);const details=host?.shadowRoot?.querySelector(".lens-embedded-shell");if(!details)throw new Error("Missing panel");if(!details.matches(":popover-open"))details.showPopover();}', [threadId]);
  }
  async observe(threadId: string): Promise<PanelObservation> {
    const value = await this.call(await this.world(), 'function(id){const panes=globalThis.CodexTaskLensBuild.inspect().filter(p=>p.threadId===id);const hosts=Array.from(document.querySelectorAll("[data-task-lens-host]"));const host=panes.length===1&&hosts.find(h=>h.dataset.taskLensHost===panes[0].paneId);const root=host?.shadowRoot;const count=root?.querySelector(".lens-task-count");const match=count?.textContent?.match(/(\\d+)\\s*\\/\\s*(\\d+)/);const status=root?.querySelector(".lens-task-panel [role=status]")?.textContent||"";const rect=count?.getBoundingClientRect();const visible=!!rect&&rect.height>0&&rect.width>0&&rect.bottom>0&&rect.top<innerHeight;const groups=Array.from(root?.querySelectorAll(".lens-task-group h3>button")||[]);return {completed:match?Number(match[1]):null,total:match?Number(match[2]):null,ready:visible&&status==="已同步",cached:!!count?.textContent?.includes("缓存"),permissionDenied:status.includes("源文件授权或权限失效"),groupsExpanded:groups.length===2&&groups.every(button=>button.getAttribute("aria-expanded")==="true"),roots:hosts.length};}', [threadId]);
    if (!value || typeof value !== 'object') throw new Error('Invalid panel observation');
    return value as PanelObservation;
  }
  async rootCount(): Promise<number> {
    const result: CdpEvent = await this.peer.send('Runtime.evaluate', { expression: 'document.querySelectorAll("[data-task-lens-host]").length', returnByValue: true });
    const value = (result.result as { value?: unknown } | undefined)?.value;
    if (result.exceptionDetails || !Number.isSafeInteger(value) || (value as number) < 0) throw new Error('Unable to verify root cleanup');
    return value as number;
  }
  close(): void { for (const stop of this.stops.splice(0)) stop(); this.contexts.clear(); this.peer.close(); }
}
