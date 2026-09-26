import { selectMarkdownFiles } from '../../platform/macos/select-markdown.js';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes,timingSafeEqual } from 'node:crypto';
import { readFile,realpath,stat } from 'node:fs/promises';
import path from 'node:path';
import { LensError,MAX_REQUEST_BYTES,parseRequest,type Request } from '../../contracts/index.js';
import { RequestLedger } from '../../contracts/request-ledger.js';
import { LensService } from '../lens-service.js';
import { within } from '../../files/path-policy.js';
import { openSourceFile } from '../../platform/macos/open-source.js';
class HttpFailure extends Error{constructor(readonly status:number,message:string){super(message);}}
function headers(res:ServerResponse):void{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
}
function json(res:ServerResponse,status:number,body:unknown):void{if(res.destroyed)return;headers(res);res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');if(status>=400)res.setHeader('Connection','close');res.end(JSON.stringify(body));}
function body(req:IncomingMessage):Promise<unknown>{
  return new Promise((resolve,reject)=>{
    const chunks:Buffer[]=[];let size=0,settled=false;
    const cleanup=()=>{clearTimeout(timer);req.off('data',data);req.off('end',end);req.off('aborted',aborted);req.off('error',aborted);};
    const fail=(error:Error)=>{if(settled)return;settled=true;cleanup();req.resume();reject(error);};
    const data=(chunk:Buffer)=>{size+=chunk.length;if(size>MAX_REQUEST_BYTES){fail(new HttpFailure(413,'请求超过 32 KiB 限制'));return;}chunks.push(chunk);};
    const end=()=>{if(settled)return;settled=true;cleanup();try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{reject(new HttpFailure(400,'请求不是有效 JSON'));}};
    const aborted=()=>fail(new HttpFailure(400,'请求已中断'));
    const timer=setTimeout(()=>fail(new HttpFailure(408,'请求读取超时')),5000);timer.unref();
    req.on('data',data);req.once('end',end);req.once('aborted',aborted);req.once('error',aborted);
  });
}
export async function startLocalServer(service:LensService,options:{port?:number;uiDirectory?:string;openFile?:(file:string)=>Promise<boolean>}={}){
  const token=randomBytes(32).toString('hex'),ledger=new RequestLedger(128),streams=new Set<()=>void>();
  let origin='',active=0;const controllers=new Set<AbortController>();
  const authenticate=(req:IncomingMessage)=>{
    if(req.headers.origin!==origin)throw new HttpFailure(403,'来源不受信任');
    const supplied=req.headers.authorization??'',expected=`Bearer ${token}`;
    if(supplied.length!==expected.length||!timingSafeEqual(Buffer.from(supplied),Buffer.from(expected)))throw new HttpFailure(401,'需要本次运行的访问凭证');
  };
  async function dispatch(request:Request,signal:AbortSignal):Promise<unknown>{
    const {monitor,generation,params}=request;
    switch(request.operation){
      case 'authorize':return service.authorize(request.params.path,request.params.kind);
      case 'listMonitors':return service.listMonitors();
      case 'listCandidates':return service.candidates(monitor,request.params.grantId,request.params.patterns,signal);
      case 'previewDocument':return service.preview(monitor,generation,request.params.grantId,request.params.path,request.params.scope);
      case 'pickMarkdownFiles':return selectMarkdownFiles();
      case 'confirmBindings':return service.confirmMany(monitor,generation,request.params.previewIds,request.params.keepBindingIds,request.params.expectedBindingVersion);
      case 'confirmBinding':return service.confirm(monitor,generation,request.params.previewId,request.params.expectedBindingVersion);
      case 'clearBinding':return service.clear(monitor,generation,request.params.expectedBindingVersion);
      case 'getSnapshot':return service.snapshot(monitor,generation);
      case 'openSource':return service.openSource(monitor,request.params.expectedBindingVersion,request.params.line,options.openFile??openSourceFile,request.params.bindingId);
      case 'subscribe':void params;throw new HttpFailure(400,'订阅必须使用事件入口');
    }
  }
  const server=createServer((req,res)=>{
    req.on('error',()=>{/* No request body or credentials are logged. */});
    void handle(req,res).catch(error=>{
      if(res.headersSent){res.end();return;}
      const safe=error instanceof LensError||error instanceof HttpFailure?error:new LensError('error','本地服务操作失败');
      const status=error instanceof HttpFailure?error.status:error instanceof LensError&&error.code==='conflict'?409:error instanceof LensError&&error.code==='permission_denied'?403:400;
      json(res,status,{ok:false,error:{code:safe instanceof LensError?safe.code:'invalid_request',message:safe.message}});
    });
  });
  async function handle(req:IncomingMessage,res:ServerResponse):Promise<void>{
    if(req.headers.host!==new URL(origin).host)throw new HttpFailure(403,'Host 不受信任');
    const raw=(req.url??'/').split('?')[0]!;
    if(raw.startsWith('/api/')){
      authenticate(req);if(req.method!=='POST')throw new HttpFailure(405,'不支持的方法');
      if(!req.headers['content-type']?.startsWith('application/json'))throw new HttpFailure(415,'需要 application/json');
      if(active>=16)throw new HttpFailure(429,'请求过多');active++;
      const controller=new AbortController();controllers.add(controller);
      const abort=()=>controller.abort();res.once('close',abort);
      try{
        const request=parseRequest(await body(req));
        const envelope={protocolVersion:1,requestId:request.requestId,monitor:request.monitor,generation:request.generation};
        if(raw==='/api/events'){
          if(request.operation!=='subscribe')throw new HttpFailure(400,'事件入口仅接受订阅');
          if(streams.size>=32)throw new HttpFailure(429,'订阅过多');
          headers(res);res.statusCode=200;res.setHeader('Content-Type','text/event-stream; charset=utf-8');res.setHeader('Connection','keep-alive');res.flushHeaders();
          let blocked=false,pending:string|undefined,ended=false;
          const write=(chunk:string)=>{if(ended)return;if(blocked){pending=chunk;return;}blocked=!res.write(chunk);};
          res.on('drain',()=>{blocked=false;if(pending){const chunk=pending;pending=undefined;write(chunk);}});
          const stop=service.subscribe(request.monitor,request.generation,view=>write(`data: ${JSON.stringify({...envelope,ok:true,result:view})}\n\n`));
          const heartbeat=setInterval(()=>{if(!blocked&&!ended)res.write(': ping\n\n');},15000);heartbeat.unref();
          const cleanup=()=>{if(ended)return;ended=true;stop();clearInterval(heartbeat);streams.delete(cleanup);res.end();};
          streams.add(cleanup);res.once('close',cleanup);res.once('error',cleanup);return;
        }
        if(raw!=='/api/rpc')throw new HttpFailure(404,'接口不存在');
        const result=await ledger.execute(request.requestId,JSON.stringify(request),()=>dispatch(request,controller.signal));
        if(!controller.signal.aborted)json(res,200,{...envelope,ok:true,result});
      }finally{active--;controllers.delete(controller);res.off('close',abort);}
      return;
    }
    if(req.method!=='GET'&&req.method!=='HEAD')throw new HttpFailure(405,'不支持的方法');
    if(!options.uiDirectory)throw new HttpFailure(404,'请先构建面板');
    let decoded:string;try{decoded=decodeURIComponent(raw);}catch{throw new HttpFailure(400,'路径编码无效');}
    if(!decoded.startsWith('/')||decoded.includes('\\')||decoded.includes('\0')||decoded.split('/').includes('..'))throw new HttpFailure(403,'静态路径不受信任');
    const root=await realpath(options.uiDirectory),candidate=path.resolve(root,'.'+(decoded==='/'?'/index.html':decoded));
    let file:string;try{file=await realpath(candidate);}catch{throw new HttpFailure(404,'文件不存在');}
    if(!within(root,file))throw new HttpFailure(403,'路径超出面板目录');
    const mime:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
    if(!mime[path.extname(file)]||(await stat(file)).size>8*1024*1024)throw new HttpFailure(404,'文件不可提供');
    headers(res);res.setHeader('Content-Type',mime[path.extname(file)]!);res.statusCode=200;
    res.end(req.method==='HEAD'?undefined:await readFile(file));
  }
  server.requestTimeout=10000;server.headersTimeout=10000;
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(options.port??0,'127.0.0.1',()=>{const address=server.address();if(!address||typeof address==='string'){reject(new Error('No local address'));return;}origin=`http://127.0.0.1:${address.port}`;resolve();});});
  let stopping:Promise<void>|undefined;
  return {origin,token,url:`${origin}/#token=${token}`,resources:()=>({streams:streams.size,active}),close:()=>{
    if(stopping)return stopping;
    for(const controller of controllers)controller.abort();for(const close of streams)close();ledger.clear();
    stopping=new Promise<void>((resolve,reject)=>{server.close(error=>error?reject(error):resolve());server.closeAllConnections();});return stopping;
  }};
}
