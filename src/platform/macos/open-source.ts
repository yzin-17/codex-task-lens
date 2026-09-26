import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute=promisify(execFile);
/** Caller must resolve an existing authorized source reference first. Never uses a shell. */
export async function openSourceFile(file:string):Promise<boolean>{
  if(process.platform!=='darwin')return false;
  await execute('/usr/bin/open',['-t',file],{timeout:10000,maxBuffer:4096});return true;
}
