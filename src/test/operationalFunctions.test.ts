// @vitest-environment node
import {readFileSync} from "node:fs";
import ts from "typescript";
import {describe,it,expect,vi} from "vitest";
import * as helpers from "../../supabase/functions/_shared/operational";
const UNIT="00000000-0000-0000-0000-000000000001";
function endpoint(name:string,options:{authorized?:boolean;secrets?:Record<string,string>;duplicate?:boolean}={}){
  const rpc=vi.fn(async(name:string,args:Record<string,unknown>)=>({data:name==="ingest_whatsapp_message" ? {id:args.p_id} : name==="claim_whatsapp_reply" ? options.duplicate ? null : {id:args.p_id,reply:"Olá"} : {orderId:"order",total:25},error:null}));
  const writes:Record<string,unknown>[]=[];
  const db={auth:{getUser:async()=>({data:{user:{id:"admin"}},error:null})},rpc,from:(table:string)=>{
    const filters:Record<string,unknown>={};let values:Record<string,unknown>|null=null;
    const result=()=>({data:table==="user_roles" ? options.authorized===false ? [{business_unit_id:"other"}] : [{business_unit_id:UNIT}] : table==="business_units" ? {id:UNIT,name:"Loja"} : table==="integrations" ? filters.provider==="own-pwa" ? {provider:"own-pwa",status:"CONNECTED",config:{enabled:true,publicOrigin:"https://loja.com"}} : {business_unit_id:UNIT,status:"CONNECTED",config:{phoneNumberId:"12345",businessPhone:"5511999999999",botMode:"welcome",graphVersion:"v24.0"}} : table==="menu_items" ? [{id:"burger",name:"Burger",price:25}] : [],error:null});
    const query={select:()=>query,eq:(key:string,value:unknown)=>{filters[key]=value;return query;},in:()=>query,order:()=>query,maybeSingle:async()=>result(),upsert:async(value:Record<string,unknown>)=>{writes.push(value);return {error:null};},update:(value:Record<string,unknown>)=>{values=value;writes.push(values);return query;},then:(resolve:(value:unknown)=>unknown,reject:(error:unknown)=>unknown)=>Promise.resolve(result()).then(resolve,reject)};return query;
  }};
  let handler!:(request:Request)=>Promise<Response>;
  const source=readFileSync(`supabase/functions/${name}/index.ts`,"utf8").replace(/^import .*;\r?\n/gm,"");
  const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  new Function(...Object.keys(helpers),"createClient","Deno",code)(...Object.values(helpers),()=>db,{env:{get:(key:string)=>options.secrets?.[key] ?? (key==="SUPABASE_URL" ? "https://project.supabase.co" : key==="SUPABASE_SERVICE_ROLE_KEY" ? "service" : undefined)},serve:(fn:typeof handler)=>{handler=fn;}});
  return {handler,rpc,writes,post:(body:unknown,headers:Record<string,string>={})=>handler(new Request("https://project.supabase.co/function",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer valid",...headers},body:JSON.stringify(body)}))};
}
describe("operational Edge Function gates",()=>{
  it("rejects another unit's administrator before writing integration settings",async()=>{const api=endpoint("manage-operational-integrations",{authorized:false});expect((await api.post({business_unit_id:UNIT,action:"save",provider:"own-pwa",config:{enabled:true,publicOrigin:"https://loja.com"}})).status).toBe(403);expect(api.writes).toHaveLength(0);});
  it("keeps WhatsApp disconnected when Meta credentials are missing",async()=>{const api=endpoint("manage-operational-integrations");const result=await (await api.post({business_unit_id:UNIT,action:"connect",provider:"whatsapp",config:{phoneNumberId:"12345",graphVersion:"v24.0"}})).json();expect(result.success).toBe(false);expect(api.writes[0].status).toBe("NOT_CONNECTED");});
  it("rejects unsigned and tampered webhooks before accessing the database",async()=>{const api=endpoint("whatsapp-webhook",{secrets:{WHATSAPP_APP_SECRET:"appsecret"}});expect((await api.post({entry:[]})).status).toBe(403);expect((await api.post({entry:[]},{"x-hub-signature-256":"sha256="+"0".repeat(64)})).status).toBe(403);expect(api.rpc).not.toHaveBeenCalled();});
  it("validates Meta GET challenge without revealing the configured token",async()=>{const api=endpoint("whatsapp-webhook",{secrets:{WHATSAPP_VERIFY_TOKEN:"verify"}});const good=await api.handler(new Request("https://project.supabase.co?hub.mode=subscribe&hub.verify_token=verify&hub.challenge=challenge"));expect(await good.text()).toBe("challenge");expect((await api.handler(new Request("https://project.supabase.co?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=challenge"))).status).toBe(403);});
  it("registers verified messages with hashed tokens and sends one response",async()=>{
    const api=endpoint("whatsapp-webhook",{secrets:{WHATSAPP_APP_SECRET:"secret",WHATSAPP_ACCESS_TOKEN:"access"}});const fetch=vi.fn().mockResolvedValue(new Response("{}",{status:200}));vi.stubGlobal("fetch",fetch);
    const payload={object:"whatsapp_business_account",entry:[{changes:[{value:{metadata:{phone_number_id:"12345"},contacts:[{wa_id:"5511999999999",profile:{name:"João"}}],messages:[{id:"wamid.1",from:"5511999999999",type:"text",text:{body:"PEDIR"}}]}}]}]};
    const response=await api.post(payload,{"x-hub-signature-256":`sha256=${await helpers.hmac("secret",JSON.stringify(payload))}`});expect(response.status).toBe(200);const args=api.rpc.mock.calls[0][1];expect(args.p_unit).toBe(UNIT);expect(args.p_token_hash).toMatch(/^[a-f0-9]{64}$/);expect(args.p_order_url).toContain(`/pedir/${UNIT}?origem=whatsapp&acesso=`);expect(fetch).toHaveBeenCalledOnce();vi.unstubAllGlobals();
  });
  it("requires a WhatsApp-issued token to submit, but exposes only public menu data anonymously",async()=>{const api=endpoint("public-order");const menu=await (await api.post({action:"menu",business_unit_id:UNIT})).json();expect(menu.name).toBe("Loja");expect(menu.items).toHaveLength(1);expect((await api.post({action:"submit",business_unit_id:UNIT,items:[{id:"burger",quantity:1}]})).status).toBe(401);expect(api.rpc).not.toHaveBeenCalled();});
  it("serves a manifest scoped to the store's ordering route",async()=>{const api=endpoint("public-order");const response=await api.handler(new Request(`https://project.supabase.co?action=manifest&unit=${UNIT}`));const manifest=await response.json();expect(manifest.start_url).toBe(`https://loja.com/pedir/${UNIT}`);expect(manifest.icons[1].sizes).toBe("512x512");expect(manifest.start_url).not.toContain("acesso");});
});
