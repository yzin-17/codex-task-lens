import { expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, symlink, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SessionRecords } from '../../src/adapters/codex/session-records/index.js';
import { discoverCandidates } from '../../src/discovery/candidates.js';
const id = '11111111-1111-4111-8111-111111111111';
const meta = JSON.stringify({ type: 'session_meta', payload: { id, cwd: '/fixture' } }) + '\n';
it('does not follow a session file replaced by a link to authentication storage after indexing', async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'lens-record-link-'))); await mkdir(path.join(root, 'sessions'));
  const file = path.join(root, 'sessions', `rollout-a-${id}.jsonl`), records = await SessionRecords.open(root, true);
  try {
    await writeFile(file, meta); await records.hints({ kind: 'thread', sourceId: records.sourceId, threadId: id });
    await writeFile(path.join(root, 'auth.json'), meta + JSON.stringify({ type: 'event_msg', payload: { type: 'agent_message', message: '`SECRET.md`' } }) + '\n');
    await rm(file); await symlink(path.join(root, 'auth.json'), file);
    const result = await records.hints({ kind: 'thread', sourceId: records.sourceId, threadId: id }); expect(result.status).toBe('unavailable'); expect(result.paths).toEqual([]);
  } finally { records.close(); await rm(root, { recursive: true, force: true }); }
});
it('never decides uniqueness from a truncated list of matching records', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'lens-record-many-')); await mkdir(path.join(root, 'sessions')); const records = await SessionRecords.open(root, true);
  try {
    for (let index = 0; index < 9; index++) await writeFile(path.join(root, 'sessions', `rollout-${index}-${id}.jsonl`), meta);
    const result = await records.hints({ kind: 'thread', sourceId: records.sourceId, threadId: id }); expect(result.status).toBe('unsupported'); expect(result.paths).toEqual([]);
  } finally { records.close(); await rm(root, { recursive: true, force: true }); }
});
it('preserves adapter diagnostics instead of presenting partially read records as complete', async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'lens-hint-diagnostic-')));
  try {
    await writeFile(path.join(root, 'TASKS.md'), '- [ ] still available');
    const result = await discoverCandidates({ grant: { id: 'test', kind: 'directory', realPath: root, displayPath: root }, hints: { status: 'ready', paths: [], diagnostics: ['会话记录增量读取尚未完成'] } });
    expect(result.candidates).toHaveLength(1); expect(result.diagnostics).toContain('会话记录增量读取尚未完成');
  } finally { await rm(root, { recursive: true, force: true }); }
});
