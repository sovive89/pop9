// @vitest-environment node
import {readFileSync} from "node:fs";
import ts from "typescript";
import {afterEach,beforeEach,describe,it,expect,vi} from "vitest";
import * as operational from "../../supabase/functions/_shared/operational";
import * as twilio from "../../supabase/functions/_shared/twilio";
const UNIT="00000000-0000-0000-0000-000000000001";
const SID="AC"+"1".repeat(32),SERVICE="VA"+"2".repeat(32),TOKEN="t".repeat(32);
const SECRETS={TWILIO_ACCOUNT_SID:SID,TWILIO_AUTH_TOKEN:TOKEN,TWILIO_VERIFY_SERVICE_SID:SERVICE};
function endpoint(options:{secrets?:Record<string,string>;pwaEnabled?:boolean;rpcError?:{code:string;message:string};vault?:Record<string,string>|null;twilioStatus?:string;unitActive?:boolean;unitError?:boolean;rpcErrors?:Record<string,{code:string;message:string}>}={}){
  const rpc=vi.fn(async(name:string,_args?:Record<string,unknown>)=>name==="twilio_credentials" ? {data:options.vault ?? null,error:null} : options.rpcErrors?.[name] ? {data:null,error:options.rpcErrors[name]} : options.rpcError ? {data:null,error:options.rpcError} : {data:name==="issue_pwa_sms_access" ? {name:null,email:null,bairro:null,marketing:false} : null,error:null});
  const db={rpc,from:(table:string)=>{const filters:Record<string,unknown>={};const query={select:()=>query,eq:(key:string,value:unknown)=>{filters[key]=value;return query;},maybeSingle:async()=>table==="business_units" ? (options.unitError ? {data:null,error:{code:"57014",message:"timeout"}} : {data:options.unitActive===false || filters.active!==true ? null : {id:filters.id},error:null}) : ({data:filters.provider==="twilio" ? {status:options.twilioStatus ?? "CONNECTED",config:{enabled:true}} : {status:"CONNECTED",config:{enabled:options.pwaEnabled!==false}},error:null})};return query;}};
  let handler!:(request:Request)=>Promise<Response>;
  const source=readFileSync("supabase/functions/pwa-verify/index.ts","utf8").replace(/^import .*;\r?\n/gm,"");
  const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const helpers={...operational,...twilio};
  const secrets={SUPABASE_URL:"https://project.supabase.co",SUPABASE_SERVICE_ROLE_KEY:"service",...(options.secrets ?? SECRETS)};
  new Function(...Object.keys(helpers),"createClient","Deno",code)(...Object.values(helpers),()=>db,{env:{get:(key:string)=>secrets[key as keyof typeof secrets]},serve:(fn:typeof handler)=>{handler=fn;}});
  return {rpc,post:async(body:unknown)=>{const r=await handler(new Request("https://project.supabase.co/pwa-verify",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}));return {status:r.status,body:await r.json()};}};
}
beforeEach(()=>{vi.spyOn(console,"error").mockImplementation(()=>undefined);});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
describe("pwa-verify (Twilio Verify)",()=>{
  it("normaliza celular brasileiro",()=>{
    expect(twilio.normalizeBrPhone("(61) 98765-4321")).toBe("5561987654321");
    expect(twilio.normalizeBrPhone("+55 61 3333-4444")).toBe("556133334444");
    expect(twilio.normalizeBrPhone("123")).toBe("");
  });
  it("sem as credenciais do Twilio, recusa sem chamar o Twilio",async()=>{
    const fetch=vi.fn();vi.stubGlobal("fetch",fetch);const api=endpoint({secrets:{}});
    expect((await api.post({action:"start",business_unit_id:UNIT,phone:"61987654321",name:"Ana Souza"})).status).toBe(503);expect(fetch).not.toHaveBeenCalled();
  });
  it("envia o SMS só depois de passar no limite do banco",async()=>{
    const fetch=vi.fn().mockResolvedValue(new Response("{}",{status:201}));vi.stubGlobal("fetch",fetch);const api=endpoint();
    const result=await api.post({action:"start",business_unit_id:UNIT,phone:"(61) 98765-4321",name:"Ana Souza"});
    expect(result.status).toBe(200);expect(api.rpc).toHaveBeenCalledWith("register_pwa_sms_send",{p_unit:UNIT,p_phone:"5561987654321"});
    const [url,init]=fetch.mock.calls[0];expect(url).toBe(`https://verify.twilio.com/v2/Services/${SERVICE}/Verifications`);
    expect(String(init.body)).toContain("To=%2B5561987654321");expect(init.headers.Authorization).toBe(`Basic ${btoa(`${SID}:${TOKEN}`)}`);
  });
  it("bloqueia excesso de envios sem chamar o Twilio",async()=>{
    const fetch=vi.fn();vi.stubGlobal("fetch",fetch);const api=endpoint({rpcError:{code:"P0001",message:"Aguarde 30 segundos para pedir outro código."}});
    const result=await api.post({action:"start",business_unit_id:UNIT,phone:"61987654321",name:"Ana Souza"});expect(result.status).toBe(429);expect(result.body.error).toContain("30 segundos");expect(fetch).not.toHaveBeenCalled();
  });
  it("código errado não emite acesso",async()=>{
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({status:"pending"}),{status:200})));const api=endpoint();
    expect((await api.post({action:"check",business_unit_id:UNIT,phone:"61987654321",name:"Ana Souza",code:"000000"})).status).toBe(401);expect(api.rpc).not.toHaveBeenCalledWith("issue_pwa_sms_access",expect.anything());
  });
  it("código aprovado emite acesso de uso único com o hash guardado no banco",async()=>{
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({status:"approved"}),{status:200})));const api=endpoint();
    const result=await api.post({action:"check",business_unit_id:UNIT,phone:"61987654321",name:"Ana Souza",code:"123456"});
    expect(result.status).toBe(200);expect(result.body.access_token).toMatch(/^[a-f0-9-]{72}$/);
    const args=api.rpc.mock.calls.find(([name])=>name==="issue_pwa_sms_access")![1] as Record<string,string>;expect(args.p_token_hash).toBe(await operational.sha256(result.body.access_token));expect(args.p_token_hash).not.toBe(result.body.access_token);
  });
  it("usa as credenciais da unidade (Vault) cadastradas em Conexões",async()=>{
    const fetch=vi.fn().mockResolvedValue(new Response("{}",{status:201}));vi.stubGlobal("fetch",fetch);
    const api=endpoint({secrets:{},vault:{accountSid:SID,authToken:TOKEN,verifyServiceSid:SERVICE}});
    expect((await api.post({action:"start",business_unit_id:UNIT,phone:"61987654321",name:"Ana Souza"})).status).toBe(200);
    expect(fetch.mock.calls[0][0]).toBe(`https://verify.twilio.com/v2/Services/${SERVICE}/Verifications`);
    expect(api.rpc).toHaveBeenCalledWith("twilio_credentials",{p_unit:UNIT});
  });
  it("credencial malformada no Vault é tratada como ausente",async()=>{
    const fetch=vi.fn();vi.stubGlobal("fetch",fetch);const api=endpoint({secrets:{},vault:{accountSid:"x",authToken:"y",verifyServiceSid:"z"}});
    expect((await api.post({action:"start",business_unit_id:UNIT,phone:"61987654321",name:"Ana Souza"})).status).toBe(503);expect(fetch).not.toHaveBeenCalled();
  });
  it("Twilio desconectado na unidade não envia SMS mesmo com credenciais",async()=>{
    const fetch=vi.fn();vi.stubGlobal("fetch",fetch);const api=endpoint({twilioStatus:"NOT_CONNECTED"});
    expect((await api.post({action:"start",business_unit_id:UNIT,phone:"61987654321",name:"Ana Souza"})).status).toBe(503);expect(fetch).not.toHaveBeenCalled();
  });
  it("loja com pedidos online desligados não envia SMS",async()=>{
    const fetch=vi.fn();vi.stubGlobal("fetch",fetch);const api=endpoint({pwaEnabled:false});
    expect((await api.post({action:"start",business_unit_id:UNIT,phone:"61987654321",name:"Ana Souza"})).status).toBe(404);expect(fetch).not.toHaveBeenCalled();
  });
  it("exige nome e sobrenome antes de gastar SMS",async()=>{
    const fetch=vi.fn();vi.stubGlobal("fetch",fetch);const api=endpoint();
    for(const name of ["Ana","A B","Ana 2"]){expect((await api.post({action:"start",business_unit_id:UNIT,phone:"61987654321",name})).status).toBe(400);}
    expect(fetch).not.toHaveBeenCalled();expect(api.rpc).not.toHaveBeenCalledWith("register_pwa_sms_send",expect.anything());
    expect(twilio.fullName("  ana   de souza ")).toBe("ana de souza");
  });
  it("código aprovado cria o cliente no CRM com o consentimento só quando marcado",async()=>{
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({status:"approved"}),{status:200})));const api=endpoint();
    await api.post({action:"check",business_unit_id:UNIT,phone:"61987654321",name:"Ana Souza",code:"123456",email:"ana@x.com",marketing:"true"});
    const args=api.rpc.mock.calls.find(([name])=>name==="issue_pwa_sms_access")![1] as Record<string,unknown>;
    expect(args).toMatchObject({p_phone:"5561987654321",p_name:"Ana Souza",p_email:"ana@x.com",p_marketing:false});
  });
  it("unidade inativa não envia SMS nem emite acesso",async()=>{
    const fetch=vi.fn();vi.stubGlobal("fetch",fetch);const api=endpoint({unitActive:false});
    for(const body of [{action:"start"},{action:"check",code:"123456"}])expect((await api.post({...body,business_unit_id:UNIT,phone:"61987654321",name:"Ana Souza"})).status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();expect(api.rpc).not.toHaveBeenCalledWith("register_pwa_sms_send",expect.anything());expect(api.rpc).not.toHaveBeenCalledWith("issue_pwa_sms_access",expect.anything());
  });
  it("se o Twilio recusa o número (4xx), o SMS não saiu: devolve a vaga do limite",async()=>{
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response("{}",{status:400})));const api=endpoint();
    const result=await api.post({action:"start",business_unit_id:UNIT,phone:"61987654321",name:"Ana Souza"});
    expect(result.status).toBe(400);expect(result.body.error).toContain("Confira o número");
    expect(api.rpc).toHaveBeenCalledWith("release_pwa_sms_send",{p_unit:UNIT,p_phone:"5561987654321"});
  });
  it("falha ao devolver a vaga não esconde a recusa do Twilio",async()=>{
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response("{}",{status:400})));const api=endpoint({rpcErrors:{release_pwa_sms_send:{code:"XX000",message:"down"}}});
    expect((await api.post({action:"start",business_unit_id:UNIT,phone:"61987654321",name:"Ana Souza"})).status).toBe(400);
    expect(console.error).toHaveBeenCalled();
  });
  it("Twilio fora do ar (5xx) ou sem resposta: 502 e a vaga continua contando (o SMS pode ter saído)",async()=>{
    for(const fetch of [vi.fn().mockResolvedValue(new Response("{}",{status:503})),vi.fn().mockRejectedValue(new DOMException("timeout","TimeoutError"))]){
      vi.stubGlobal("fetch",fetch);const api=endpoint();
      const result=await api.post({action:"start",business_unit_id:UNIT,phone:"61987654321",name:"Ana Souza"});
      expect(result.status).toBe(502);expect(result.body.error).toContain("indisponível");
      expect(api.rpc).not.toHaveBeenCalledWith("release_pwa_sms_send",expect.anything());
      expect(fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    }
    expect(console.error).toHaveBeenCalled();
  });
  it("na conferência, Twilio indisponível vira 502 e código expirado vira 401",async()=>{
    const check={action:"check",business_unit_id:UNIT,phone:"61987654321",name:"Ana Souza",code:"123456"};
    for(const response of [new Response("{}",{status:500}),new Response("não é json",{status:200})]){
      vi.stubGlobal("fetch",vi.fn().mockResolvedValue(response));const api=endpoint();
      expect((await api.post(check)).status).toBe(502);expect(api.rpc).not.toHaveBeenCalledWith("issue_pwa_sms_access",expect.anything());
    }
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response("{}",{status:404})));
    expect((await endpoint().post(check)).status).toBe(401);
  });
  it("chamada lenta ao Twilio é cortada pelo tempo limite",async()=>{
    expect(twilio.TWILIO_TIMEOUT_MS).toBe(10000);
    const hanging=((_url:string,init:RequestInit)=>new Promise((_resolve,reject)=>init.signal!.addEventListener("abort",()=>reject(init.signal!.reason)))) as unknown as typeof fetch;
    const config={accountSid:SID,authToken:TOKEN,verifyServiceSid:SERVICE};
    expect(await twilio.startVerification(config,"5561987654321",hanging,20)).toBe("unavailable");
    await expect(twilio.checkVerification(config,"5561987654321","123456",hanging,20)).rejects.toThrow();
  });
  it("loja indisponível no banco (PT404) vira 404 e falha ao ler a unidade vira 500",async()=>{
    vi.stubGlobal("fetch",vi.fn());
    expect((await endpoint({rpcError:{code:"PT404",message:"Pedidos online indisponíveis"}}).post({action:"start",business_unit_id:UNIT,phone:"61987654321",name:"Ana Souza"})).status).toBe(404);
    expect((await endpoint({unitError:true}).post({action:"start",business_unit_id:UNIT,phone:"61987654321",name:"Ana Souza"})).status).toBe(500);
  });
  it("falha inesperada do banco vira 5xx (só erro de regra vira 429/409)",async()=>{
    const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({status:"approved"}),{status:200}));vi.stubGlobal("fetch",fetch);const api=endpoint({rpcError:{code:"XX000",message:"connection lost"}});
    expect((await api.post({action:"start",business_unit_id:UNIT,phone:"61987654321",name:"Ana Souza"})).status).toBe(500);expect(fetch).not.toHaveBeenCalled();
    expect((await api.post({action:"check",business_unit_id:UNIT,phone:"61987654321",name:"Ana Souza",code:"123456"})).status).toBe(500);
  });
});
