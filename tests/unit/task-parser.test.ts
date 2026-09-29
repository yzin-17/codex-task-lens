import { describe, expect, it } from 'vitest';
import { parseTasks, taskFingerprint } from '../../src/core/task-parser.js';
describe('GFM leaf tasks', () => {
  it('counts leading first-cell table checkboxes as independent tasks with row details and scope', () => {
    const source = [
      '# Plan',
      '',
      '| [ ] Task | Description | Validation |',
      '| --- | --- | --- |',
      '| [ ] C01 Inventory | producers and consumers | check route |',
      '| [X] C02 Done | frozen contract | passed |',
      '| [ ] | Fallback title | detail |',
      '| Not a task | [ ] marker outside first column | details |',
      '| `[ ]` example | inline code is not a task | details |',
      '',
      '## Follow-up',
      '| Task | Description |',
      '| --- | --- |',
      '| [x] T1 Finished | detail |',
    ].join('\n');
    const result = parseTasks(source);
    expect(result.items.map(item => [item.explicitId, item.title, item.checked])).toEqual([
      ['C01', 'Inventory', false], ['C02', 'Done', true], [undefined, 'Fallback title', false], ['T1', 'Finished', true],
    ]);
    expect(result).toMatchObject({completed:2,incomplete:2,total:4});
    expect(result.items[0]).toMatchObject({line:5,endLine:5,groups:['Plan']});
    expect(result.items[0]?.raw).toContain('| check route |');
    expect(parseTasks(source, result.sections[1]!.scope).items.map(item => item.title)).toEqual(['Finished']);
  });
  it('counts nested leaves once, keeps source order and normal detail lists', () => {
    const result = parseTasks('# 实施\n\n- [x] T1：准备\n  - 验证：通过\n- [ ] T2：父任务\n  - [X] 重复标题\n  - [ ] 重复标题\n1. [x] 没有编号\n');
    expect(result.total).toBe(4); expect(result.completed).toBe(3);
    expect(result.items[0]).toMatchObject({explicitId:'T1',title:'准备',line:3,checked:true});
    expect(result.items[1]?.groups).toContain('T2：父任务');
    expect(new Set(result.items.map(x=>x.rowId)).size).toBe(4);
    expect(result.items[0]?.raw).toContain('验证');
  });
  it('ignores examples and non-list text', () => {
    const source = '```md\n- [x] fenced\n```\n\n    - [x] indented\n\n> - [x] quote\n\n<div>\n- [x] html\n</div>\n\nplain [x] text\n\n- inline `[x]`\n- [ ] real\n';
    expect(parseTasks(source).items.map(x=>x.title)).toEqual(['real']);
  });
  it('supports CRLF, explicit status, conflicting fields and checked contradictions', () => {
    const result = parseTasks('- [ ] 工作\r\n  - 状态：进行中\r\n- [x] 检查\r\n  - Status: blocked\r\n- [ ] 冲突\r\n  - 状态：进行中\r\n  - Status: validating\r\n- [ ] 未知\r\n  - Status: perhaps\r\n');
    expect(result.items[0]?.status).toBe('in_progress');
    expect(result.items[1]).toMatchObject({line:3,status:'blocked',conflict:true});
    expect(result.items[2]).toMatchObject({conflict:true}); expect(result.items[2]?.status).toBeUndefined();
    expect(result.items[3]?.status).toBeUndefined(); expect(result.completed).toBe(1);
  });
  it('binds a duplicate heading by hierarchical occurrence and rejects changed scopes', () => {
    const source = '# 项目\n## 相同\n- [ ] A\n## 相同\n- [x] B\n## 其他\n- [ ] C\n';
    const scope = parseTasks(source).sections[2]!.scope;
    expect(parseTasks(source,scope).items.map(x=>x.title)).toEqual(['B']);
    expect(parseTasks('\n'+source,scope).completed).toBe(1);
    expect(()=>parseTasks(source.replace('## 相同\n- [ ] A\n',''),scope)).toThrow('章节已变化');
  });
  it('reports parent mismatch, zero leaves and content limits honestly', () => {
    expect(parseTasks('- [x] parent\n  - [ ] child').diagnostics).toHaveLength(1);
    expect(parseTasks('# empty').total).toBe(0);
    expect(()=>parseTasks('a'.repeat(2*1024*1024+1))).toThrow('2 MiB');
  });
  it('ignores whitespace-only changes in semantic progress', () => { expect(taskFingerprint(parseTasks('- [ ] A\n'))).toBe(taskFingerprint(parseTasks('\n- [ ] A\n'))); });
});
