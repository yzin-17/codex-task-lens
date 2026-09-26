import { beforeEach,afterEach,describe,expect,it } from 'vitest';
import { mkdtemp,mkdir,writeFile,symlink,rm } from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import { createGrant } from '../../src/files/path-policy.js';import { discoverCandidates } from '../../src/discovery/candidates.js';
let root:string;
beforeEach(async()=>{root=await mkdtemp(path.join(os.tmpdir(),'lens-discover-'));for(const dir of ['docs/tasks','tasks','archive','node_modules','notes'])await mkdir(path.join(root,dir),{recursive:true});await writeFile(path.join(root,'docs/tasks/a.md'),'# A\n- [x] done');await writeFile(path.join(root,'tasks/b.md'),'- [ ] pending');await writeFile(path.join(root,'archive/old.md'),'- [ ] old');await writeFile(path.join(root,'node_modules/hidden.md'),'- [ ] hidden');await writeFile(path.join(root,'notes/n.md'),'- [ ] note');});
afterEach(async()=>{await rm(root,{recursive:true,force:true});});
describe('explainable candidate discovery',()=>{
  it('combines authorized scan with explicit hints and deduplicates real paths',async()=>{
    const grant=await createGrant(root,'directory');
    const result=await discoverCandidates({grant,hints:{status:'ready',paths:[{path:'docs/tasks/a.md',baseDirectory:root,source:'file read'}],diagnostics:[]}});
    expect(result.candidates).toHaveLength(2);expect(result.candidates[0]?.sources).toEqual(['会话线索：file read','目录扫描']);
  });
  it('works without a log adapter and supports configured globs',async()=>{
    const grant=await createGrant(root,'directory');
    const result=await discoverCandidates({grant,patterns:['notes/**/*.md'],hints:{status:'unavailable',paths:[],diagnostics:[]}});
    expect(result.candidates).toHaveLength(1);expect(result.candidates[0]?.path).toContain('/notes/n.md');expect(result.diagnostics.join()).toContain('手动选择');
  });
  it('does not follow escaping links or invent relative bases',async()=>{
    const outside=await mkdtemp(path.join(os.tmpdir(),'lens-outside-'));
    try{await writeFile(path.join(outside,'secret.md'),'- [ ] no');await symlink(path.join(outside,'secret.md'),path.join(root,'tasks/escape.md'));
      const result=await discoverCandidates({grant:await createGrant(root,'directory'),hints:{status:'ready',paths:[{path:'a.md',source:'unknown'}],diagnostics:[]}});
      expect(result.candidates).toHaveLength(2);expect(result.diagnostics.join()).toContain('未猜测');expect(result.diagnostics.join()).toContain('授权');
    }finally{await rm(outside,{recursive:true,force:true});}
  });
  it('reports partial results at a bounded scan limit',async()=>{const result=await discoverCandidates({grant:await createGrant(root,'directory'),maxPaths:1});expect(result.incomplete).toBe(true);expect(result.checked).toBe(1);});
  it('honors cancellation and rejects escaping glob patterns',async()=>{
    const grant=await createGrant(root,'directory'),controller=new AbortController();controller.abort();
    await expect(discoverCandidates({grant,signal:controller.signal})).rejects.toMatchObject({name:'AbortError'});
    await expect(discoverCandidates({grant,patterns:['../**/*.md']})).rejects.toThrow('相对 glob');
  });
});
