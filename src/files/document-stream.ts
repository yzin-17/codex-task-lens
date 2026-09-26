import { watch, type FSWatcher } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { DOCUMENT_SCOPE, LensError, type DocumentSnapshot, type Grant, type ParsedTasks, type SourceStatus, type TaskScope } from '../contracts/index.js';
import { parseTasks, taskFingerprint } from '../core/task-parser.js';
import { authorizedPath, documentVersion, fileError, readAuthorized } from './path-policy.js';
type Options = { debounceMs?:number; stabilityMs?:number; emptyGraceMs?:number; pollMs?:number; disableWatch?:boolean };
type ScopeCache = { revision:string; tasks:ParsedTasks; fingerprint:string; changedAt:number|null };
/** One watcher per real file. Access grants are checked again on every read. */
export class DocumentStream {
  private accesses=new Map<string,{grant:Grant;count:number}>();
  private listeners=new Set<()=>void>();
  private watcher:FSWatcher|undefined;
  private parentVersion='';
  private timer:NodeJS.Timeout|undefined;
  private poller:NodeJS.Timeout|undefined;
  private inFlight:Promise<void>|undefined;
  private pending=false;
  private closed=false;
  private abort=new AbortController();
  private source:string|null=null;
  private version='';
  private revision='';
  private status:SourceStatus='loading';
  private lastReadAt:number|null=null;
  private diagnostics:string[]=[];
  private cache=new Map<string,ScopeCache>();
  private total=0;
  constructor(readonly documentPath:string,private readonly options:Options={}) {}
  addAccess(grant:Grant):()=>void {
    const previous=this.accesses.get(grant.id);
    this.accesses.set(grant.id,{grant,count:(previous?.count??0)+1});
    return ()=>{const entry=this.accesses.get(grant.id);if(entry&&--entry.count===0)this.accesses.delete(grant.id);};
  }
  subscribe(listener:()=>void):()=>void {
    if(this.closed)throw new LensError('error','文档流已关闭');
    this.listeners.add(listener);
    if(!this.poller){this.poller=setInterval(()=>{void this.poll();},this.options.pollMs??5000);this.poller.unref();void this.refreshNow();}
    queueMicrotask(()=>{if(this.listeners.has(listener))listener();});
    return ()=>{this.listeners.delete(listener);if(!this.listeners.size)void this.close();};
  }
  private emit():void {for(const listener of this.listeners){try{listener();}catch{/* A consumer cannot interrupt other subscribers. */}}}
  private schedule(wait=this.options.debounceMs??60):void {
    if(this.closed)return;
    clearTimeout(this.timer);this.timer=setTimeout(()=>{this.timer=undefined;void this.refreshNow();},wait);this.timer.unref();
  }
  private async access():Promise<Grant> {
    let failure:unknown=new LensError('permission_denied','没有有效文件授权');
    for(const {grant} of this.accesses.values())try{await authorizedPath(grant,this.documentPath);return grant;}catch(error){failure=error;}
    throw failure;
  }
  private async ensureWatcher():Promise<void> {
    if(this.options.disableWatch||this.closed)return;
    try {
      const parent=path.dirname(this.documentPath),meta=await stat(parent),signature=`${meta.dev}:${meta.ino}`;
      if(this.watcher&&signature===this.parentVersion)return;
      this.watcher?.close();this.parentVersion=signature;
      const watcher=watch(parent,{persistent:false},(_event,name)=>{if(name===null||String(name)===path.basename(this.documentPath))this.schedule();});
      this.watcher=watcher;
      watcher.on('error',()=>{watcher.close();if(this.watcher===watcher)this.watcher=undefined;});
    } catch {/* Lightweight version polling remains available when fs.watch fails. */}
  }
  private async poll():Promise<void> {
    if(this.closed||this.inFlight)return;
    try {
      const grant=await this.access();await this.ensureWatcher();
      if(await documentVersion(grant,this.documentPath)!==this.version||this.status!=='ready')this.schedule(0);
    } catch {this.schedule(0);}
  }
  async refreshNow():Promise<void> {
    if(this.closed)return;
    if(this.inFlight){this.pending=true;return this.inFlight;}
    this.inFlight=this.readStable().catch(error=>{
      if(this.closed)return;
      const failure=fileError(error);
      const known:SourceStatus[]=['missing','permission_denied','unsupported','scope_missing','unstable','error'];
      this.status=known.includes(failure.code as SourceStatus)?failure.code as SourceStatus:'error';
      this.diagnostics=[failure.message];this.emit();
    }).finally(()=>{this.inFlight=undefined;if(this.pending&&!this.closed){this.pending=false;this.schedule();}});
    return this.inFlight;
  }
  private async readStable():Promise<void> {
    for(let attempt=0;attempt<3;attempt++){
      const grant=await this.access();await this.ensureWatcher();
      const read=await readAuthorized(grant,this.documentPath);
      await delay(this.options.stabilityMs??120,undefined,{signal:this.abort.signal});
      if(read.version!==await documentVersion(grant,this.documentPath))continue;
      const parsed=parseTasks(read.source);
      if(this.total>0&&parsed.total===0){
        await delay(this.options.emptyGraceMs??300,undefined,{signal:this.abort.signal});
        if(read.version!==await documentVersion(grant,this.documentPath))continue;
      }
      if(this.closed)return;
      this.source=read.source;this.version=read.version;this.total=parsed.total;
      this.revision=createHash('sha256').update(read.source).digest('hex');
      this.status='ready';this.diagnostics=[];this.lastReadAt=Date.now();this.emit();return;
    }
    throw new LensError('unstable','文档持续写入中，暂保留上次结果');
  }
  snapshot(scope:TaskScope=DOCUMENT_SCOPE):DocumentSnapshot {
    const key=JSON.stringify(scope),previous=this.cache.get(key);
    let current=previous,status=this.status,diagnostics=[...this.diagnostics];
    if(this.source!==null&&previous?.revision!==this.revision){
      try {
        const tasks=parseTasks(this.source,scope),fingerprint=taskFingerprint(tasks);
        current={revision:this.revision,tasks,fingerprint,changedAt:previous?(previous.fingerprint===fingerprint?previous.changedAt:this.lastReadAt):null};
        if(this.cache.size>=128&&!this.cache.has(key))this.cache.delete(this.cache.keys().next().value!);
        this.cache.set(key,current);
      }catch(error){const failure=fileError(error);status=failure.code==='scope_missing'?'scope_missing':'unsupported';diagnostics.push(failure.message);}
    }
    if(current)diagnostics=[...diagnostics,...current.tasks.diagnostics];
    return structuredClone({revision:current?.revision??this.revision,status,cached:status!=='ready'&&!!current,tasks:current?.tasks??null,lastReadAt:this.lastReadAt,lastTaskChangeAt:current?.changedAt??null,diagnostics});
  }
  resources():{watchers:number;timers:number;listeners:number} {return {watchers:this.watcher?1:0,timers:Number(!!this.timer)+Number(!!this.poller),listeners:this.listeners.size};}
  async close():Promise<void>{
    if(this.closed)return;this.closed=true;this.abort.abort();
    clearTimeout(this.timer);clearInterval(this.poller);this.timer=undefined;this.poller=undefined;
    this.watcher?.close();this.watcher=undefined;this.listeners.clear();this.accesses.clear();await this.inFlight;
  }
}
