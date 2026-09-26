import { beforeEach,afterEach,describe,expect,it } from 'vitest';
import { mkdtemp,writeFile,rename,unlink,rm,chmod } from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import { createGrant } from '../../src/files/path-policy.js';
import { DocumentStream } from '../../src/files/document-stream.js';
import { parseTasks } from '../../src/core/task-parser.js';
let root:string,file:string;const streams:DocumentStream[]=[];
beforeEach(async()=>{root=await mkdtemp(path.join(os.tmpdir(),'lens-stream-'));file=path.join(root,'tasks.md');await writeFile(file,'- [ ] A\n');});
afterEach(async()=>{for(const s of streams.splice(0))await s.close();await rm(root,{recursive:true,force:true});});
async function stream(options:ConstructorParameters<typeof DocumentStream>[1]={}){const s=new DocumentStream(file,{stabilityMs:30,emptyGraceMs:100,debounceMs:15,pollMs:100,...options});s.addAccess(await createGrant(file,'file'));streams.push(s);s.subscribe(()=>{s.snapshot();});await expect.poll(()=>s.snapshot().status).toBe('ready');return s;}
describe('real document stream',()=>{
  it('moves checkboxes and distinguishes semantic change from a formatting save',async()=>{
    const s=await stream();expect(s.snapshot().lastTaskChangeAt).toBeNull();
    const first=s.snapshot().revision;await writeFile(file,'\n- [ ] A\n');await expect.poll(()=>s.snapshot().revision).not.toBe(first);
    expect(s.snapshot().lastTaskChangeAt).toBeNull();await writeFile(file,'- [x] A\n');await expect.poll(()=>s.snapshot().tasks?.completed).toBe(1);expect(s.snapshot().lastTaskChangeAt).not.toBeNull();
  });
  it('handles atomic rename, deletion and recreation without claiming cached data is fresh',async()=>{
    const s=await stream();await writeFile(file+'.tmp','- [x] A\n');await rename(file+'.tmp',file);await expect.poll(()=>s.snapshot().tasks?.completed).toBe(1);
    await unlink(file);await expect.poll(()=>s.snapshot().status).toBe('missing');expect(s.snapshot()).toMatchObject({cached:true,tasks:{total:1}});
    await writeFile(file,'- [ ] new\n');await expect.poll(()=>s.snapshot().status).toBe('ready');expect(s.snapshot().tasks?.completed).toBe(0);
  });
  it('recovers a lost filesystem event through bounded version polling',async()=>{const s=await stream({disableWatch:true});await writeFile(file,'- [x] A');await expect.poll(()=>s.snapshot().tasks?.completed).toBe(1);});
  it('does not emit a transient empty plan during truncate-and-write',async()=>{
    const s=await stream(),counts:number[]=[];s.subscribe(()=>{if(s.snapshot().status==='ready')counts.push(s.snapshot().tasks!.total);});
    await writeFile(file,'');await new Promise(r=>setTimeout(r,40));await writeFile(file,'- [ ] A\n- [x] B\n');
    await expect.poll(()=>s.snapshot().tasks?.total).toBe(2);expect(counts).not.toContain(0);
  });
  it('preserves scoped data when the selected heading disappears',async()=>{
    const source='# A\n- [ ] first\n# B\n- [x] second\n';await writeFile(file,source);const s=await stream();const scope=parseTasks(source).sections[1]!.scope;
    expect(s.snapshot(scope).tasks?.total).toBe(1);await writeFile(file,'# A\n- [ ] first\n');await expect.poll(()=>s.snapshot(scope).status).toBe('scope_missing');expect(s.snapshot(scope).cached).toBe(true);
  });
  it('labels size and permission failures instead of zeroing the count',async()=>{
    const s=await stream();await chmod(file,0o000);await s.refreshNow();expect(s.snapshot()).toMatchObject({status:'permission_denied',cached:true});
    await chmod(file,0o600);await writeFile(file,'x'.repeat(2*1024*1024+1));await s.refreshNow();expect(s.snapshot()).toMatchObject({status:'unsupported',cached:true});
  });
  it('releases its own watchers, timers and listeners on close',async()=>{const s=await stream();await s.close();expect(s.resources()).toEqual({watchers:0,timers:0,listeners:0});});
});
