import type { Nodes, Root } from 'mdast';
import { LensError, type HeadingPart, type SectionOption, type TaskScope } from '../contracts/index.js';
import { TaskBudget } from './task-budget.js';
export function plainText(node: Nodes): string {
  if (node.type === 'html') return '';
  if ('value' in node && typeof node.value === 'string') return node.value;
  if ('alt' in node) return node.alt ?? '';
  if ('children' in node) return node.children.map(child => plainText(child as Nodes)).join('');
  return '';
}
export function sectionsOf(root: Root, source: string): SectionOption[] {
  type Entry = { index: number; depth: number; title: string; line: number; endLine: number; parent?: Entry; part: HeadingPart };
  const headings: Entry[] = [], stack: Entry[] = [], siblings = new Map<string, Entry[]>();
  const lastLine = source.split('\n').length, budget = new TaskBudget(4 * 1024 * 1024);
  for (const node of root.children) {
    if (node.type !== 'heading' || !node.position) continue;
    const title = plainText(node) || '(空标题)';
    if (title.length > 512) throw new LensError('unsupported', '章节标题超过 512 字符，无法建立稳定范围');
    if (headings.length >= 10000) throw new LensError('unsupported', '章节标题超过 10000 个限制');
    while (stack.length && stack.at(-1)!.depth >= node.depth) stack.pop()!.endLine = node.position.start.line - 1;
    const parent = stack.at(-1), key = JSON.stringify([parent?.index ?? -1, node.depth, title]);
    const group = siblings.get(key) ?? [];
    const entry: Entry = { index: headings.length, depth: node.depth, title, line: node.position.start.line, endLine: lastLine, parent, part: { depth: node.depth, title, ordinal: group.length + 1, total: 0 } };
    group.push(entry); siblings.set(key, group); headings.push(entry); stack.push(entry);
  }
  for (const group of siblings.values()) for (const entry of group) entry.part.total = group.length;
  return headings.map(entry => {
    const chain: HeadingPart[] = [];
    for (let current: Entry | undefined = entry; current; current = current.parent) chain.unshift(current.part);
    const option: SectionOption = { label: chain.map(part => part.title + (part.total > 1 ? ` (${part.ordinal}/${part.total})` : '')).join(' / '), scope: { kind: 'section', path: chain }, line: entry.line, endLine: entry.endLine };
    budget.add(option); return option;
  });
}
export function groupsForLine(sections: SectionOption[], line: number): string[] {
  let low = 0, high = sections.length;
  while (low < high) { const middle = (low + high) >>> 1; if (sections[middle]!.line <= line) low = middle + 1; else high = middle; }
  const section = sections[low - 1];
  return section?.scope.kind === 'section' ? section.scope.path.map(part => part.title) : [];
}
export function scopeRange(scope: TaskScope, sections: SectionOption[]): { line: number; endLine: number } {
  if (scope.kind === 'document') return { line: 1, endLine: Number.MAX_SAFE_INTEGER };
  const key = JSON.stringify(scope.path);
  const matches = sections.filter(section => section.scope.kind === 'section' && JSON.stringify(section.scope.path) === key);
  if (matches.length !== 1) throw new LensError('scope_missing', '章节已变化，请重新选择范围');
  return matches[0]!;
}
