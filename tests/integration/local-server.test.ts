import { beforeEach,afterEach,describe,expect,it } from 'vitest';
import { mkdtemp,writeFile,rm,readFile } from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import { randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { BindingStore } from '../../src/store/binding-store.js';import { LensService } from '../../src/host/lens-service.js';import { startLocalServer } from '../../src/host/local-server/server.js';import { DOCUMENT_SCOPE } from '../../src/contracts/index.js';
let root:string,store:BindingStore,service:LensService,server:Awaited<ReturnType<typeof startLocalServer>>;const opened:string[]=[];
const monitor={kind:'standalone',id:'local'} as const;
const request=(operation:string,params:unknown={})=>({protocolVersion:1,requestId:randomUUID(),monitor,generation:0,operation,params});
function rpc(value:unknown,headers:Record<string,string>={}){return fetch(server.origin+'/api/rpc',{method:'POST',headers:{'content-type':'application/json',origin:server.origin,authorization:`Bearer ${server.token}`,...headers},body:JSON.stringify(value)});}
beforeEach(async()=>{root=await mkdtemp(path.join(os.tmpdir(),'lens-http-'));await writeFile(path.join(root,'task;literal.md'),'- [ ] A');store=await BindingStore.open(path.join(root,'state'));service=new LensService(store,{streamOptions:{stabilityMs:20,pollMs:100}});server=await startLocalServer(service,{openFile:async file=>{opened.push(file);return true;}});});
afterEach(async()=>{await server.close();await service.close();await store.close();await rm(root,{recursive:true,force:true});opened.length=0;});
async function bound(){const g=await service.authorize(path.join(root,'task;literal.md'),'file'),p=await service.preview(monitor,0,g.id,g.realPath,DOCUMENT_SCOPE);await service.confirm(monitor,0,p.id,0);return g;}
describe('protected loopback transport',()=>{
  it('requires the runtime token and exact Origin/Host',async()=>{
    expect((await rpc(request('getSnapshot'),{authorization:''})).status).toBe(401);
    expect((await rpc(request('getSnapshot'),{origin:'https://evil.invalid'})).status).toBe(403);
    // Fetch normalizes Host; send the actual forged header with the HTTP client.
    const forgedStatus=await new Promise<number|undefined>((resolve,reject)=>{
      const req=httpRequest(server.origin+'/api/rpc',{method:'POST',headers:{host:'evil.invalid','content-type':'application/json',origin:server.origin,authorization:`Bearer ${server.token}`}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});
      req.on('error',reject);req.end(JSON.stringify(request('getSnapshot')));
    });expect(forgedStatus).toBe(403);
    const response=await rpc(request('getSnapshot'));expect(response.status).toBe(200);expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });
  it('rejects unknown fields, commands, oversized requests and absent consent',async()=>{
    expect((await rpc(request('exec',{command:'anything'}))).status).toBe(400);
    expect((await rpc({...request('getSnapshot'),extra:true})).status).toBe(400);
    expect((await rpc(request('authorize',{path:root,kind:'directory',consent:false}))).status).toBe(400);
    expect((await rpc({...request('getSnapshot'),padding:'x'.repeat(33000)})).status).toBe(413);
  });
  it('only opens the authorized current binding using its source line',async()=>{
    const grant=await bound();expect((await rpc(request('openSource',{expectedBindingVersion:0,line:1}))).status).toBe(409);
    expect((await rpc(request('openSource',{expectedBindingVersion:1,line:1,path:'/etc/passwd'}))).status).toBe(400);
    const response=await rpc(request('openSource',{expectedBindingVersion:1,line:1}));expect(response.status).toBe(200);expect(opened).toEqual([grant.realPath]);expect(await readFile(grant.realPath,'utf8')).toBe('- [ ] A');
  });
  it('deduplicates an identical mutation and rejects a conflicting replay',async()=>{
    const value=request('authorize',{path:path.join(root,'task;literal.md'),kind:'file',consent:true});const first=await(await rpc(value)).json(),second=await(await rpc(value)).json();expect(first.result.id).toBe(second.result.id);
    expect((await rpc({...value,operation:'getSnapshot',params:{}})).status).toBe(409);
  });
  it('streams real binding and file changes and cleans up disconnected subscriptions',async()=>{
    const controller=new AbortController();const response=await fetch(server.origin+'/api/events',{method:'POST',headers:{'content-type':'application/json',origin:server.origin,authorization:`Bearer ${server.token}`},body:JSON.stringify(request('subscribe')),signal:controller.signal});expect(response.status).toBe(200);
    const reader=response.body!.getReader(),decoder=new TextDecoder();let data='';
    const nextUntil=async(fragment:string)=>{const timeout=setTimeout(()=>controller.abort(),4000);try{while(!data.includes(fragment)){const chunk=await reader.read();if(chunk.done)throw new Error('stream closed');data+=decoder.decode(chunk.value);}}finally{clearTimeout(timeout);}};
    await nextUntil('"binding":null');const grant=await bound();data='';await nextUntil('"status":"ready"');data='';await writeFile(grant.realPath,'- [x] A');await nextUntil('"completed":1');
    await reader.cancel();await expect.poll(()=>server.resources().streams).toBe(0);expect(service.resources().subscribers).toBe(0);
  });
  it('closes its port when stopped',async()=>{const origin=server.origin;await server.close();await expect(fetch(origin)).rejects.toThrow();});
});
