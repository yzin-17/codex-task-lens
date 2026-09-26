import { expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { inspectApp, type Command } from '../../src/platform/macos/codex-app.js';
it('resolves real bundle metadata and requires trusted signatures on bundle and executable', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'lens-app-')), bundle = path.join(root, 'Name With Spaces.app');
  await mkdir(path.join(bundle, 'Contents/MacOS'), { recursive: true }); await writeFile(path.join(bundle, 'Contents/MacOS/Actual'), 'fixture'); await chmod(path.join(bundle, 'Contents/MacOS/Actual'), 0o700);
  const calls: { program: string; args: string[] }[] = [];
  const run: Command = async (program, args) => { calls.push({ program, args }); return { stdout: program.endsWith('plutil') ? ({ CFBundleIdentifier: 'com.openai.codex', CFBundleExecutable: 'Actual', CFBundleShortVersionString: 'fixture-version' } as Record<string, string>)[args[1]!]! : '', stderr: '' }; };
  try {
    const result = await inspectApp(bundle, run); expect(path.basename(result.executable)).toBe('Actual'); expect(result.version).toBe('fixture-version');
    expect(calls.filter(call => call.program.endsWith('codesign'))).toHaveLength(2);
    expect(calls.filter(call => call.program.endsWith('codesign')).every(call => call.args.includes('--test-requirement'))).toBe(true);
    const badMetadata: Command = async (program, args) => args[1] === 'CFBundleExecutable' ? { stdout: '../escape', stderr: '' } : run(program, args);
    await expect(inspectApp(bundle, badMetadata)).rejects.toThrow('元数据');
    const badSignature: Command = async (program, args) => { if (program.endsWith('codesign')) throw new Error('signature rejected'); return run(program, args); };
    await expect(inspectApp(bundle, badSignature)).rejects.toThrow('signature rejected');
  } finally { await rm(root, { recursive: true, force: true }); }
});
