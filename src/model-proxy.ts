import type {IncomingMessage,ServerResponse} from 'node:http';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import type {ChatGPTAuth} from './chatgpt-auth.ts';
export async function proxyModel(req:IncomingMessage,res:ServerResponse,auth:ChatGPTAuth){
 const abort=new AbortController();res.on('close',()=>{if(!res.writableEnded)abort.abort()});
 req.setEncoding('utf8');let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>8*1024*1024)throw Error('Model request is too large')}
 const body=JSON.parse(raw);if(!body||typeof body!=='object'||typeof body.model!=='string')throw Error('Invalid model request');
 if(!(await auth.models()).some(m=>m.slug===body.model))throw Error('Choose an available model in Wisp > ChatGPT.');
 const streaming=body.stream===true;body.store=false;body.stream=true;
 const response=await auth.authorized('https://api.openai.com/v1/responses',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.any([abort.signal,AbortSignal.timeout(180000)])});
 if(response.ok&&!streaming){
  let pending='',total=0,completed:unknown;const decoder=new TextDecoder();
  if(!response.body)throw Error('ChatGPT returned no response.');
  for await(const bytes of response.body){const chunk=decoder.decode(bytes,{stream:true});total+=chunk.length;if(total>32*1024*1024)throw Error('Model response is too large');pending+=chunk;let boundary:number;
   while((boundary=pending.indexOf('\n'))>=0){const line=pending.slice(0,boundary).trim();pending=pending.slice(boundary+1);if(!line.startsWith('data:'))continue;const json=line.slice(5).trim();if(json==='[DONE]')continue;const event=JSON.parse(json);if(event.type==='response.completed')completed=event.response;if(['response.failed','response.incomplete','error'].includes(event.type))throw Error('ChatGPT did not complete this response.');}
  }
  if(!completed)throw Error('ChatGPT response was interrupted.');res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'}).end(JSON.stringify(completed));return;
 }
 res.writeHead(response.status,{'content-type':response.headers.get('content-type')||'application/json','cache-control':'no-store'});
 if(!response.body){res.end();return}await pipeline(Readable.fromWeb(response.body as never),res);
}
