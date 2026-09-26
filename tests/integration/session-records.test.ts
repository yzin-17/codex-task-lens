import { afterEach, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, appendFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SessionRecords, extractPaths } from '../../src/adapters/codex/session-records/index.js';
const id = '11111111-1111-4111-8111-111111111111'; const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
const row = (type: string, payload: unknown) => JSON.stringify({ type, payload }) + '\n';
async function setup() { const root = await mkdtemp(path.join(tmpdir(), 'lens-session-')); roots.push(root); await mkdir(path.join(root, 'sessions')); const file = path.join(root, 'sessions', `rollout-fixture-${id}.jsonl`); const records = await SessionRecords.open(root, true); return { root, file, records, ref: { kind: 'thread' as const, sourceId: records.sourceId, threadId: id } }; }
it('requires explicit source authorization', async () => { await expect(SessionRecords.open('/tmp', false)).rejects.toThrow('授权'); });
it('matches internal identity and reads only explicit paths, incrementally completing a half-line', async () => {
  const { file, records, ref } = await setup();
  await writeFile(file, row('session_meta', { id, cwd: '/work/a' }) + row('event_msg', { type: 'agent_message', message: '[任务](docs/tasks/a.md)' }));
  expect((await records.hints(ref)).paths[0]).toMatchObject({ path: 'docs/tasks/a.md', baseDirectory: '/work/a' });
  const next = row('event_msg', { type: 'agent_message', message: '`next.md`' });
  await appendFile(file, row('turn_context', { cwd: '/work/b' }) + next.slice(0, -3));
  expect((await records.hints(ref)).paths).toHaveLength(1);
  await appendFile(file, next.slice(-3)); expect((await records.hints(ref)).paths.at(-1)).toMatchObject({ path: 'next.md', baseDirectory: '/work/b' }); records.close();
});
it('rejects a filename whose internal session ID differs and never reads auth.json', async () => {
  const { root, file, records, ref } = await setup();
  await writeFile(file, row('session_meta', { id: 'other', cwd: '/private' }) + row('event_msg', { type: 'agent_message', message: '`secret.md`' }));
  await writeFile(path.join(root, 'auth.json'), 'DO NOT READ');
  expect((await records.hints(ref)).paths).toEqual([]); records.close();
});
it('recovers from truncation, an oversize line and a damaged record', async () => {
  const { file, records, ref } = await setup();
  await writeFile(file, row('session_meta', { id, cwd: '/work' }) + 'x'.repeat(1024 * 1024 + 1) + '\n{bad}\n' + row('event_msg', { type: 'user_message', message: '`ok.md`' }));
  expect((await records.hints(ref)).paths[0]?.path).toBe('ok.md');
  await writeFile(file, row('session_meta', { id, cwd: '/new' }) + row('event_msg', { type: 'agent_message', message: '`new.md`' }));
  expect((await records.hints(ref)).paths.map(item => item.path)).toEqual(['new.md']); records.close();
});
it('ignores symlink log files outside the source and refuses shell interpretation', async () => {
  const { root, file, records, ref } = await setup();
  const external = path.join(root, 'outside.jsonl'); await writeFile(external, row('session_meta', { id, cwd: '/work' })); await symlink(external, file);
  expect((await records.hints(ref)).paths).toEqual([]);
  for (const cmd of ['cd /work && cat a.md', 'cat $TASK.md', 'cat `whoami`.md', 'cat a.md; touch marker']) expect(extractPaths({ type: 'response_item', payload: { type: 'function_call', name: 'exec_command', arguments: JSON.stringify({ cmd }) } }, { cwd: '/work' })).toEqual([]);
  expect(extractPaths({ type: 'response_item', payload: { type: 'function_call', name: 'exec_command', arguments: JSON.stringify({ cmd: 'cat "a b.md"', workdir: '/work' }) } }, {})).toHaveLength(1); records.close();
});
