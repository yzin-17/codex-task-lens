import { opendir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { LensError, type Candidate, type CandidateResult, type Grant, type SessionHints } from '../contracts/index.js';
import { parseTasks } from '../core/task-parser.js';
import { authorizedPath, fileError, readAuthorized } from '../files/path-policy.js';
const DEFAULT_PATTERNS=['docs/tasks/**/*.md','tasks/**/*.md','TASKS.md'];
const IGNORED=new Set(['.git','node_modules','vendor','dist','build','coverage','archive','archives','.archive','.next','.cache','.venv']);
export async function discoverCandidates(options:{grant:Grant;patterns?:string[];hints?:SessionHints;signal?:AbortSignal;maxPaths?:number}):Promise<CandidateResult>{
  const {grant,hints,signal}=options,patterns=options.patterns??DEFAULT_PATTERNS,max=options.maxPaths??2000;
  if(patterns.length>16||patterns.some(pattern=>!pattern||pattern.length>256||path.isAbsolute(pattern)||pattern.split(/[\\/]/).includes('..')||pattern.includes('\0')))throw new LensError('invalid_request','扫描规则必须是授权目录内的相对 glob');
  const found=new Map<string,Candidate>(),diagnostics=new Set<string>();let checked=0,visited=0,incomplete=false;
  const check=()=>signal?.throwIfAborted();
  async function add(input:string,source:string):Promise<void>{
    check();if(checked>=max){incomplete=true;return;}checked++;
    try{
      const resolved=await authorizedPath(grant,input),existing=found.get(resolved);
      if(existing){if(!existing.sources.includes(source))existing.sources.push(source);return;}
      const read=await readAuthorized(grant,resolved),parsed=parseTasks(read.source);
      if(!parsed.total){diagnostics.add('部分 Markdown 不含有效清单，未列为候选');return;}
      found.set(resolved,{id:createHash('sha256').update(resolved).digest('hex'),path:resolved,workspace:grant.kind==='directory'?grant.realPath:null,sources:[source],total:parsed.total,completed:parsed.completed,title:parsed.title,diagnostics:parsed.diagnostics});
    }catch(error){check();const e=fileError(error);diagnostics.add(`部分候选不可读取：${e.message}`);}
  }
  if(hints?.status==='ready')for(const hint of hints.paths){
    check();if(incomplete)break;
    if(hint.path.includes('$')||hint.path.includes('`')||hint.path.startsWith('~')){diagnostics.add('含变量的路径线索未被展开');continue;}
    if(!path.isAbsolute(hint.path)&&!hint.baseDirectory){diagnostics.add('相对路径缺少明确基准目录，未猜测');continue;}
    await add(path.isAbsolute(hint.path)?hint.path:path.resolve(hint.baseDirectory!,hint.path),`会话线索：${hint.source}`);
  }
  else if(hints)diagnostics.add('会话记录不可用；目录扫描和手动选择仍可使用');
  async function walk(directory:string,depth=0):Promise<void>{
    check();if(incomplete)return;if(depth>64){incomplete=true;return;}
    try{
      const entries=await opendir(directory);
      for await(const entry of entries){
        check();if(incomplete)return;if(++visited>20000){incomplete=true;return;}
        if(IGNORED.has(entry.name))continue;
        const candidate=path.join(directory,entry.name);
        if(entry.isDirectory()){await walk(candidate,depth+1);continue;}
        if(!/\.md$/i.test(entry.name)||(!entry.isFile()&&!entry.isSymbolicLink()))continue;
        const relative=path.relative(grant.realPath,candidate).split(path.sep).join('/');
        if(patterns.some(pattern=>path.matchesGlob(relative,pattern)))await add(candidate,'目录扫描');
        else{if(checked>=max){incomplete=true;return;}checked++;}
      }
    }catch(error){check();diagnostics.add(`部分目录未扫描：${fileError(error).message}`);}
  }
  check();
  if(grant.kind==='file')await add(grant.realPath,'手动授权文件');
  else{await authorizedPath(grant,grant.realPath,true);await walk(grant.realPath);}
  if(incomplete)diagnostics.add('扫描达到数量或深度上限，结果不完整；请缩小范围');
  return {candidates:[...found.values()].sort((a,b)=>Number(b.sources.some(s=>s.startsWith('会话')))-Number(a.sources.some(s=>s.startsWith('会话')))||a.path.localeCompare(b.path)),checked,incomplete,diagnostics:[...diagnostics]};
}
