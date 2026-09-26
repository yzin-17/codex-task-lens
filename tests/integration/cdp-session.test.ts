import { expect, it } from 'vitest';
import { CdpSession, type Socket } from '../../src/adapters/codex/cdp/session.js';
class TestSocket extends EventTarget implements Socket {
  readyState = 1; sent: { id: number; method: string }[] = [];
  send(value: string) { this.sent.push(JSON.parse(value)); }
  close() { this.readyState = 3; }
  reply(data: unknown) { this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(data) })); }
}
async function setup(timeoutMs = 100) {
  const socket = new TestSocket();
  const session = await CdpSession.connect('ws://127.0.0.1:9341/devtools/page/FIXTURE', async () => undefined, { timeoutMs, socketFactory: () => { queueMicrotask(() => socket.dispatchEvent(new Event('open'))); return socket; } });
  return { socket, session };
}
it('validates before creating a socket', async () => {
  let created = false;
  await expect(CdpSession.connect('ws://127.0.0.1/', async () => { throw new Error('untrusted'); }, { socketFactory: () => { created = true; return new TestSocket(); } })).rejects.toThrow('untrusted');
  expect(created).toBe(false);
});
it('correlates out-of-order responses and ignores duplicates', async () => {
  const { session, socket } = await setup();
  const a = session.send('Runtime.enable'), b = session.send('Page.enable');
  socket.reply({ id: socket.sent[1]!.id, result: { b: true } }); socket.reply({ id: socket.sent[0]!.id, result: { a: true } }); socket.reply({ id: 1 });
  expect(await a).toEqual({ a: true }); expect(await b).toEqual({ b: true }); session.close();
});
it('times out, reports protocol errors and rejects pending work on close', async () => {
  const { session, socket } = await setup(15);
  await expect(session.send('Timeout')).rejects.toThrow('超时');
  const error = session.send('Invalid'); socket.reply({ id: socket.sent.at(-1)!.id, error: { message: 'private text is not exposed' } });
  await expect(error).rejects.toThrow('执行失败');
  const pending = session.send('Pending'); const rejected = expect(pending).rejects.toThrow('断开'); session.close(); await rejected;
  expect(session.resources()).toEqual({ pending: 0, listeners: 0 });
});
it('cleans event handlers and notifies disconnect exactly once', async () => {
  const { session, socket } = await setup(); let calls = 0;
  const unsubscribe = session.on('Runtime.executionContextCreated', () => calls++);
  socket.reply({ method: 'Runtime.executionContextCreated', params: { context: { id: 7 } } }); unsubscribe();
  socket.reply({ method: 'Runtime.executionContextCreated' });
  let closed = 0; session.on('disconnected', () => closed++); socket.dispatchEvent(new Event('close')); session.close();
  expect(calls).toBe(1); expect(closed).toBe(1); expect(session.resources()).toEqual({ pending: 0, listeners: 0 });
});
