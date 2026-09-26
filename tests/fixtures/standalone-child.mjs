// Test-owned child process. The runtime capability travels only over private IPC.
import { startStandalone } from '../../dist/node/host/standalone-runtime.js';
const runtime = await startStandalone({ dataDirectory: process.argv[2], port: 0, openBrowser: false });
process.send?.({ type: 'ready', origin: runtime.origin, url: runtime.url });
async function stop() { await runtime.close(); process.disconnect?.(); }
process.once('message', message => { if (message === 'stop') void stop(); });
process.once('disconnect', () => { void runtime.close(); });
