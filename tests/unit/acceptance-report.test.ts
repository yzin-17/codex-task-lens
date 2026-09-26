import { test, expect } from 'vitest';
import { mkdtemp, readFile, rm, stat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AcceptanceReport, AUTOMATED_CHECKS, OPERATOR_CHECKS, percentile95, writeAcceptanceReport } from '../../src/validation/acceptance-report.js';
function complete(provenance: 'codex-desktop' | 'controlled-fixture' = 'codex-desktop') {
  const report = new AcceptanceReport(provenance);
  report.environment = { platform: 'darwin', architecture: 'arm64', macOS: 'fixture', codexVersion: 'fixture', node: 'fixture', signedEndpoint: true, commit: 'a'.repeat(40), artifactHash: 'b'.repeat(64), cleanWorktree: true };
  report.capture('a', 'private-target', 'private-thread-a', 1); report.capture('b', 'private-target', 'private-thread-b', 1); report.capture('return_a', 'private-target', 'private-thread-a', 1);
  report.setLatency(Array.from({ length: 20 }, (_, i) => i + 1));
  for (let i = 1; i <= 50; i++) report.addCycle(i, { roots: 0, documents: 0, subscribers: 0 });
  return report;
}
test('a run requires all measured and operator checks; missing evidence is never success', () => {
  const report = complete();
  for (const id of AUTOMATED_CHECKS) report.finish(id, 'passed');
  expect(report.snapshot().acceptanceComplete).toBe(false);
  for (const id of OPERATOR_CHECKS) report.finish(id, 'passed');
  expect(report.snapshot().acceptanceComplete).toBe(true);
});
test('fixtures, skipped observations, dirty trees, failed cleanup and invalid evidence cannot pass', () => {
  for (const mode of ['fixture', 'skip', 'dirty', 'leak', 'slow', 'missing'] as const) {
    const report = mode === 'missing' ? new AcceptanceReport('codex-desktop') : complete(mode === 'fixture' ? 'controlled-fixture' : 'codex-desktop');
    for (const id of [...AUTOMATED_CHECKS, ...OPERATOR_CHECKS]) report.finish(id, mode === 'skip' && id === 'host_controls' ? 'blocked' : 'passed');
    if (mode === 'dirty') report.environment!.cleanWorktree = false;
    if (mode === 'leak') report.addCycle(51, { roots: 1, documents: 0, subscribers: 0 });
    if (mode === 'slow') report.setLatency(Array(20).fill(1001));
    expect(report.snapshot().acceptanceComplete).toBe(false);
  }
});
test('nearest-rank p95 preserves raw samples and rejects fabricated sizes and values', () => {
  expect(percentile95(Array.from({ length: 20 }, (_, i) => i + 1))).toBe(19);
  for (const values of [[], [1], Array(20).fill(NaN), Array(20).fill(-1)]) expect(() => percentile95(values)).toThrow();
  const report = complete(), data = report.snapshot();
  data.latency.samplesMs[0] = -1; expect(report.snapshot().latency.samplesMs[0]).toBe(1);
});
test('raw identities, salts and private exceptions are not exported and checks cannot be overwritten', () => {
  const report = complete(); report.finish('environment', 'failed', 1, 'check_failed');
  expect(() => report.finish('environment', 'passed')).toThrow();
  expect(() => report.finish('host_controls', 'failed', 0, '/Users/private/secret')).toThrow();
  const serialized = JSON.stringify(report.snapshot());
  expect(serialized).not.toContain('private-thread'); expect(serialized).not.toContain('private-target'); expect(serialized).not.toContain(report.salt);
  expect(report.snapshot().identities[0]!.threadHash).toBe(report.snapshot().identities[2]!.threadHash);
});
test('report export is exclusive, private, readable and never follows a report-directory symlink', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'lens-report-'));
  try {
    const files = await writeAcceptanceReport(complete(), root);
    expect(JSON.parse(await readFile(files.json, 'utf8')).acceptanceComplete).toBe(false);
    expect(await readFile(files.markdown, 'utf8')).toContain('未完成或未通过');
    expect((await stat(files.json)).mode & 0o777).toBe(0o600);
    const link = root + '-link'; await symlink(root, link);
    try { await expect(writeAcceptanceReport(complete(), link)).rejects.toThrow(); } finally { await rm(link); }
  } finally { await rm(root, { recursive: true, force: true }); }
});
