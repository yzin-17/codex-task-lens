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
