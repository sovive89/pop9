// @vitest-environment node
import {readFileSync} from "node:fs";
import ts from "typescript";
import {afterEach,describe,it,expect,vi} from "vitest";
import * as operational from "../../supabase/functions/_shared/operational";
import * as twilio from "../../supabase/functions/_shared/twilio";
const UNIT="00000000-0000-0000-0000-000000000001";
const SECRETS={TWILIO_ACCOUNT_SID:"AC123",TWILIO_AUTH_TOKEN:"secret",TWILIO_VERIFY_SERVICE_SID:"VA123"};
function endpoint(options:{secrets?:Record<string,string>;pwaEnabled?:boolean;rpcError?:{code:string;message:string}}={}){
  const rpc=vi.fn(async(name:string,_args?:Record<string,unknown>)=>options.rpcError ? {data:null,error:options.rpcError} : {data:name==="issue_pwa_sms_access" ? {name:null,email:null,bairro:null,marketing:false} : name==="save_pwa_profile" ? {name:"Ana"} : null,error:null});
  const db={rpc,from:()=>{const query={select:()=>query,eq:()=>query,maybeSingle:async()=>({data:{status:"CONNECTED",config:{enabled:options.pwaEnabled!==false}},error:null})};return query;}};
  let handler!:(request:Request)=>Promise<Response>;
  const source=readFileSync("supabase/functions/pwa-verify/index.ts","utf8").replace(/^import .*;\r?\n/gm,"");
  const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const helpers={...operational,...twilio};
  const secrets={SUPABASE_URL:"https://project.supabase.co",SUPABASE_SERVICE_ROLE_KEY:"service",...(options.secrets ?? SECRETS)};
  new Function(...Object.keys(helpers),"createClient","Deno",code)(...Object.values(helpers),()=>db,{env:{get:(key:string)=>secrets[key as keyof typeof secrets]},serve:(fn:typeof handler)=>{handler=fn;}});
  return {rpc,post:async(body:unknown)=>{const r=await handler(new Request("https://project.supabase.co/pwa-verify",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}));return {status:r.status,body:await r.json()};}};
}
afterEach(()=>{vi.unstubAllGlobals();});
describe("pwa-verify (Twilio Verify)",()=>{
  it("normaliza celular brasileiro",()=>{
    expect(twilio.normalizeBrPhone("(61) 98765-4321")).toBe("5561987654321");
    expect(twilio.normalizeBrPhone("+55 61 3333-4444")).toBe("556133334444");
    expect(twilio.normalizeBrPhone("123")).toBe("");
  });
  it("sem as credenciais do Twilio, recusa sem chamar o Twilio",async()=>{
    const fetch=vi.fn();vi.stubGlobal("fetch",fetch);const api=endpoint({secrets:{}});
    expect((await api.post({action:"start",business_unit_id:UNIT,phone:"61987654321"})).status).toBe(503);expect(fetch).not.toHaveBeenCalled();
  });
  it("envia o SMS só depois de passar no limite do banco",async()=>{
    const fetch=vi.fn().mockResolvedValue(new Response("{}",{status:201}));vi.stubGlobal("fetch",fetch);const api=endpoint();
    const result=await api.post({action:"start",business_unit_id:UNIT,phone:"(61) 98765-4321"});
    expect(result.status).toBe(200);expect(api.rpc).toHaveBeenCalledWith("register_pwa_sms_send",{p_unit:UNIT,p_phone:"5561987654321"});
    const [url,init]=fetch.mock.calls[0];expect(url).toBe("https://verify.twilio.com/v2/Services/VA123/Verifications");
    expect(String(init.body)).toContain("To=%2B5561987654321");expect(init.headers.Authorization).toBe(`Basic ${btoa("AC123:secret")}`);
  });
  it("bloqueia excesso de envios sem chamar o Twilio",async()=>{
    const fetch=vi.fn();vi.stubGlobal("fetch",fetch);const api=endpoint({rpcError:{code:"P0001",message:"Aguarde 30 segundos para pedir outro código."}});
    const result=await api.post({action:"start",business_unit_id:UNIT,phone:"61987654321"});expect(result.status).toBe(429);expect(result.body.error).toContain("30 segundos");expect(fetch).not.toHaveBeenCalled();
  });
  it("código errado não emite acesso",async()=>{
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({status:"pending"}),{status:200})));const api=endpoint();
    expect((await api.post({action:"check",business_unit_id:UNIT,phone:"61987654321",code:"000000"})).status).toBe(401);expect(api.rpc).not.toHaveBeenCalled();
  });
  it("código aprovado emite acesso de uso único com o hash guardado no banco",async()=>{
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({status:"approved"}),{status:200})));const api=endpoint();
    const result=await api.post({action:"check",business_unit_id:UNIT,phone:"61987654321",code:"123456"});
    expect(result.status).toBe(200);expect(result.body.access_token).toMatch(/^[a-f0-9-]{72}$/);
    const args=api.rpc.mock.calls[0][1] as Record<string,string>;expect(args.p_token_hash).toBe(await operational.sha256(result.body.access_token));expect(args.p_token_hash).not.toBe(result.body.access_token);
  });
  it("loja com pedidos online desligados não envia SMS",async()=>{
    const fetch=vi.fn();vi.stubGlobal("fetch",fetch);const api=endpoint({pwaEnabled:false});
    expect((await api.post({action:"start",business_unit_id:UNIT,phone:"61987654321"})).status).toBe(404);expect(fetch).not.toHaveBeenCalled();
  });
  it("formulário exige o acesso e repassa o consentimento explícito",async()=>{
    const api=endpoint();expect((await api.post({action:"profile",business_unit_id:UNIT,name:"Ana"})).status).toBe(401);
    const token=crypto.randomUUID()+crypto.randomUUID();
    expect((await api.post({action:"profile",business_unit_id:UNIT,access_token:token,name:"Ana",marketing:"true"})).status).toBe(200);
    expect((api.rpc.mock.calls[0][1] as Record<string,unknown>).p_marketing).toBe(false);
  });
});
