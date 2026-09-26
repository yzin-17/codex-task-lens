import { LensError } from '../contracts/index.js';
const encoder = new TextEncoder();
/** Stops repeated group/heading labels from amplifying a small source into a huge snapshot. */
export class TaskBudget {
  private used = 0;
  constructor(private readonly maximum = 8 * 1024 * 1024) {}
  add(value: unknown): void {
    this.used += encoder.encode(JSON.stringify(value) ?? '').byteLength + 32;
    if (this.used > this.maximum) throw new LensError('unsupported', '解析后的任务数据超过安全大小限制，请缩小文档或章节');
  }
}
