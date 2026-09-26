import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { LensError } from '../../contracts/index.js';
import { validPort, fetchTargetList, isCodexTarget, type CodexApp, type TrustedEndpoint } from '../macos/codex-app.js';
export type SystemQuery = (operation: 'discover' | 'inspect' | 'listeners' | 'process', input: Record<string, unknown>) => Promise<unknown>;
// Fixed read-only PowerShell; user data is JSON in an environment variable, never executable text.
const queryScript = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$d = $env:TASK_LENS_QUERY | ConvertFrom-Json
$result = switch ($d.operation) {
  'inspect' {
    $f = Get-Item -LiteralPath $d.path
    $s = Get-AuthenticodeSignature -LiteralPath $f.FullName
    [pscustomobject]@{ path=$f.FullName; version=$f.VersionInfo.ProductVersion; product=$f.VersionInfo.ProductName; status=$s.Status.ToString(); subject=$s.SignerCertificate.Subject }
  }
  'process' {
    $p = Get-CimInstance Win32_Process -Filter ('ProcessId=' + [int]$d.pid)
    if ($p) { [pscustomobject]@{ pid=[int]$p.ProcessId; path=$p.ExecutablePath; created=$p.CreationDate.ToUniversalTime().ToString('o') } }
  }
  'listeners' {
    @(Get-NetTCPConnection -State Listen -LocalPort ([int]$d.port) -ErrorAction SilentlyContinue | ForEach-Object { [pscustomobject]@{ pid=[int]$_.OwningProcess; address=$_.LocalAddress; port=[int]$_.LocalPort } })
  }
  'discover' {
    @(Get-CimInstance Win32_Process -Filter "Name='Codex.exe' OR Name='ChatGPT.exe'" | ForEach-Object { $_.ExecutablePath })
    @(Get-AppxPackage | Where-Object { $_.Name -match 'Codex|^OpenAI\.' } | Select-Object -First 16 | ForEach-Object {
      $p=$_; try { $m=Get-AppxPackageManifest -Package $p; foreach($a in $m.Package.Applications.Application) { if($a.Executable) { Join-Path $p.InstallLocation $a.Executable } } } catch {}
    })
    (Join-Path $env:LOCALAPPDATA 'Programs\Codex\Codex.exe')
    (Join-Path $env:ProgramFiles 'Codex\Codex.exe')
  }
  default { throw 'Unsupported query' }
}
ConvertTo-Json -InputObject $result -Compress -Depth 6
`;
export const querySystem: SystemQuery = async (operation, input) => {
  if (process.platform !== 'win32') throw new LensError('unsupported', 'Windows 系统查询仅在 Windows 可用');
  const program = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
  try {
    const { stdout } = await promisify(execFile)(program, ['-NoProfile', '-NonInteractive', '-Command', queryScript], { encoding: 'utf8', windowsHide: true, timeout: 12000, maxBuffer: 512 * 1024, env: { ...process.env, TASK_LENS_QUERY: JSON.stringify({ ...input, operation }) } });
    return JSON.parse(stdout.replace(/^\uFEFF/, '').trim() || 'null');
  } catch { throw new LensError('unsupported', 'Windows 应用/签名/端口查询失败；独立面板仍可使用'); }
};
const array = (value: unknown): unknown[] => value === null ? [] : Array.isArray(value) ? value : [value];
export function trustedPublisher(subject: unknown): boolean {
  if (typeof subject !== 'string') return false;
  const allowed = new Set(['openai', 'openai, inc.', 'openai, inc', 'openai opco, llc', 'openai opco llc']);
  return subject.split(/,\s*(?=[A-Z]+=)/i).some(part => { const match = /^(?:CN|O)=(.*)$/i.exec(part.trim()); return !!match && allowed.has(match[1]!.replace(/^"|"$/g, '').trim().toLowerCase()); });
}
const samePath = (a: string, b: string) => path.win32.normalize(a).toLowerCase() === path.win32.normalize(b).toLowerCase();
export async function inspectApp(input: string, run: SystemQuery = querySystem): Promise<CodexApp> {
  if (!/^[A-Za-z]:[\\/]/.test(input) || !/\.exe$/i.test(input) || input.length > 4096 || /[\0\r\n]/.test(input)) throw new LensError('invalid_request', '请选择本机 Codex.exe 的绝对路径');
  const info = await run('inspect', { path: input }) as { path?: string; status?: string; subject?: string; product?: string; version?: string } | null;
  if (!info?.path || !samePath(info.path, input) || info.status !== 'Valid' || !trustedPublisher(info.subject) || !/^(?:Codex|ChatGPT)$/i.test(info.product ?? '')) throw new LensError('permission_denied', '应用未通过 OpenAI 发布者签名和产品身份检查');
  return { bundle: path.win32.dirname(info.path), executable: info.path, version: String(info.version ?? 'unknown'), bundleId: 'com.openai.codex.windows' };
}
export async function discoverApp(input?: string, run: SystemQuery = querySystem): Promise<CodexApp> {
  if (input) return inspectApp(input, run);
  const paths = [...new Set(array(await run('discover', {})).filter((p): p is string => typeof p === 'string' && !!p))];
  for (const candidate of paths.slice(0, 48)) { try { return await inspectApp(candidate, run); } catch { /* Never trust an unsigned fallback. */ } }
  throw new LensError('missing', '未找到通过签名验证的 Codex；请在设置中选择应用');
}
export function windowsListeners(value: unknown, port: number): { pid: number; address: string; port: number }[] {
  validPort(port); const rows = array(value);
  if (!rows.length) throw new LensError('missing', '未开放 CDP 端口；请在控制台明确选择调试启动');
  if (rows.length > 16) throw new LensError('permission_denied', '监听记录超限');
  return rows.map(value => {
    const row = value as { pid: number; address: string; port: number } | null;
    if (!row || !Number.isSafeInteger(row.pid) || row.pid <= 0 || row.port !== port || !['127.0.0.1', '::1'].includes(row.address)) throw new LensError('permission_denied', 'CDP 必须仅在本机回环地址监听');
    return { pid: row.pid, address: row.address, port: row.port };
  });
}
export async function verifyEndpoint(app: CodexApp, port: number, run: SystemQuery = querySystem, list = fetchTargetList): Promise<TrustedEndpoint> {
  const before = windowsListeners(await run('listeners', { port: validPort(port) }), port), pids = new Set(before.map(row => row.pid));
  if (pids.size !== 1) throw new LensError('permission_denied', 'CDP 端口属于多个不同进程');
  const pid = [...pids][0]!;
  const owner = await run('process', { pid }) as { path?: string; created?: string } | null;
  if (!owner?.path || !owner.created || !samePath(owner.path, app.executable)) throw new LensError('permission_denied', '端口不属于已选择的 Codex 应用');
  await inspectApp(app.executable, run);
  const targets = (await list(port)).filter(value => isCodexTarget(value, port));
  const after = windowsListeners(await run('listeners', { port }), port), ownerAfter = await run('process', { pid });
  const fingerprint = (rows: typeof before) => JSON.stringify(rows.map(row => `${row.pid}:${row.address}:${row.port}`).sort());
  if (fingerprint(before) !== fingerprint(after) || JSON.stringify(owner) !== JSON.stringify(ownerAfter)) throw new LensError('permission_denied', '验证期间端口进程发生变化');
  return { port, pid, app, targets };
}
export async function launchCodex(app: CodexApp, port: number, consent: boolean, run: SystemQuery = querySystem): Promise<void> {
  validPort(port); if (!consent) throw new LensError('permission_denied', '调试启动需要明确确认');
  await inspectApp(app.executable, run);
  // Any existing listener is left untouched, including an untrusted one.
  if (array(await run('listeners', { port })).length) throw new LensError('already_running', '端口已使用，不终止或接管现有进程');
  const paths = array(await run('discover', {}));
  // Discover also includes installed paths; the process query below must distinguish running apps.
  void paths;
  const program = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
  const check = await promisify(execFile)(program, ['-NoProfile', '-NonInteractive', '-Command', "$p=Get-CimInstance Win32_Process -Filter \"Name='Codex.exe' OR Name='ChatGPT.exe'\"; ConvertTo-Json -InputObject @($p | ForEach-Object {$_.ExecutablePath}) -Compress"], { encoding: 'utf8', windowsHide: true, timeout: 12000, maxBuffer: 65536 });
  if (array(JSON.parse(check.stdout.trim() || 'null')).some(p => typeof p === 'string' && samePath(p, app.executable))) throw new LensError('already_running', 'Codex 已运行，请等待任务结束并正常退出，不会强制重启');
  const child = spawn(app.executable, ['--remote-debugging-address=127.0.0.1', `--remote-debugging-port=${port}`], { detached: true, stdio: 'ignore', windowsHide: false });
  await new Promise<void>((resolve, reject) => { child.once('error', reject); child.once('spawn', resolve); }); child.unref();
}
