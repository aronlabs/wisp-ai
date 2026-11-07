import {spawn} from 'node:child_process';
export interface SecretVault {read(key:string):Promise<string>;write(key:string,value:string):Promise<void>}
export class WindowsVault implements SecretVault {
 executable:string;
 constructor(executable:string){this.executable=executable}
 private run(operation:string,key:string,input=''):Promise<string>{return new Promise((resolve,reject)=>{
  const child=spawn(this.executable,['--secret',operation,key],{windowsHide:true,stdio:['pipe','pipe','pipe']});let output='';
  const timer=setTimeout(()=>{child.kill();reject(Error('Windows secret storage timed out'))},10000);
  child.stdout.on('data',data=>{output+=data;if(output.length>1024*1024){child.kill();reject(Error('Secret is too large'))}});child.stderr.resume();
  child.on('error',error=>{clearTimeout(timer);reject(error)});child.on('exit',code=>{clearTimeout(timer);code===0?resolve(output):reject(Error('Windows secret storage failed'))});child.stdin.end(input);
 })}
 read(key:string){return this.run('read',key)}
 async write(key:string,value:string){await this.run('write',key,value)}
}
