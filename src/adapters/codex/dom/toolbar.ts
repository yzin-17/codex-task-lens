const permissionLabels = ['更改权限', 'Change permissions', 'Permissions'];
const attachmentLabels = ['添加文件等内容', 'Add files and more', 'Add files'];
/** Only mount inside the current composer's left action group; never infer from sidebar text. */
export function findComposerToolbar(editor: Element, anchor: HTMLElement): HTMLElement | null {
  const shell = editor.closest<HTMLElement>('[data-composer-root],[class*="_ComposerLayoutRoot_"],form');
  if (!shell || (shell !== anchor && !anchor.contains(shell))) return null;
  const safe = (node: HTMLElement) => {
    const rect = node.getBoundingClientRect(), style = getComputedStyle(node);
    return !node.contains(editor) && shell.contains(node) && rect.width > 0 && rect.height > 0 && rect.height <= 64 && style.display !== 'none' && style.visibility !== 'hidden';
  };
  const declared = shell.querySelector<HTMLElement>('[data-composer-toolbar]');
  if (declared && safe(declared)) return declared;
  const buttons = [...shell.querySelectorAll('button')];
  const button = buttons.find(item => permissionLabels.includes(item.getAttribute('aria-label') ?? ''))
    ?? buttons.find(item => attachmentLabels.includes(item.getAttribute('aria-label') ?? ''));
  if (!button) return null;
  let parent = button.parentElement;
  for (let depth = 0; parent && parent !== shell && depth < 5; depth++, parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    if (safe(parent) && (style.display === 'flex' || style.display === 'inline-flex') && style.flexDirection === 'row') return parent;
  }
  return null;
}

/** Resolve only the current composer's column, not the sidebar or a sibling pane. */
export function conversationBounds(editor: Element): { left: number; top: number; width: number; height: number } {
  const doc = editor.ownerDocument, win = doc.defaultView!;
  const viewport = win.visualViewport;
  const left = viewport?.offsetLeft ?? 0, top = viewport?.offsetTop ?? 0;
  const width = viewport?.width ?? win.innerWidth, height = viewport?.height ?? win.innerHeight;
  const shell = editor.closest<HTMLElement>('[data-composer-root],[class*="_ComposerLayoutRoot_"],form');
  const fallback = (shell ?? editor).getBoundingClientRect();
  let column = { left: fallback.left, top, width: fallback.width, height };
  for (let node = shell?.parentElement; node && node !== doc.body; node = node.parentElement) {
    const box = node.getBoundingClientRect();
    const editors = [...node.querySelectorAll('textarea,[contenteditable="true"][role="textbox"],[contenteditable="true"].ProseMirror')].filter(item => { const r = item.getBoundingClientRect(); return r.width > 0 && r.height > 0 && win.getComputedStyle(item).visibility !== 'hidden'; });
    if (editors.length !== 1) break;
    if (box.width >= fallback.width && box.height >= Math.min(320, height * .5)) {
      column = { left: box.left, top: box.top, width: box.width, height: box.height }; break;
    }
  }
  const x = Math.max(left, column.left), y = Math.max(top, column.top);
  return { left: x, top: y, width: Math.max(0, Math.min(left + width, column.left + column.width) - x), height: Math.max(0, Math.min(top + height, column.top + column.height) - y) };
}
