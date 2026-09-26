import { beforeEach,afterEach,describe,expect,it } from 'vitest';
import { mkdtemp,writeFile,readFile,rm,mkdir,symlink,unlink } from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import { BindingStore } from '../../src/store/binding-store.js';import { LensService } from '../../src/host/lens-service.js';
import { DOCUMENT_SCOPE,type MonitorRef } from '../../src/contracts/index.js';
let root:string,store:BindingStore,service:LensService;const a:MonitorRef={kind:'standalone',id:'a'},b:MonitorRef={kind:'thread',sourceId:'local',threadId:'b'};
beforeEach(async()=>{root=await mkdtemp(path.join(os.tmpdir(),'lens-service-'));await writeFile(path.join(root,'a.md'),'- [ ] A');await writeFile(path.join(root,'b.md'),'- [x] B');store=await BindingStore.open(path.join(root,'state'));service=new LensService(store,{streamOptions:{stabilityMs:20,debounceMs:10,pollMs:100}});});
afterEach(async()=>{await service.close();await store.close();await rm(root,{recursive:true,force:true});});
async function bind(ref:MonitorRef,file='a.md',version=0){const g=await service.authorize(path.join(root,file),'file'),p=await service.preview(ref,0,g.id,g.realPath,DOCUMENT_SCOPE);await service.confirm(ref,0,p.id,version);await expect.poll(async()=>(await service.snapshot(ref)).snapshot?.status).toBe('ready');return g;}
describe('independent application service',()=>{
  it('shares one physical stream across monitors and releases it after the last unbind',async()=>{
    await bind(a);await bind(b);expect(service.resources().documents).toBe(1);expect(service.resources().watchers).toBe(1);
    await writeFile(path.join(root,'a.md'),'- [x] A');await expect.poll(async()=>(await service.snapshot(a)).snapshot?.tasks?.completed).toBe(1);expect((await service.snapshot(b)).snapshot?.tasks?.completed).toBe(1);
    await service.clear(a,0,1);expect(service.resources().documents).toBe(1);await service.clear(b,0,1);expect(service.resources().documents).toBe(0);
  });
  it('does not mutate bindings during preview and rejects cross-monitor or old-generation confirmation',async()=>{
    const g=await service.authorize(path.join(root,'a.md'),'file'),p=await service.preview(a,2,g.id,g.realPath,DOCUMENT_SCOPE);
    expect(store.get(a).binding).toBeNull();await expect(service.confirm(b,2,p.id,0)).rejects.toMatchObject({code:'conflict'});await expect(service.confirm(a,3,p.id,0)).rejects.toThrow('当前监控');
    expect(store.get(a).binding).toBeNull();
  });
  it('keeps current binding after stale preview or failed version check',async()=>{
    const g=await bind(a),p=await service.preview(a,0,g.id,g.realPath,DOCUMENT_SCOPE);await writeFile(g.realPath,'- [x] changed');await expect(service.confirm(a,0,p.id,1)).rejects.toThrow('重新预览');
    await expect(service.clear(a,0,0)).rejects.toMatchObject({code:'conflict'});expect(store.get(a).bindingVersion).toBe(1);
  });
  it('never returns a previous file under a newer binding version',async()=>{
    await bind(a);const pending=service.snapshot(a,7);await bind(a,'b.md',1);await pending;
    const current=await service.snapshot(a,8);expect(current.bindingVersion).toBe(2);expect(current.snapshot?.tasks?.items[0]?.title).toBe('B');expect(current.generation).toBe(8);
  });
  it('rechecks each monitor grant even when another grant keeps the shared source readable',async()=>{
    await symlink(path.join(root,'a.md'),path.join(root,'alias.md'));await bind(a,'alias.md');await bind(b,'a.md');
    await unlink(path.join(root,'alias.md'));await symlink(path.join(root,'b.md'),path.join(root,'alias.md'));
    expect((await service.snapshot(a)).snapshot).toMatchObject({status:'permission_denied',cached:true});expect((await service.snapshot(b)).snapshot?.status).toBe('ready');
  });
  it('retains directory discovery if optional session hints fail',async()=>{
    await service.close();service=new LensService(store,{hints:async()=>{throw new Error('not supported');}});await mkdir(path.join(root,'tasks'));await writeFile(path.join(root,'tasks/t.md'),'- [ ] task');const g=await service.authorize(root,'directory');expect((await service.candidates(a,g.id)).candidates).toHaveLength(1);
  });
  it('restores bindings after a real store restart without touching the source',async()=>{
    await bind(a);await service.close();await store.close();store=await BindingStore.open(path.join(root,'state'));service=new LensService(store,{streamOptions:{stabilityMs:20}});
    await expect.poll(async()=>(await service.snapshot(a)).snapshot?.status).toBe('ready');expect(await readFile(path.join(root,'a.md'),'utf8')).toBe('- [ ] A');
    await service.close();expect(service.resources()).toEqual({documents:0,monitors:0,subscribers:0,watchers:0});
  });
});
