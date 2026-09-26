import { createHash, randomBytes } from 'node:crypto';
import { chmod, lstat, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const AUTOMATED_CHECKS = ['environment', 'conversation_a', 'conversation_b', 'return_to_a', 'file_lifecycle', 'update_latency', 'restart_restore', 'mount_cleanup', 'standalone_fallback', 'final_cleanup'] as const;
export const OPERATOR_CHECKS = ['multiple_windows', 'auxiliary_and_unknown', 'worktree_and_shared_document', 'session_candidates', 'host_controls', 'theme_and_layout', 'page_reload_and_disconnect', 'missed_event_recovery', 'security_boundaries'] as const;
export type CheckId = typeof AUTOMATED_CHECKS[number] | typeof OPERATOR_CHECKS[number];
export type CheckStatus = 'pending' | 'passed' | 'failed' | 'blocked';
export type CheckResult = { id: CheckId; evidence: 'measured' | 'operator'; status: CheckStatus; durationMs: number; reason: string };
export type EnvironmentEvidence = { platform: string; architecture: string; macOS: string; codexVersion: string; node: string; signedEndpoint: boolean; commit: string | null; artifactHash: string; cleanWorktree: boolean };
export function percentile95(samples: readonly number[]): number {
  if (samples.length !== 20 || samples.some(value => !Number.isFinite(value) || value < 0)) throw new Error('Exactly twenty finite nonnegative measurements are required');
  return [...samples].sort((a, b) => a - b)[Math.ceil(samples.length * 0.95) - 1]!;
}
/** Incomplete, skipped and fixture-only runs can never be promoted to real-device acceptance. */
export class AcceptanceReport {
  readonly runId = randomBytes(12).toString('hex');
  readonly startedAt = new Date().toISOString();
  readonly salt = randomBytes(32).toString('hex');
  private checks = new Map<CheckId, CheckResult>();
  environment: EnvironmentEvidence | null = null;
  private samples: number[] = [];
  private identities: { stage: 'a' | 'b' | 'return_a'; targetHash: string; threadHash: string; identifiedPanes: number }[] = [];
  private cycles: { iteration: number; rootsAfterStop: number; documentsAfterStop: number; subscribersAfterStop: number }[] = [];
  constructor(readonly provenance: 'codex-desktop' | 'controlled-fixture') {
    for (const id of AUTOMATED_CHECKS) this.checks.set(id, { id, evidence: 'measured', status: 'pending', durationMs: 0, reason: 'not_run' });
    for (const id of OPERATOR_CHECKS) this.checks.set(id, { id, evidence: 'operator', status: 'pending', durationMs: 0, reason: 'not_observed' });
  }
  private hash(value: string): string { return createHash('sha256').update(this.salt + value).digest('hex').slice(0, 24); }
  capture(stage: 'a' | 'b' | 'return_a', target: string, thread: string, identifiedPanes: number): void {
    if (this.identities.some(item => item.stage === stage)) throw new Error('Duplicate capture');
    this.identities.push({ stage, targetHash: this.hash(target), threadHash: this.hash(thread), identifiedPanes });
  }
  setLatency(samples: readonly number[]): void { percentile95(samples); this.samples = [...samples]; }
  addCycle(iteration: number, resources: { roots: number; documents: number; subscribers: number }): void {
    this.cycles.push({ iteration, rootsAfterStop: resources.roots, documentsAfterStop: resources.documents, subscribersAfterStop: resources.subscribers });
  }
  finish(id: CheckId, status: Exclude<CheckStatus, 'pending'>, durationMs = 0, reason = status): void {
    const old = this.checks.get(id);
    if (!old || old.status !== 'pending' || !['passed', 'failed', 'blocked'].includes(status) || !Number.isFinite(durationMs) || durationMs < 0) throw new Error('Invalid or duplicate check result');
    if (!/^[a-z0-9_]{1,80}$/.test(reason)) throw new Error('Report reasons must be fixed diagnostic codes, not private exception text');
    this.checks.set(id, { ...old, status, durationMs: Math.round(durationMs), reason });
  }
  status(id: CheckId): CheckStatus { return this.checks.get(id)!.status; }
  snapshot() {
    const checks = [...this.checks.values()].map(check => ({ ...check }));
    const a = this.identities.find(item => item.stage === 'a'), b = this.identities.find(item => item.stage === 'b'), returned = this.identities.find(item => item.stage === 'return_a');
    const identityComplete = !!a && !!b && !!returned && a.threadHash !== b.threadHash && returned.threadHash === a.threadHash && returned.targetHash === a.targetHash;
    const evidenceComplete = identityComplete && this.samples.length === 20 && percentile95(this.samples) <= 1000 && this.cycles.length === 50 && this.cycles.every((item, index) => item.iteration === index + 1 && item.rootsAfterStop === 0 && item.documentsAfterStop === 0 && item.subscribersAfterStop === 0);
    const environmentValid = this.environment?.platform === 'darwin' && this.environment.signedEndpoint && this.environment.cleanWorktree && /^[a-f0-9]{40}$/.test(this.environment.commit ?? '') && /^[a-f0-9]{64}$/.test(this.environment.artifactHash);
    return { schemaVersion: 1, runId: this.runId, startedAt: this.startedAt, reportedAt: new Date().toISOString(), provenance: this.provenance, environment: this.environment && { ...this.environment }, checks, identities: this.identities.map(item => ({ ...item })), latency: { samplesMs: [...this.samples], p95Ms: this.samples.length === 20 ? percentile95(this.samples) : null, requiredSamples: 20, thresholdMs: 1000, taskCount: 1000, observation: 'stable_save_to_visible_panel_polling', pollingMs: 25 }, cleanupCycles: this.cycles.map(item => ({ ...item })), acceptanceComplete: this.provenance === 'codex-desktop' && !!environmentValid && evidenceComplete && checks.every(check => check.status === 'passed'), note: 'Operator checks are explicit human observations, not automated assertions. This report does not mark Task documents or complete R1.' };
  }
}
export async function writeAcceptanceReport(report: AcceptanceReport, parent: string): Promise<{ json: string; markdown: string }> {
  await mkdir(parent, { recursive: true, mode: 0o700 });
  const info = await lstat(parent);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Report directory must be a real directory');
  const directory = await mkdtemp(path.join(parent, 'mac-acceptance-')); await chmod(directory, 0o700);
  const result = report.snapshot(), json = path.join(directory, 'report.json'), markdown = path.join(directory, 'report.md');
  const lines = ['# Codex Task Lens 真机验收报告', '', `运行：${result.runId}`, `结论：${result.acceptanceComplete ? 'I2 场景记录齐备，仍须 R1 审计' : '未完成或未通过'}`, `来源：${result.provenance}`, '', '| 检查 | 证据类型 | 状态 | 诊断 |', '| --- | --- | --- | --- |', ...result.checks.map(check => `| ${check.id} | ${check.evidence} | ${check.status} | ${check.reason} |`), '', `20 次更新 p95：${result.latency.p95Ms === null ? '未测完' : result.latency.p95Ms.toFixed(2) + ' ms'}`, `清理循环：${result.cleanupCycles.length} / 50`, '', '完整原始时延、版本、产物指纹和脱敏对话关联见 report.json。人工观察和自动测量分开保存；不自动勾选 Task，不上传报告。', ''];
  await writeFile(json, JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  await writeFile(markdown, lines.join('\n'), { flag: 'wx', mode: 0o600 });
  return { json, markdown };
}
