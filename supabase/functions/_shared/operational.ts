export const cors = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"GET,POST,OPTIONS"};
export const json = (data:unknown,status=200) => new Response(JSON.stringify(data),{status,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
export const uuid = (value:unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export async function sha256(value:string) {return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,"0")).join("");}
export async function hmac(secret:string,body:string){
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  return Array.from(new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(body))),b=>b.toString(16).padStart(2,"0")).join("");
}
export function equal(a:string,b:string){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
export function publicOrigin(value:unknown):string {
  if(typeof value!=="string")throw Error("Informe o endereço HTTPS público do sistema");
  const url=new URL(value);if(url.protocol!=="https:" || url.username || url.password || url.port || url.pathname!=="/" || url.search || url.hash || /^(localhost|.*\.local|.*\.internal|\d+\.\d+\.\d+\.\d+|\[.*\])$/.test(url.hostname))throw Error("Use somente a origem HTTPS pública, sem caminho ou parâmetros");
  return url.origin;
}
export function botDestination(value:string){const url=new URL(value);publicOrigin(url.origin);if(url.username || url.password || url.hash)throw Error("URL do bot inválida");return url.href;}
export type MetaMessage={id:string;phone:string;name:string;text:string;type:string;phoneId:string};
export function incomingMessages(payload:unknown):MetaMessage[]{
  const body=payload as {object?:string;entry?:{changes?:{value?:{metadata?:{phone_number_id?:string};contacts?:{wa_id?:string;profile?:{name?:string}}[];messages?:{id?:string;from?:string;type?:string;text?:{body?:string}}[]}}[]}[]};
  if(body?.object!=="whatsapp_business_account" || !Array.isArray(body.entry))return [];
  const messages:MetaMessage[]=[];
  for(const entry of body.entry)for(const change of entry.changes ?? []){
    const value=change.value;if(!value?.metadata?.phone_number_id)continue;
    for(const msg of value.messages ?? []){
      if(!msg.id || !msg.from || !/^[0-9]{8,15}$/.test(msg.from))continue;
      messages.push({id:msg.id,phone:msg.from,name:value.contacts?.find(c=>c.wa_id===msg.from)?.profile?.name ?? "Cliente WhatsApp",text:msg.text?.body?.slice(0,4096) ?? "",type:msg.type ?? "unknown",phoneId:value.metadata.phone_number_id});
    }
  }return messages;
}
