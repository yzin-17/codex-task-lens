import { chmod, lstat, mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { LensError, integer, monitorKey, object, parseMonitor, parseScope, text, type Binding, type Grant, type MonitorRef, type MonitorSummary, type TaskScope } from '../contracts/index.js';
import { authorizedPath, createGrant } from '../files/path-policy.js';
type State = { schemaVersion: 1; grants: Grant[]; monitors: MonitorSummary[] };
const clone = <T>(value: T): T => structuredClone(value);
const alive = (pid: number): boolean => { try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code !== 'ESRCH'; } };
function absolute(value: unknown): string { const p = text(value); if (!path.isAbsolute(p)) throw new Error('invalid path'); return p; }
function decodeState(raw: string): State {
  try {
    const v = object(JSON.parse(raw), ['schemaVersion','grants','monitors']);
    if (v.schemaVersion !== 1 || !Array.isArray(v.grants) || !Array.isArray(v.monitors)) throw new Error('schema');
    const grants: Grant[] = v.grants.map(value => {
      const g = object(value, ['id','kind','realPath','displayPath']);
      if (g.kind !== 'file' && g.kind !== 'directory') throw new Error('kind');
      return { id: text(g.id,128), kind:g.kind, realPath:absolute(g.realPath), displayPath:absolute(g.displayPath) };
    });
    const monitors: MonitorSummary[] = v.monitors.map(value => {
      const row = object(value,['monitor','bindingVersion','binding']);
      const monitor = parseMonitor(row.monitor), bindingVersion = integer(row.bindingVersion);
      let binding: Binding | null = null;
      if (row.binding !== null) {
        const b = object(row.binding,['id','monitor','grantId','documentRealPath','displayPath','workspaceRealPath','scope','version','confirmedAt']);
        binding = { id:text(b.id,128), monitor:parseMonitor(b.monitor), grantId:text(b.grantId,128), documentRealPath:absolute(b.documentRealPath), displayPath:absolute(b.displayPath), workspaceRealPath:b.workspaceRealPath === null ? null : absolute(b.workspaceRealPath), scope:parseScope(b.scope), version:integer(b.version,1), confirmedAt:integer(b.confirmedAt) };
        if (binding.version !== bindingVersion || monitorKey(binding.monitor) !== monitorKey(monitor) || !grants.some(g=>g.id===binding!.grantId)) throw new Error('binding');
      }
      return { monitor, bindingVersion, binding };
    });
    if (new Set(grants.map(g=>g.id)).size!==grants.length || new Set(monitors.map(m=>monitorKey(m.monitor))).size!==monitors.length) throw new Error('duplicate');
    return {schemaVersion:1,grants,monitors};
  } catch { throw new LensError('corrupt_state','绑定存储损坏或版本不支持；已保留原文件，请备份后恢复'); }
}
export class BindingStore {
  readonly directory: string;
  private state: State = {schemaVersion:1,grants:[],monitors:[]};
  private token = randomUUID();
  private closed = false;
  private tail: Promise<void> = Promise.resolve();
  private constructor(directory: string) { this.directory = path.resolve(directory); }
  static async open(directory: string): Promise<BindingStore> {
    const store = new BindingStore(directory);
    await mkdir(store.directory,{recursive:true,mode:0o700});
    const meta = await lstat(store.directory);
    if (meta.isSymbolicLink() || !meta.isDirectory()) throw new LensError('permission_denied','数据目录必须是独立的真实目录');
    await chmod(store.directory,0o700);
    await store.acquire();
    try {
      const file = path.join(store.directory,'state.json');
      try {
        const info = await lstat(file);
        if (!info.isFile() || info.isSymbolicLink() || info.size > 4*1024*1024) throw new LensError('corrupt_state','存储类型或大小无效；原文件已保留');
        store.state = decodeState(await readFile(file,'utf8'));
        await chmod(file,0o600);
      } catch(error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      return store;
    } catch(error) { await store.close(); throw error; }
  }
  private async owner(): Promise<{pid:number;token:string}> {
    try {
      const file = path.join(this.directory,'.writer-lock','owner.json');
      if ((await stat(file)).size>2048) throw new Error('large');
      const v = object(JSON.parse(await readFile(file,'utf8')),['pid','token']);
      return {pid:integer(v.pid,1),token:text(v.token,128)};
    } catch { throw new LensError('already_running','写入锁正在初始化或无法确认；不接管现有实例'); }
  }
  private async acquire(): Promise<void> {
    const lock = path.join(this.directory,'.writer-lock');
    for (let attempt=0;attempt<2;attempt++) {
      try { await mkdir(lock,{mode:0o700}); await writeFile(path.join(lock,'owner.json'),JSON.stringify({pid:process.pid,token:this.token}),{flag:'wx',mode:0o600}); return; }
      catch(error) { if ((error as NodeJS.ErrnoException).code!=='EEXIST') throw error; }
      const previous = await this.owner();
      if (alive(previous.pid)) throw new LensError('already_running','另一个 Task Lens 实例正在使用此数据目录');
      const reclaim = path.join(this.directory,'.reclaim-lock');
      try { await mkdir(reclaim,{mode:0o700}); } catch { throw new LensError('already_running','其他实例正在恢复写入锁'); }
      try {
        const current=await this.owner();
        if (current.token!==previous.token || alive(current.pid)) throw new LensError('already_running','写入锁所有者已变化');
        await rm(lock,{recursive:true});
      } finally { await rm(reclaim,{recursive:true,force:true}); }
    }
    throw new LensError('already_running','无法取得独占写入锁');
  }
  get(ref: MonitorRef): MonitorSummary { return clone(this.state.monitors.find(m=>monitorKey(m.monitor)===monitorKey(ref)) ?? {monitor:ref,bindingVersion:0,binding:null}); }
  list(): MonitorSummary[] { return clone(this.state.monitors); }
  grant(id: string): Grant { const grant=this.state.grants.find(g=>g.id===id); if(!grant) throw new LensError('permission_denied','授权不存在'); return clone(grant); }
  private transaction<T>(operation:()=>Promise<T>):Promise<T> {
    if(this.closed) return Promise.reject(new LensError('error','存储已关闭'));
    const result=this.tail.then(operation); this.tail=result.then(()=>undefined,()=>undefined); return result;
  }
  private async persist(next: State):Promise<void> {
    const temporary=path.join(this.directory,`.state-${this.token}-${randomUUID()}.tmp`);
    try {
      const handle=await open(temporary,'wx',0o600);
      try { await handle.writeFile(JSON.stringify(next,null,2)+'\n','utf8'); await handle.sync(); } finally { await handle.close(); }
      await rename(temporary,path.join(this.directory,'state.json'));
      this.state=next;
    } catch { throw new LensError('error','绑定保存失败；原绑定保持不变'); }
    finally { await rm(temporary,{force:true}).catch(()=>undefined); }
  }
  authorize(input:string,kind:Grant['kind']):Promise<Grant> {
    return this.transaction(async()=>{
      const grant=await createGrant(input,kind);
      const existing=this.state.grants.find(g=>g.kind===grant.kind&&g.realPath===grant.realPath&&g.displayPath===grant.displayPath);
      if(existing) return clone(existing);
      await this.persist({...this.state,grants:[...this.state.grants,grant]}); return clone(grant);
    });
  }
  bind(ref:MonitorRef,document:{grantId:string;path:string;scope:TaskScope},expected:number):Promise<MonitorSummary> {
    return this.transaction(async()=>{
      const previous=this.get(ref); if(previous.bindingVersion!==expected) throw new LensError('conflict','绑定已被另一窗口更新，请刷新后重试');
      const grant=this.grant(document.grantId), resolved=await authorizedPath(grant,document.path);
      const version=expected+1;
      const binding:Binding={id:randomUUID(),monitor:clone(ref),grantId:grant.id,documentRealPath:resolved,displayPath:resolved,workspaceRealPath:grant.kind==='directory'?grant.realPath:null,scope:parseScope(document.scope),version,confirmedAt:Date.now()};
      const row={monitor:clone(ref),bindingVersion:version,binding};
      await this.persist({...this.state,monitors:[...this.state.monitors.filter(m=>monitorKey(m.monitor)!==monitorKey(ref)),row]}); return clone(row);
    });
  }
  clear(ref:MonitorRef,expected:number):Promise<MonitorSummary> {
    return this.transaction(async()=>{
      if(this.get(ref).bindingVersion!==expected) throw new LensError('conflict','绑定版本已变化');
      const row={monitor:clone(ref),bindingVersion:expected+1,binding:null};
      await this.persist({...this.state,monitors:[...this.state.monitors.filter(m=>monitorKey(m.monitor)!==monitorKey(ref)),row]}); return clone(row);
    });
  }
  async close():Promise<void> {
    if(this.closed) return; this.closed=true; await this.tail;
    const owner=await this.owner();
    if(owner.token===this.token) await rm(path.join(this.directory,'.writer-lock'),{recursive:true,force:true});
  }
}
