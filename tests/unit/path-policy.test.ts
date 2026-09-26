import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, symlink, unlink, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { authorizedPath, createGrant, readAuthorized, within } from '../../src/files/path-policy.js';
let root: string;
beforeEach(async()=>{ root=await mkdtemp(path.join(os.tmpdir(),'lens-path-')); await mkdir(path.join(root,'project')); await writeFile(path.join(root,'project','任务 清单.md'),'- [ ] A'); await writeFile(path.join(root,'other.md'),'- [x] B'); });
afterEach(async()=>{ await rm(root,{recursive:true,force:true}); });
describe('explicit file grants',()=>{
  it('does not authorize siblings or the parent implicitly',async()=>{
    const file=path.join(root,'project','任务 清单.md'), grant=await createGrant(file,'file');
    expect((await readAuthorized(grant,file)).source).toBe('- [ ] A');
    await expect(authorizedPath(grant,path.join(root,'other.md'))).rejects.toMatchObject({code:'permission_denied'});
  });
  it('blocks prefix confusion, traversal and escaping symbolic links',async()=>{
    const project=path.join(root,'project'), grant=await createGrant(project,'directory');
    expect(within(project,project+'-other/a.md')).toBe(false);
    await expect(authorizedPath(grant,'../other.md')).rejects.toThrow();
    const link=path.join(project,'link.md'); await symlink(path.join(root,'other.md'),link);
    await expect(readAuthorized(grant,link)).rejects.toMatchObject({code:'permission_denied'});
  });
  it('rejects a previously authorized symlink after retargeting',async()=>{
    const link=path.join(root,'alias.md'); await symlink(path.join(root,'project','任务 清单.md'),link);
    const grant=await createGrant(link,'file'); await unlink(link); await symlink(path.join(root,'other.md'),link);
    await expect(readAuthorized(grant,link)).rejects.toMatchObject({code:'permission_denied'});
  });
  it('requires absolute paths, Markdown and real files',async()=>{
    await expect(createGrant('relative.md','file')).rejects.toThrow();
    await writeFile(path.join(root,'auth.json'),'{}');
    await expect(createGrant(path.join(root,'auth.json'),'file')).rejects.toThrow('Markdown');
    await expect(createGrant(path.join(root,'missing.md'),'file')).rejects.toMatchObject({code:'missing'});
  });
  it('keeps same relative filenames in different worktrees distinct',async()=>{
    await mkdir(path.join(root,'other')); await writeFile(path.join(root,'other','任务 清单.md'),'x');
    const a=await createGrant(path.join(root,'project','任务 清单.md'),'file'), b=await createGrant(path.join(root,'other','任务 清单.md'),'file');
    expect(a.realPath).not.toBe(b.realPath);
  });
});
