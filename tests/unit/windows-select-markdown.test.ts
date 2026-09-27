import { describe, expect, it } from 'vitest';
import { validateWindowsSelection, selectMarkdownFilesWindows } from '../../src/platform/windows/select-markdown.js';

describe('Windows Markdown picker', () => {
  it('accepts only absolute Markdown files and deduplicates selection', () => {
    expect(validateWindowsSelection({ paths: ['C:\\work\\a.md', 'C:\\work\\a.md', 'D:\\b.markdown'], cancelled: false })).toEqual({ paths: ['C:\\work\\a.md', 'D:\\b.markdown'], cancelled: false });
    expect(() => validateWindowsSelection({ paths: ['relative.md'], cancelled: false })).toThrow('请选择');
    expect(() => validateWindowsSelection({ paths: ['C:\\work\\a.txt'], cancelled: false })).toThrow('请选择');
  });
  it('parses a system picker response without requiring Windows in tests', async () => {
    const run = async () => ({ stdout: JSON.stringify({ paths: ['C:\\work\\task.md'], cancelled: false }) });
    await expect(selectMarkdownFilesWindows(run)).resolves.toEqual({ paths: ['C:\\work\\task.md'], cancelled: false });
  });
});
