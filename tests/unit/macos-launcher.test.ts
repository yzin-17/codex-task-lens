import { describe, it, expect } from 'vitest';
import { parseListeners, isCodexTarget, launchCodex, verifyEndpoint, type Command, type CodexApp } from '../../src/platform/macos/codex-app.js';
const app: CodexApp = { bundle: '/Applications/Example Codex.app', executable: '/Applications/Example Codex.app/Contents/MacOS/ChatGPT', version: 'fixture', bundleId: 'com.openai.codex' };
const target = { id: 'ABCD', type: 'page', url: 'app://-/index.html', webSocketDebuggerUrl: 'ws://127.0.0.1:9341/devtools/page/ABCD' };
describe('macOS trusted endpoint and non-disruptive launch', () => {
  it('requires loopback listeners owned by one process', () => {
    expect(parseListeners('p42\nn127.0.0.1:9341\nn[::1]:9341\n', 9341)).toBe(42);
    for (const output of ['p42\nn*:9341', 'p42\nn0.0.0.0:9341', 'p42\nn127.0.0.1:9341\np43\nn[::1]:9341', 'n127.0.0.1:9341']) expect(() => parseListeners(output, 9341)).toThrow();
    expect(() => parseListeners('', 9341)).toThrow();
  });
  it('accepts only app renderer and a matching loopback page socket', () => {
    expect(isCodexTarget(target, 9341)).toBe(true);
    for (const patch of [{ type: 'iframe' }, { url: 'https://example.com' }, { url: 'app://-/avatar-overlay' }, { url: 'app://-/index.html?initialRoute=side' }, { webSocketDebuggerUrl: 'ws://evil.invalid:9341/devtools/page/ABCD' }, { webSocketDebuggerUrl: 'ws://127.0.0.1:9341/devtools/page/OTHER' }]) expect(isCodexTarget({ ...target, ...patch }, 9341)).toBe(false);
  });
  it('checks process ownership before querying any endpoint', async () => {
    let queried = false;
    const run: Command = async program => ({ stdout: program.endsWith('lsof') ? 'p42\nn127.0.0.1:9341\n' : '/untrusted/app', stderr: '' });
    await expect(verifyEndpoint(app, 9341, run, async () => { queried = true; return [target]; })).rejects.toThrow('不属于');
    expect(queried).toBe(false);
  });
  it('rechecks ownership after discovery', async () => {
    let probes = 0;
    const run: Command = async program => ({ stdout: program.endsWith('lsof') ? `p${++probes === 1 ? 42 : 43}\nn127.0.0.1:9341\n` : app.executable, stderr: '' });
    await expect(verifyEndpoint(app, 9341, run, async () => [target])).rejects.toThrow('变化');
  });
  it('never restarts a running application, takes an occupied port or launches without consent', async () => {
    const calls: string[] = [];
    const running: Command = async program => { calls.push(program); return { stdout: app.executable, stderr: '' }; };
    await expect(launchCodex(app, 9341, false, running)).rejects.toThrow('确认');
    expect(calls).toHaveLength(0);
    await expect(launchCodex(app, 9341, true, running)).rejects.toThrow('已运行');
    expect(calls).toEqual(['/bin/ps']);
    const occupied: Command = async program => ({ stdout: program.endsWith('lsof') ? 'p2\nn*:9341' : '', stderr: '' });
    await expect(launchCodex(app, 9341, true, occupied)).rejects.toThrow('占用');
  });
  it('uses an argument array for a single explicit launch', async () => {
    const calls: { program: string; args: string[] }[] = [];
    const run: Command = async (program, args) => { calls.push({ program, args }); return { stdout: '', stderr: '' }; };
    await launchCodex(app, 9341, true, run);
    expect(calls.at(-1)).toEqual({ program: '/usr/bin/open', args: ['-na', app.bundle, '--args', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=9341'] });
    expect(calls.some(call => /kill|sudo|sh$/.test(call.program))).toBe(false);
  });
});
