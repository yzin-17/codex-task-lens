import { afterEach,beforeEach,describe,expect,it } from 'vitest';
import { mkdtemp,writeFile,readFile,rm,stat,chmod,mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { BindingStore } from '../../src/store/binding-store.js';
import { DOCUMENT_SCOPE, type MonitorRef } from '../../src/contracts/index.js';
let root:string; const stores:BindingStore[]=[];
const ref:MonitorRef={kind:'standalone',id:'a'};
beforeEach(async()=>{root=await mkdtemp(path.join(os.tmpdir(),'lens-store-'));await writeFile(path.join(root,'task.md'),'- [ ] original');});
afterEach(async()=>{for(const store of stores.splice(0))await store.close();await rm(root,{recursive:true,force:true});});
async function openStore(){const s=await BindingStore.open(path.join(root,'state'));stores.push(s);return s;}
describe('atomic binding store',()=>{
  it('persists grants, bindings and tombstone versions across restarts',async()=>{
    const s=await openStore(),g=await s.authorize(path.join(root,'task.md'),'file');
    await s.bind(ref,{grantId:g.id,path:g.realPath,scope:DOCUMENT_SCOPE},0);
    expect(s.get(ref).bindingVersion).toBe(1);await s.close();
    const restored=await openStore();expect(restored.get(ref).binding?.documentRealPath).toBe(g.realPath);
    await restored.clear(ref,1);expect(restored.get(ref)).toMatchObject({binding:null,bindingVersion:2});
    await expect(restored.bind(ref,{grantId:g.id,path:g.realPath,scope:DOCUMENT_SCOPE},0)).rejects.toMatchObject({code:'conflict'});
    expect(await readFile(g.realPath,'utf8')).toBe('- [ ] original');
    expect((await stat(path.join(root,'state','state.json'))).mode&0o777).toBe(0o600);
  });
  it('serializes competing confirmation and permits separate monitors sharing one document',async()=>{
    const s=await openStore(),g=await s.authorize(path.join(root,'task.md'),'file');
    const doc={grantId:g.id,path:g.realPath,scope:DOCUMENT_SCOPE};
    const results=await Promise.allSettled([s.bind(ref,doc,0),s.bind(ref,doc,0)]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    await s.bind({kind:'thread',sourceId:'local',threadId:'a'},doc,0);expect(s.list()).toHaveLength(2);
    const copy=s.get(ref);copy.binding=null;expect(s.get(ref).binding).not.toBeNull();
  });
  it('refuses a second writer and recovers only a demonstrably dead owner',async()=>{
    const s=await openStore();await expect(openStore()).rejects.toMatchObject({code:'already_running'});await s.close();
    await mkdir(path.join(root,'state','.writer-lock'));await writeFile(path.join(root,'state','.writer-lock','owner.json'),JSON.stringify({pid:1000000000,token:'dead'}));
    const next=await openStore();expect(next.list()).toEqual([]);
  });
  it('preserves corrupt state instead of resetting it',async()=>{
    await mkdir(path.join(root,'state'));await writeFile(path.join(root,'state','state.json'),'{broken');
    await expect(openStore()).rejects.toMatchObject({code:'corrupt_state'});
    expect(await readFile(path.join(root,'state','state.json'),'utf8')).toBe('{broken');
  });
  it('keeps the old binding if the atomic write fails',async()=>{
    const s=await openStore(),g=await s.authorize(path.join(root,'task.md'),'file');
    await s.bind(ref,{grantId:g.id,path:g.realPath,scope:DOCUMENT_SCOPE},0);
    await chmod(path.join(root,'state'),0o500);
    try { await expect(s.clear(ref,1)).rejects.toThrow('保存失败');expect(s.get(ref).bindingVersion).toBe(1); }
    finally {await chmod(path.join(root,'state'),0o700);}
  });
});
