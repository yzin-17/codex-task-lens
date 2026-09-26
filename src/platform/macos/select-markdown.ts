import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { LensError, MAX_DOCUMENTS } from '../../contracts/index.js';
const script = 'const app = Application.currentApplication(); app.includeStandardAdditions = true; try { const files = app.chooseFile({withPrompt:"选择 Markdown 文档（可多选）", ofType:["md","markdown"], multipleSelectionsAllowed:true}); JSON.stringify({paths:files.map(file=>file.toString()),cancelled:false}); } catch(error) { if(error.errorNumber===-128) JSON.stringify({paths:[],cancelled:true}); else throw error; }';
type Run = (program: string, args: string[]) => Promise<{ stdout: string }>;
const execute: Run = (program, args) => promisify(execFile)(program, args, { encoding: 'utf8', timeout: 120000, maxBuffer: 128 * 1024 });
let selecting = false;
export function validateSelection(value: unknown): { paths: string[]; cancelled: boolean } {
  const result = value as { paths?: unknown; cancelled?: unknown } | null;
  if (!result || !Array.isArray(result.paths) || result.paths.length > MAX_DOCUMENTS || typeof result.cancelled !== 'boolean') throw new LensError('unsupported', '最多选择 16 份 Markdown 文档');
  if (result.cancelled && result.paths.length) throw new LensError('unsupported', '文件选择结果无效');
  const paths = result.paths.map(file => {
    if (typeof file !== 'string' || !path.isAbsolute(file) || file.length > 4096 || file.includes('\0') || /[\r\n]/.test(file) || !/\.(md|markdown)$/i.test(file)) throw new LensError('unsupported', '请选择本地 .md 或 .markdown 文件');
    return file;
  });
  return { paths: [...new Set(paths)], cancelled: result.cancelled };
}
export async function selectMarkdownFiles(run: Run = execute) {
  if (process.platform !== 'darwin' && run === execute) throw new LensError('unsupported', '当前平台请使用多行路径输入');
  if (selecting) throw new LensError('busy', '已有文件选择窗口，请先完成或取消');
  selecting = true;
  try { const result = await run('/usr/bin/osascript', ['-l', 'JavaScript', '-e', script]); return validateSelection(JSON.parse(result.stdout)); }
  catch (error) { if (error instanceof LensError) throw error; throw new LensError('error', '系统文件选择不可用，请使用路径输入'); }
  finally { selecting = false; }
}
