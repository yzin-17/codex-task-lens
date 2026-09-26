import { it, expect } from 'vitest';
import { verifyEndpoint, type Command, type CodexApp } from '../../src/platform/macos/codex-app.js';
const app: CodexApp = { bundle: '/Applications/Codex.app', executable: '/Applications/Codex.app/Contents/MacOS/ChatGPT', version: 'fixture', bundleId: 'com.openai.codex' };
function fixture(patch: { device?: string; parent?: string; uid?: string; signed?: boolean; name?: string } = {}) {
  const calls: string[][] = [];
  const run: Command = async (program, args) => {
    calls.push([program, ...args]);
    if (program.endsWith('lsof')) return { stdout: `p42\nf61\nd0x1234\nn127.0.0.1:9341\np43\nf61\nd${patch.device ?? '0x1234'}\nn127.0.0.1:9341\n`, stderr: '' };
    if (program.endsWith('ps')) return { stdout: args.at(-1) === 'comm=' ? (args[1] === '42' ? app.executable : '/helper/' + (patch.name ?? 'SkyComputerUseService')) : args.at(-1) === 'uid=' ? '501' : `${patch.parent ?? '42'} ${patch.uid ?? '501'}`, stderr: '' };
    if (args.at(-1)?.startsWith('/helper/') && patch.signed === false) throw new Error('signature rejected');
    return { stdout: '', stderr: '' };
  };
  return { run, calls };
}
it('accepts only the same kernel socket inherited by the signed same-user direct helper', async () => {
  const { run, calls } = fixture();
  expect((await verifyEndpoint(app, 9341, run, async () => [])).pid).toBe(42);
  expect(calls.some(args => args.includes('=anchor apple generic and certificate leaf[subject.OU] = "2DC432GLL2" and identifier "com.openai.sky.CUAService"'))).toBe(true);
});
it.each([{ device: '0x9999' }, { device: '' }, { parent: '1' }, { uid: '502' }, { signed: false }, { name: 'imposter' }])('rejects unverified co-listeners before HTTP discovery: %j', async patch => {
  const { run } = fixture(patch); let queried = false;
  await expect(verifyEndpoint(app, 9341, run, async () => { queried = true; return []; })).rejects.toThrow();
  expect(queried).toBe(false);
});
