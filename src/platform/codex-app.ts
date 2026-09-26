import * as macos from './macos/codex-app.js';
import * as windows from './windows/codex-app.js';
import { homedir } from 'node:os';
import path from 'node:path';
export type { CodexApp, TrustedEndpoint, CdpTarget } from './macos/codex-app.js';
export { validPort } from './macos/codex-app.js';
const adapter = () => process.platform === 'win32' ? windows : macos;
export const discoverApp = (input?: string) => adapter().discoverApp(input);
export const verifyEndpoint = (app: macos.CodexApp, port: number) => adapter().verifyEndpoint(app, port);
export const launchCodex = (app: macos.CodexApp, port: number, consent: boolean) => adapter().launchCodex(app, port, consent);
export function defaultDataDirectory(): string {
  if (process.platform === 'darwin') return path.join(homedir(), 'Library/Application Support/CodexTaskLens');
  if (process.platform === 'win32') return path.join(process.env.APPDATA || path.join(homedir(), 'AppData/Roaming'), 'CodexTaskLens');
  return path.join(process.env.XDG_CONFIG_HOME || path.join(homedir(), '.config'), 'CodexTaskLens');
}
