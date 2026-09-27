import { LensError } from '../contracts/index.js';
import { selectMarkdownFiles as selectMac } from './macos/select-markdown.js';
import { selectMarkdownFilesWindows as selectWindows } from './windows/select-markdown.js';

export async function selectMarkdownFiles() {
  if (process.platform === 'darwin') return selectMac();
  if (process.platform === 'win32') return selectWindows();
  throw new LensError('unsupported', '当前平台请使用路径输入');
}
