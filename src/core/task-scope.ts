import type { Nodes, Root } from 'mdast';
import { LensError, type HeadingPart, type SectionOption, type TaskScope } from '../contracts/index.js';
export function plainText(node: Nodes): string {
  if (node.type === 'html') return '';
  if ('value' in node && typeof node.value === 'string') return node.value;
  if ('alt' in node) return node.alt ?? '';
  if ('children' in node) return node.children.map(child => plainText(child as Nodes)).join('');
  return '';
}
export function sectionsOf(root: Root, source: string): SectionOption[] {
  type Entry = { depth: number; title: string; line: number; parent?: Entry; part?: HeadingPart };
  const headings: Entry[] = [], stack: Entry[] = [];
  for (const node of root.children) {
    if (node.type !== 'heading' || !node.position) continue;
    while (stack.length && stack.at(-1)!.depth >= node.depth) stack.pop();
    const entry: Entry = { depth: node.depth, title: plainText(node) || '(空标题)', line: node.position.start.line, parent: stack.at(-1) };
    headings.push(entry); stack.push(entry);
  }
  for (const entry of headings) {
    const siblings = headings.filter(other => other.parent === entry.parent && other.depth === entry.depth && other.title === entry.title);
    entry.part = { depth: entry.depth, title: entry.title, ordinal: siblings.indexOf(entry) + 1, total: siblings.length };
  }
  const lastLine = source.split('\n').length;
  return headings.map((entry, index) => {
    const chain: HeadingPart[] = [];
    for (let current: Entry | undefined = entry; current; current = current.parent) chain.unshift(current.part!);
    const next = headings.slice(index + 1).find(other => other.depth <= entry.depth);
    return { label: chain.map(part => part.title + (part.total > 1 ? ` (${part.ordinal}/${part.total})` : '')).join(' / '), scope: { kind: 'section', path: chain }, line: entry.line, endLine: next ? next.line - 1 : lastLine };
  });
}
export function scopeRange(scope: TaskScope, sections: SectionOption[]): { line: number; endLine: number } {
  if (scope.kind === 'document') return { line: 1, endLine: Number.MAX_SAFE_INTEGER };
  const matches = sections.filter(section => section.scope.kind === 'section' && JSON.stringify(section.scope.path) === JSON.stringify(scope.path));
  if (matches.length !== 1) throw new LensError('scope_missing', '章节已变化，请重新选择范围');
  return matches[0]!;
}
