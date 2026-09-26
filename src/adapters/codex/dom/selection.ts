export const THREAD_ATTRIBUTES = ['data-above-composer-conversation-id', 'data-conversation-id', 'data-thread-id'] as const;
const identitySelector = THREAD_ATTRIBUTES.map(name => `[${name}]`).join(',');
const editorSelector = 'textarea,[contenteditable="true"][role="textbox"],[contenteditable="true"].ProseMirror';
export function uniqueThread(values: string[]): string | null {
  const ids = new Set<string>();
  for (const value of values) {
    const normalized = value.trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normalized)) return null;
    ids.add(normalized.toLowerCase());
  }
  return ids.size === 1 ? [...ids][0]! : null;
}
export function visible(node: Element): boolean {
  const rect = node.getBoundingClientRect(), style = node.ownerDocument.defaultView?.getComputedStyle(node);
  return node.isConnected && rect.width > 0 && rect.height > 0 && style?.visibility !== 'hidden' && style?.display !== 'none';
}
export type PaneSelection = { paneId: string; generation: number; threadId: string | null; anchor: HTMLElement; editor: Element };
/** Never uses sidebar titles, last DOM element, activity timestamps or React internals. */
export function createDomAdapter(doc: Document) {
  let nextPane = 0;
  const identities = new WeakMap<Element, { paneId: string; generation: number; threadId: string | null; anchor: HTMLElement }>();
  return {
    scan(): PaneSelection[] {
      const selected: PaneSelection[] = [], used = new Set<HTMLElement>();
      const editors = [...doc.querySelectorAll(editorSelector)].filter(visible).filter(node => !node.closest('[data-task-lens-host]'));
      for (const editor of editors.slice(0, 16)) {
        let region: HTMLElement | null = editor.parentElement;
        let values: string[] = [];
        for (let depth = 0; region && region !== doc.body && depth < 10; depth++, region = region.parentElement) {
          if ([...region.querySelectorAll(editorSelector)].filter(visible).length !== 1) break;
          const nodes = [...region.querySelectorAll(identitySelector)];
          if (region.matches(identitySelector)) nodes.unshift(region);
          values = nodes.filter(visible).flatMap(node => THREAD_ATTRIBUTES.filter(name => node.hasAttribute(name)).map(name => node.getAttribute(name)!));
          if (values.length) break;
        }
        if (!region || region === doc.body || !values.length || used.has(region)) continue;
        // Insert outside the editor/form when possible, but only within this proven single-editor region.
        const shell = editor.closest<HTMLElement>('[data-composer-root],[class*="_ComposerLayoutRoot_"],form');
        const anchor = shell && region.contains(shell) ? shell : region;
        if (anchor === doc.body || anchor === doc.documentElement || anchor.contains(editor) && anchor.matches('[contenteditable],textarea')) continue;
        const threadId = uniqueThread(values), previous = identities.get(editor);
        const entry = previous ?? { paneId: `pane-${++nextPane}`, generation: 0, threadId, anchor };
        if (previous && (previous.threadId !== threadId || previous.anchor !== anchor)) entry.generation++;
        entry.threadId = threadId; entry.anchor = anchor; identities.set(editor, entry); used.add(region);
        selected.push({ ...entry, editor });
      }
      return selected;
    },
  };
}
