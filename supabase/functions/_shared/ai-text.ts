import type { ChatMessage } from './assistant-help.ts';
export async function decryptAIKey(encrypted:string,iv:string){
 const master=Deno.env.get('AI_CREDENTIALS_ENCRYPTION_KEY');
 if(!master)throw Error('Cofre de IA indisponível. Verifique a configuração com o administrador.');
 const decode=(value:string)=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
 const raw=decode(master);if(raw.length!==32)throw Error('Cofre de IA inválido.');
 const key=await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['decrypt']);
 const clear=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(iv)},key,decode(encrypted));
 return new TextDecoder().decode(clear);
}
export async function providerJson(url:string,headers:Record<string,string>,body?:unknown,timeoutMs?:number){
 const response=await fetch(url,{method:body===undefined?'GET':'POST',headers:{...headers,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(timeoutMs??(body===undefined?12000:60000)),redirect:'error'});
 if(!response.ok){await response.body?.cancel();throw Error(response.status===429?'Limite do provedor de IA atingido.':response.status===401||response.status===403?'A credencial de IA foi recusada pelo provedor.':'O provedor de IA não concluiu a solicitação (HTTP '+response.status+').');}
 return await response.json();
}
export async function textCompletion(provider:string,model:string,key:string,system:string,messages:ChatMessage[]){
 if(provider==='google'){
  const body=await providerJson('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent',{'x-goog-api-key':key},{systemInstruction:{parts:[{text:system}]},contents:messages.map(m=>({role:m.role==='assistant'?'model':'user',parts:[{text:m.content}]})),generationConfig:{maxOutputTokens:2048,temperature:0.3,thinkingConfig:{thinkingBudget:0}}});
  const text=(body.candidates?.[0]?.content?.parts??[]).filter((p:{text?:string;thought?:boolean})=>p.text&&!p.thought).map((p:{text:string})=>p.text).join('\n');
  if(!text)throw Error('O provedor não retornou resposta de texto.');
  return {text:text.slice(0,14000),inputTokens:body.usageMetadata?.promptTokenCount??null,outputTokens:body.usageMetadata?.candidatesTokenCount??null};
 }
 if(provider==='openai'){
  const body=await providerJson('https://api.openai.com/v1/chat/completions',{Authorization:'Bearer '+key},{model,messages:[{role:'system',content:system},...messages],max_completion_tokens:2048,temperature:0.3,store:false});
  const text=body.choices?.[0]?.message?.content;if(typeof text!=='string'||!text)throw Error('O provedor não retornou resposta de texto.');
  return {text:text.slice(0,14000),inputTokens:body.usage?.prompt_tokens??null,outputTokens:body.usage?.completion_tokens??null};
 }
 if(provider==='anthropic'){
  const body=await providerJson('https://api.anthropic.com/v1/messages',{'x-api-key':key,'anthropic-version':'2023-06-01'},{model,system,messages,max_tokens:2048,temperature:0.3});
  const text=(body.content??[]).filter((p:{type:string})=>p.type==='text').map((p:{text:string})=>p.text).join('\n');if(!text)throw Error('O provedor não retornou resposta de texto.');
  return {text:text.slice(0,14000),inputTokens:body.usage?.input_tokens??null,outputTokens:body.usage?.output_tokens??null};
 }
 throw Error('Provedor não oferece conversa.');
}

/** Arquivo enviado ao modelo: PDF ou imagem em base64 (planilhas e texto vão como texto). */
export type ModelAttachment={kind:'pdf'|'image';mime:string;data:string;name:string};
/** Extração de documentos: envia PDFs/imagens no formato nativo de cada provedor e pede JSON. */
export async function documentCompletion(provider:string,model:string,key:string,system:string,userText:string,attachments:ModelAttachment[]){
 const timeout=150000;
 if(provider==='google'){
  const parts=[...attachments.map(a=>({inlineData:{mimeType:a.mime,data:a.data}})),{text:userText}];
  const body=await providerJson('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent',{'x-goog-api-key':key},{systemInstruction:{parts:[{text:system}]},contents:[{role:'user',parts}],generationConfig:{temperature:0.1,maxOutputTokens:16384,responseMimeType:'application/json'}},timeout);
  const text=(body.candidates?.[0]?.content?.parts??[]).filter((p:{text?:string;thought?:boolean})=>p.text&&!p.thought).map((p:{text:string})=>p.text).join('\n');
  if(!text)throw Error('O provedor não retornou o rascunho do cardápio.');
  return {text,inputTokens:body.usageMetadata?.promptTokenCount??null,outputTokens:body.usageMetadata?.candidatesTokenCount??null};
 }
 if(provider==='openai'){
  const content=[...attachments.map(a=>a.kind==='image'?{type:'image_url',image_url:{url:`data:${a.mime};base64,${a.data}`}}:{type:'file',file:{filename:a.name,file_data:`data:${a.mime};base64,${a.data}`}}),{type:'text',text:userText}];
  const body=await providerJson('https://api.openai.com/v1/chat/completions',{Authorization:'Bearer '+key},{model,messages:[{role:'system',content:system},{role:'user',content}],max_completion_tokens:16384,temperature:0.1,store:false,response_format:{type:'json_object'}},timeout);
  const text=body.choices?.[0]?.message?.content;if(typeof text!=='string'||!text)throw Error('O provedor não retornou o rascunho do cardápio.');
  return {text,inputTokens:body.usage?.prompt_tokens??null,outputTokens:body.usage?.completion_tokens??null};
 }
 if(provider==='anthropic'){
  const content=[...attachments.map(a=>a.kind==='image'?{type:'image',source:{type:'base64',media_type:a.mime,data:a.data}}:{type:'document',source:{type:'base64',media_type:'application/pdf',data:a.data}}),{type:'text',text:userText}];
  const body=await providerJson('https://api.anthropic.com/v1/messages',{'x-api-key':key,'anthropic-version':'2023-06-01'},{model,system,messages:[{role:'user',content}],max_tokens:16000,temperature:0.1},timeout);
  const text=(body.content??[]).filter((p:{type:string})=>p.type==='text').map((p:{text:string})=>p.text).join('\n');if(!text)throw Error('O provedor não retornou o rascunho do cardápio.');
  return {text,inputTokens:body.usage?.input_tokens??null,outputTokens:body.usage?.output_tokens??null};
 }
 throw Error('Este provedor não lê arquivos.');
}
/** Extrai o primeiro objeto JSON de uma resposta (tolera cercas de markdown). */
export function parseModelJson(text:string):unknown{
 const start=text.indexOf('{');const end=text.lastIndexOf('}');
 if(start<0||end<=start)throw Error('A IA não devolveu um rascunho legível. Tente novamente ou envie um arquivo mais nítido.');
 try{return JSON.parse(text.slice(start,end+1));}catch{throw Error('A IA não devolveu um rascunho legível. Tente novamente ou envie um arquivo mais nítido.');}
}
