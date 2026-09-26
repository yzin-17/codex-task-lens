import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile);
/** Caller resolves an existing authorized source reference first. No shell is used. */
export async function openSourceFile(file: string, platform: NodeJS.Platform = process.platform): Promise<boolean> {
  if (platform !== 'darwin') return false;
  await execute('/usr/bin/open', ['-t', file], { timeout: 10000, maxBuffer: 4096 });
  return true;
}
