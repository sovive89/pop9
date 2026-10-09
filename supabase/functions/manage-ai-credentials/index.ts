import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type", "Content-Type": "application/json" };
const reply = (data: unknown, status=200) => new Response(JSON.stringify(data), { status, headers: CORS });
const PROVIDERS = new Set(["openai","google","xai","bfl","ideogram","anthropic"]);
const ENDPOINTS: Record<string,string> = {
  openai:"https://api.openai.com/v1/models",
  google:"https://generativelanguage.googleapis.com/v1beta/models",
  xai:"https://api.x.ai/v1/models",
  bfl:"https://api.bfl.ai/v1/get_result/invalid",
  ideogram:"https://api.ideogram.ai/v1/ideogram-v3/generate",
  anthropic:"https://api.anthropic.com/v1/models?limit=1",
};
function base64(data:Uint8Array) { let s=""; for(const b of data) s+=String.fromCharCode(b); return btoa(s); }
function fromBase64(s:string) { return Uint8Array.from(atob(s),c=>c.charCodeAt(0)); }
async function cipherKey() {
  const value=Deno.env.get("AI_CREDENTIALS_ENCRYPTION_KEY");
  if(!value) throw new Error("Configure AI_CREDENTIALS_ENCRYPTION_KEY (32 bytes em base64) nos secrets do Supabase");
  const bytes=fromBase64(value);
  if(bytes.length!==32) throw new Error("AI_CREDENTIALS_ENCRYPTION_KEY precisa ter 32 bytes");
  return crypto.subtle.importKey("raw",bytes,"AES-GCM",false,["encrypt","decrypt"]);
}
async function encrypt(secret:string) {
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const data=new TextEncoder().encode(secret);
  const result=await crypto.subtle.encrypt({name:"AES-GCM",iv},await cipherKey(),data);
  return { encrypted_key:base64(new Uint8Array(result)),iv:base64(iv) };
}
async function testKey(provider:string,key:string) {
  const headers:Record<string,string>={};
  if(provider==="google") headers["x-goog-api-key"]=key;
  else if(provider==="anthropic") {headers["x-api-key"]=key;headers["anthropic-version"]="2023-06-01";}
  else if(provider==="ideogram") headers["Api-Key"]=key;
  else if(provider==="bfl") headers["x-key"]=key;
  else headers.Authorization="Bearer "+key;
  const response=await fetch(ENDPOINTS[provider],{headers,signal:AbortSignal.timeout(12000)});
  // 400/404 for providers without a safe read-only credential probe are not proof of valid credentials.
  if(provider==="bfl" || provider==="ideogram") throw new Error("Teste de credencial indisponível para este provedor; conexão não ativada");
  if(!response.ok) throw new Error("A API do provedor recusou a validação (HTTP "+response.status+")");
}
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS") return new Response("ok",{headers:CORS});
 if(req.method!=="POST") return reply({error:"Método não permitido"},405);
 try{
  const url=Deno.env.get("SUPABASE_URL")!,anon=Deno.env.get("SUPABASE_ANON_KEY")!,service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const token=req.headers.get("Authorization")??"";
  const client=createClient(url,anon,{global:{headers:{Authorization:token}}});
  const {data:{user},error:authErr}=await client.auth.getUser();
  if(authErr||!user)return reply({error:"Não autenticado"},401);
  const admin=createClient(url,service);
  const {action,businessUnitId,provider,apiKey}=await req.json();
  if(action==="units"){
    const {data:roles,error:rolesError}=await admin.from("user_roles").select("business_unit_id").eq("user_id",user.id).eq("role","admin");
    if(rolesError)throw rolesError;
    if(!roles?.length)return reply({error:"Sem permissão de administrador"},403);
    let query=admin.from("business_units").select("id,name").eq("active",true).order("name");
    if(!roles.some(r=>r.business_unit_id===null)){
      const ids=roles.map(r=>r.business_unit_id).filter(Boolean);
      query=query.in("id",ids);
    }
    const {data:units,error:unitsError}=await query;
    if(unitsError)throw unitsError;
    return reply({units:units??[]});
  }
  if(typeof businessUnitId!=="string"||!businessUnitId)return reply({error:"Unidade obrigatória"},400);
  const {data:role}=await admin.from("user_roles").select("id").eq("user_id",user.id).eq("role","admin").or(`business_unit_id.eq.${businessUnitId},business_unit_id.is.null`).limit(1).maybeSingle();
  if(!role)return reply({error:"Sem permissão de administrador nesta unidade"},403);
  if(action==="list"){
   const {data,error}=await admin.from("ai_provider_credentials").select("provider,status,validated_at,updated_at").eq("business_unit_id",businessUnitId);
   if(error)throw error;
   return reply({connections:data});
  }
  if(!PROVIDERS.has(provider))return reply({error:"Provedor inválido"},400);
  if(action==="disconnect"){
   const {error}=await admin.from("ai_provider_credentials").delete().eq("business_unit_id",businessUnitId).eq("provider",provider);
   if(error)throw error;
   return reply({ok:true});
  }
  if(action!=="connect"||typeof apiKey!=="string"||apiKey.trim().length<10)return reply({error:"Chave inválida"},400);
  await testKey(provider,apiKey.trim());
  const sealed=await encrypt(apiKey.trim());
  const {error}=await admin.from("ai_provider_credentials").upsert({business_unit_id:businessUnitId,provider,...sealed,status:"connected",validated_at:new Date().toISOString(),updated_at:new Date().toISOString()},{onConflict:"business_unit_id,provider"});
  if(error)throw error;
  return reply({ok:true,provider,status:"connected"});
 }catch(e){return reply({error:e instanceof Error?e.message:"Falha na configuração"},500);}
});