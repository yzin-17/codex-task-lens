import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import type { ListItem, Nodes, Root, TableRow } from 'mdast';
import { DOCUMENT_SCOPE, LensError, MAX_DOCUMENT_BYTES, MAX_TASKS, type ExplicitStatus, type ParsedTasks, type TaskItem, type TaskScope } from '../contracts/index.js';
import { groupsForLine, plainText, scopeRange, sectionsOf } from './task-scope.js';
import { TaskBudget } from './task-budget.js';
const parser = unified().use(remarkParse).use(remarkGfm);
const statuses: Record<string, ExplicitStatus> = { '进行中': 'in_progress', in_progress: 'in_progress', '验证中': 'validating', validating: 'validating', '阻塞': 'blocked', blocked: 'blocked' };
function taskDescendants(node: Nodes, depth = 0): ListItem[] {
  if (depth > 64) throw new LensError('unsupported', '文档嵌套过深');
  if (['blockquote', 'code', 'html'].includes(node.type)) return [];
  if (!('children' in node)) return [];
  return node.children.flatMap(child => {
    if (child.type === 'listItem' && typeof child.checked === 'boolean') return [child, ...taskDescendants(child, depth + 1)];
    return taskDescendants(child as Nodes, depth + 1);
  });
}
function explicitState(item: ListItem): { status?: ExplicitStatus; conflict: boolean } {
  const lines: string[] = [];
  for (const child of item.children) {
    if (child.type === 'paragraph') lines.push(...plainText(child).split('\n'));
    if (child.type === 'list') for (const detail of child.children) {
      if (typeof detail.checked === 'boolean') continue;
      for (const paragraph of detail.children) if (paragraph.type === 'paragraph') lines.push(...plainText(paragraph).split('\n'));
    }
  }
  return taskState(lines, item.checked === true);
}
function taskState(lines: string[], checked: boolean): { status?: ExplicitStatus; conflict: boolean } {
  const values = [...new Set(lines.flatMap(line => {
    const match = /^\s*(?:状态|Status)\s*[：:]\s*(.+?)\s*$/i.exec(line);
    return match ? [match[1]!.toLowerCase()] : [];
  }))];
  if (values.length > 1) return { conflict: true };
  const status = values.length ? statuses[values[0]!] : undefined;
  return { ...(status ? { status } : {}), conflict: checked && !!status };
}
function tableRowTask(row: TableRow): { checked: boolean; title: string; statusLines: string[] } | null {
  const firstCell = row.children[0];
  if (!firstCell || firstCell.children[0]?.type !== 'text') return null;
  const firstCellText = plainText(firstCell), match = /^\s*\[([ xX])\](?:\s+(.*))?\s*$/.exec(firstCellText);
  if (!match) return null;
  const ownTitle = (match[2] ?? '').trim();
  const title = ownTitle || row.children.slice(1).map(plainText).find(value => value.trim())?.trim() || '(无标题任务)';
  const statusLines = [ownTitle, ...row.children.slice(1).map(plainText)].flatMap(value => value.split('\n'));
  return { checked: match[1]!.toLowerCase() === 'x', title, statusLines };
}
export function parseTasks(source: string, scope: TaskScope = DOCUMENT_SCOPE): ParsedTasks {
  if (new TextEncoder().encode(source).byteLength > MAX_DOCUMENT_BYTES) throw new LensError('unsupported', '文档超过 2 MiB 限制');
  if (source.split('\n').length > 50000) throw new LensError('unsupported', '文档超过 50000 行限制');
  const root = parser.parse(source) as Root;
  const sections = sectionsOf(root, source), range = scopeRange(scope, sections), budget = new TaskBudget();
  budget.add(sections);
  const items: TaskItem[] = [], diagnostics: string[] = [];
  function addTask(item: TaskItem): void {
    budget.add(item); items.push(item);
    if (items.length > MAX_TASKS) throw new LensError('unsupported', '叶子任务超过 5000 项限制');
  }
  function walk(node: Nodes, groups: string[], depth = 0): void {
    if (depth > 64) throw new LensError('unsupported', '文档嵌套过深');
    if (['blockquote', 'code', 'html'].includes(node.type)) return;
    let descendantsGroups = groups;
    if (node.type === 'table') {
      for (const row of node.children.slice(1)) {
        if (!row.position) continue;
        const parsed = tableRowTask(row), line = row.position.start.line;
        if (!parsed || line < range.line || line > range.endLine) continue;
        const idMatch = /^([A-Za-z]+\d+(?:[._-][A-Za-z0-9]+)*)(?:\s*[：:]\s*|\s+)/.exec(parsed.title);
        const itemTitle = idMatch ? parsed.title.slice(idMatch[0].length) || parsed.title : parsed.title;
        const item: TaskItem = {
          rowId: `${row.position.start.offset ?? line}:${row.position.end.offset ?? row.position.end.line}`,
          ...(idMatch ? { explicitId: idMatch[1] } : {}), title: itemTitle,
          checked: parsed.checked, line, endLine: row.position.end.line,
          groups: groupsForLine(sections, line),
          raw: source.slice(row.position.start.offset, row.position.end.offset),
          ...taskState(parsed.statusLines, parsed.checked),
        };
        addTask(item);
      }
    }
    if (node.type === 'listItem' && node.position) {
      const paragraph = node.children.find(child => child.type === 'paragraph');
      const firstLine = (paragraph ? plainText(paragraph) : '').split('\n')[0]?.trim() || '(无标题任务)';
      const children = taskDescendants(node);
      if (children.length) {
        descendantsGroups = [...groups, firstLine];
        if (node.checked === true && children.some(child => child.checked === false)) { const diagnostic = `第 ${node.position.start.line} 行父项已勾选，但子项未全部勾选`; budget.add(diagnostic); diagnostics.push(diagnostic); }
      } else if (typeof node.checked === 'boolean' && node.position.start.line >= range.line && node.position.start.line <= range.endLine) {
        const idMatch = /^([A-Za-z]+\d+(?:[._-][A-Za-z0-9]+)*)(?:\s*[：:]\s*|\s+)/.exec(firstLine);
        const line = node.position.start.line;
        const item: TaskItem = { rowId: `${node.position.start.offset ?? line}:${node.position.end.offset ?? node.position.end.line}`, ...(idMatch ? { explicitId: idMatch[1] } : {}), title: idMatch ? firstLine.slice(idMatch[0].length) || firstLine : firstLine, checked: node.checked, line, endLine: node.position.end.line, groups: [...groupsForLine(sections, line), ...groups], raw: source.slice(node.position.start.offset, node.position.end.offset), ...explicitState(node) };
        addTask(item);
      }
    }
    if ('children' in node) for (const child of node.children) walk(child as Nodes, descendantsGroups, depth + 1);
  }
  walk(root, []);
  const completed = items.filter(item => item.checked).length;
  return { title: sections[0]?.scope.kind === 'section' ? sections[0].scope.path[0]!.title : '任务清单', items, completed, incomplete: items.length - completed, total: items.length, sections, diagnostics };
}
/** Source lines/raw text are excluded: formatting changes are not task progress. */
export function taskFingerprint(tasks: ParsedTasks): string {
  return JSON.stringify(tasks.items.map(({ title, explicitId, checked, groups, status, conflict }) => ({ title, explicitId, checked, groups, status, conflict })));
}
