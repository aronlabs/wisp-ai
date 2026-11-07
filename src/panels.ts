import { z } from 'zod';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { uiNode, validateNode } from './ui-schema.ts';
import { referenceSchema } from './reply-stream.ts';
const key=z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/).refine(s=>!['__proto__','constructor','prototype'].includes(s));
export const panelBinding=z.object({nodeId:key,source:z.enum(['item_count','money','level','quest_completed']),itemId:z.number().int().positive().optional(),questId:z.number().int().positive().optional(),target:z.number().positive().finite().optional()}).superRefine((b,c)=>{
  if(b.source==='item_count'&&!b.itemId)c.addIssue({code:'custom',message:'itemId is required'});
  if(b.source==='quest_completed'&&!b.questId)c.addIssue({code:'custom',message:'questId is required'});
});
export const panelContent=z.object({id:key,title:z.string().min(1).max(100),ui:z.array(uiNode).min(1).max(48),references:z.record(key,referenceSchema).default({}),bindings:z.array(panelBinding).max(24).default([])}).superRefine((p,c)=>{
  try{
    if(new Set(p.ui.map(n=>n.id)).size!==p.ui.length)throw Error('Duplicate component ID');
    for(const n of p.ui){validateNode(n,p.ui);if(n.parent&&!p.ui.some(parent=>parent.id===n.parent))throw Error('Missing parent');if(n.kind==='button'&&n.action.kind!=='ask')throw Error('Persistent panel buttons must send follow-up questions');}
    if(Object.keys(p.references).length>64||JSON.stringify(p).length>28000)throw Error('Panel is too large');
    if(new Set(p.bindings.map(b=>b.nodeId)).size!==p.bindings.length)throw Error('Duplicate data binding');
    for(const b of p.bindings)if(!p.ui.some(n=>n.id===b.nodeId&&['stat','progress'].includes(n.kind)))throw Error('Bind data only to stat/progress nodes');
  }catch(e){c.addIssue({code:'custom',message:(e as Error).message})}
});
export const panelInput=z.discriminatedUnion('operation',[
  z.object({operation:z.literal('list')}),z.object({operation:z.literal('get'),id:key}),
  z.object({operation:z.literal('save'),panel:panelContent}),z.object({operation:z.literal('remove'),id:key}),
]);
export type Panel=z.infer<typeof panelContent>&{characterKey:string;updatedAt:number};
export class PanelStore{
 file:string;panels:Panel[]=[];queue:Promise<unknown>=Promise.resolve();
 constructor(file:string){this.file=file}
 async load(){try{const raw=JSON.parse(await readFile(this.file,'utf8'));if(!Array.isArray(raw))throw Error('Invalid panels file');this.panels=raw.map(p=>({...panelContent.parse(p),characterKey:z.string().min(1).parse(p.characterKey),updatedAt:z.number().parse(p.updatedAt)}));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}}
 list(characterKey:string){return this.panels.filter(p=>p.characterKey===characterKey)}
 async mutate(characterKey:string,input:z.infer<typeof panelInput>){
  const work=this.queue.catch(()=>{}).then(async()=>{
   const next=this.panels.filter(p=>!(p.characterKey===characterKey&&p.id===(input.operation==='save'?input.panel.id:'id'in input?input.id:'')));
   if(input.operation==='save'){
    if(next.filter(p=>p.characterKey===characterKey).length>=12)throw Error('Keep at most 12 panels per character');
    next.push({...panelContent.parse(input.panel),characterKey,updatedAt:Date.now()});
   }else if(input.operation!=='remove')return;
   await mkdir(path.dirname(this.file),{recursive:true});const temporary=this.file+'.'+randomUUID()+'.tmp';await writeFile(temporary,JSON.stringify(next,null,2));await rename(temporary,this.file);this.panels=next;
  });this.queue=work;await work;return this.list(characterKey);
 }
}
