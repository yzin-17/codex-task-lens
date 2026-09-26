import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createDomAdapter, THREAD_ATTRIBUTES, type PaneSelection } from '../../adapters/codex/dom/selection.js';
import type { EmbeddedConfiguration, EmbeddedEvent, PaneIdentity } from '../../contracts/embedded.js';
import { EmbeddedClient } from './client.js';
import { EmbeddedPanel } from './panel.js';
import './embedded.css';
type Entry = { host: HTMLElement; root: Root; selection: PaneSelection; client: EmbeddedClient | null; stopEvents: () => void };
type Instance = { inspect: () => PaneIdentity[]; receive: (event: EmbeddedEvent) => void; dispose: () => void; resources: () => { panes: number; observers: number; timers: number } };
let instance: Instance | undefined;
export function install(config: EmbeddedConfiguration): void {
  dispose();
  const globals = globalThis as unknown as Record<string, unknown>, binding = globals[config.bindingName];
  if (typeof binding !== 'function') throw new Error('Task Lens bridge unavailable');
  const adapter = createDomAdapter(document), entries = new Map<string, Entry>(); let disposed = false, queued = false, heartbeat = Date.now();
  const remove = (entry: Entry) => { entry.client?.close(); entry.root.unmount(); entry.stopEvents(); entry.host.remove(); };
  const refresh = (): PaneIdentity[] => {
    if (disposed) return [];
    const selections = adapter.scan(); const ids = new Set(selections.map(item => item.paneId));
    for (const [id, entry] of entries) if (!ids.has(id)) { remove(entry); entries.delete(id); }
    for (const selection of selections) {
      const old = entries.get(selection.paneId);
      if (old && old.selection.generation === selection.generation && old.selection.threadId === selection.threadId && old.host.isConnected && old.selection.anchor === selection.anchor) continue;
      if (old) remove(old);
      const host = document.createElement('div'); host.dataset.taskLensHost = selection.paneId;
      const shadow = host.attachShadow({ mode: 'open' }), style = document.createElement('style'), mount = document.createElement('div');
      style.textContent = config.styles; shadow.append(style, mount); selection.anchor.insertAdjacentElement('afterend', host);
      const eventTypes = ['keydown', 'keyup', 'keypress', 'input', 'click', 'submit']; const stop = (event: Event) => event.stopPropagation(); for (const type of eventTypes) host.addEventListener(type, stop);
      const client = selection.threadId ? new EmbeddedClient(config, selection, payload => binding(payload)) : null;
      const root = createRoot(mount); root.render(client ? createElement(EmbeddedPanel, { client, initialGrantId: config.initialGrantId }) : createElement('p', { className: 'lens-unknown' }, '未识别到当前对话；未显示其他对话的任务'));
      entries.set(selection.paneId, { host, root, selection, client, stopEvents: () => { for (const type of eventTypes) host.removeEventListener(type, stop); } });
    }
    const dark = document.documentElement.classList.contains('dark') || document.documentElement.dataset.theme === 'dark' || getComputedStyle(document.documentElement).colorScheme === 'dark';
    for (const entry of entries.values()) {
      const theme = dark ? 'dark' : 'auto';
      // Avoid observing our own identical attribute writes forever.
      if (entry.host.dataset.theme !== theme) entry.host.dataset.theme = theme;
      entry.client?.setOnline(Date.now() - heartbeat < 5000);
    }
    return selections.map(({ paneId, generation, threadId }) => ({ paneId, generation, threadId }));
  };
  const observer = new MutationObserver(() => { if (!queued) { queued = true; queueMicrotask(() => { queued = false; refresh(); }); } });
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: [...THREAD_ATTRIBUTES, 'hidden', 'class', 'data-theme', 'style'] });
  const timer = setInterval(refresh, 1000);
  instance = {
    inspect: () => { heartbeat = Date.now(); return refresh(); },
    receive: event => { refresh(); entries.get(event.paneId)?.client?.accept(event); },
    dispose: () => {
      if (disposed) return; disposed = true; observer.disconnect(); clearInterval(timer);
      for (const entry of entries.values()) remove(entry); entries.clear();
      if (globals[config.bindingName] === binding) Reflect.deleteProperty(globals, config.bindingName);
    },
    resources: () => ({ panes: entries.size, observers: disposed ? 0 : 1, timers: disposed ? 0 : 1 }),
  };
  refresh();
}
/** Read-only compatibility input; does not install UI, observers, bindings or timers. */
export function probe() {
  return createDomAdapter(document).scan().map(({ paneId, generation, threadId, anchor, editor }) => ({
    paneId, generation, threadId, anchorTag: anchor.tagName, editorTag: editor.tagName,
    attributes: THREAD_ATTRIBUTES.filter(attribute => !!document.querySelector(`[${attribute}]`)),
  }));
}
export function inspect(): PaneIdentity[] { return instance?.inspect() ?? []; }
export function receive(event: EmbeddedEvent): void { instance?.receive(event); }
export function dispose(): void { instance?.dispose(); instance = undefined; }
export function resources() { return instance?.resources() ?? { panes: 0, observers: 0, timers: 0 }; }
