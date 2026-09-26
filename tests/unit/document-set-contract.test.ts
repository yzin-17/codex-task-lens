import { expect, it } from 'vitest';
import { parseRequest, type ViewState } from '../../src/contracts/index.js';
import { summarizeDocuments } from '../../src/core/document-set.js';
import { selectMarkdownFiles, validateSelection } from '../../src/platform/macos/select-markdown.js';
const base = { protocolVersion: 1, requestId: 'set-test', monitor: { kind: 'standalone', id: 'a' }, generation: 0 };
it('validates bounded, distinct confirmation references and explicit picker consent', () => {
  const call = (params: unknown) => parseRequest({ ...base, operation: 'confirmBindings', params });
  expect(call({ previewIds: ['p'], keepBindingIds: ['k'], expectedBindingVersion: 1 }).operation).toBe('confirmBindings');
  for (const params of [{ previewIds: ['p', 'p'], keepBindingIds: [], expectedBindingVersion: 1 }, { previewIds: Array.from({ length: 17 }, (_, i) => String(i)), keepBindingIds: [], expectedBindingVersion: 1 }, { previewIds: [], keepBindingIds: ['k', 'k'], expectedBindingVersion: 1 }]) expect(() => call(params)).toThrow();
  expect(() => parseRequest({ ...base, operation: 'pickMarkdownFiles', params: {} })).toThrow();
});
it('separates no bindings, empty files, partial coverage and cached counts', () => {
  expect(summarizeDocuments(null).label).toBe('进度');
  const view = { documents: [{ binding: {}, snapshot: { status: 'ready', cached: false, tasks: { completed: 2, total: 4 } } }, { binding: {}, snapshot: { status: 'missing', cached: false, tasks: null } }] } as unknown as ViewState;
  expect(summarizeDocuments(view)).toMatchObject({ label: '进度 2/4', partial: true, warning: true, suffix: '部分' });
  view.documents!.pop(); expect(summarizeDocuments(view)).toMatchObject({ warning: false, partial: false });
  view.documents![0]!.snapshot!.cached = true; expect(summarizeDocuments(view).suffix).toBe('缓存');
});
it('uses a fixed system chooser, handles cancellation and validates returned paths', async () => {
  const calls: string[] = [];
  expect(await selectMarkdownFiles(async (program, args) => { calls.push(program, ...args.slice(0, 2)); return { stdout: '{"paths":["/fixture/a.md","/fixture/b.markdown"],"cancelled":false}' }; })).toEqual({ paths: ['/fixture/a.md', '/fixture/b.markdown'], cancelled: false });
  expect(calls).toEqual(['/usr/bin/osascript', '-l', 'JavaScript']);
  expect(await selectMarkdownFiles(async () => ({ stdout: '{"paths":[],"cancelled":true}' }))).toEqual({ paths: [], cancelled: true });
  for (const paths of [['relative.md'], ['/fixture/a.txt'], ['/fixture/a\n.md'], Array.from({ length: 17 }, (_, i) => `/fixture/${i}.md`)]) expect(() => validateSelection({ paths, cancelled: false })).toThrow();
});
it('does not open a second native chooser while one is pending', async () => {
  let release!: (value: { stdout: string }) => void;
  const pending = selectMarkdownFiles(() => new Promise(resolve => { release = resolve; }));
  try { await expect(selectMarkdownFiles(async () => ({ stdout: '{"paths":[],"cancelled":true}' }))).rejects.toMatchObject({ code: 'busy' }); }
  finally { release({ stdout: '{"paths":[],"cancelled":true}' }); }
  expect(await pending).toEqual({ paths: [], cancelled: true });
  expect(await selectMarkdownFiles(async () => ({ stdout: '{"paths":[],"cancelled":true}' }))).toEqual({ paths: [], cancelled: true });
});
