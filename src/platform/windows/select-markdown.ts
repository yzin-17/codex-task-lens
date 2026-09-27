import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { LensError, MAX_DOCUMENTS } from '../../contracts/index.js';

const script = String.raw`
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Title = '选择 Markdown 文档（可多选）'
$dialog.Filter = 'Markdown (*.md;*.markdown)|*.md;*.markdown'
$dialog.Multiselect = $true
$result = $dialog.ShowDialog()
if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
  [pscustomobject]@{paths=@($dialog.FileNames);cancelled=$false} | ConvertTo-Json -Compress
} else {
  [pscustomobject]@{paths=@();cancelled=$true} | ConvertTo-Json -Compress
}
`;
type Run = (program: string, args: string[]) => Promise<{ stdout: string }>;
const execute: Run = (program, args) => promisify(execFile)(program, args, { encoding: 'utf8', timeout: 120000, maxBuffer: 128 * 1024, windowsHide: true });
export function validateWindowsSelection(value: unknown): { paths: string[]; cancelled: boolean } {
  const result = value as { paths?: unknown; cancelled?: unknown } | null;
  if (!result || !Array.isArray(result.paths) || result.paths.length > MAX_DOCUMENTS || typeof result.cancelled !== 'boolean') throw new LensError('unsupported', '最多选择 16 份 Markdown 文档');
  const paths = result.paths.map(file => { if (typeof file !== 'string' || !path.win32.isAbsolute(file) || file.length > 4096 || /[\0\r\n]/.test(file) || !/\.(md|markdown)$/i.test(file)) throw new LensError('unsupported', '请选择本地 .md 或 .markdown 文件'); return file; });
  return { paths: [...new Set(paths)], cancelled: result.cancelled };
}
export async function selectMarkdownFilesWindows(run: Run = execute) {  if (process.platform !== 'win32' && run === execute) throw new LensError('unsupported', 'Windows 文件选择仅在 Windows 可用');
  const program = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
  try { const result = await run(program, ['-NoProfile', '-STA', '-Command', script]); return validateWindowsSelection(JSON.parse(result.stdout.replace(/^\uFEFF/, '').trim())); }
  catch (error) { if (error instanceof LensError) throw error; throw new LensError('error', '系统文件选择不可用，请使用路径输入'); }
}