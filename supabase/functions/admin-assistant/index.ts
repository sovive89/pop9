import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.99.2';
import { json, cors, uuid } from '../_shared/operational.ts';
import { AGENT_PAGES, AGENT_TASK_RULES, TUTORIALS, CHAT_MODELS, canAccessAgentPage, findAgentPage, validateAgentPlan } from '../_shared/assistant-help.ts';
import { decryptAIKey, parseModelJson, providerJson, textCompletion } from '../_shared/ai-text.ts';
import type { AssistantDatabase } from '../_shared/assistant-database.ts';

Deno.serve(async(req)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return json({error:'Método não permitido'},405);
 let admin:SupabaseClient<AssistantDatabase>|undefined;let requestId:string|undefined;let reserved=false;
 try{
  const authorization=req.headers.get('Authorization');if(!authorization?.startsWith('Bearer '))return json({error:'Não autenticado'},401);
  const token=authorization.slice(7);
  admin=createClient<AssistantDatabase>(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error:authError}=await admin.auth.getUser(token);
  if(authError||!user)return json({error:'Não autenticado'},401);
  const raw=await req.text();if(raw.length>12000)return json({error:'Solicitação muito grande'},413);
  let body;try{body=JSON.parse(raw);}catch{return json({error:'Dados inválidos'},400);}
  if(body.action!=='models'&&body.action!=='agent-plan')return json({error:'Ação inválida'},400);
  const unit=body.businessUnitId;if(!uuid(unit))return json({error:'Unidade inválida'},400);
  const {data:roles,error:roleError}=await admin.from('user_roles').select('business_unit_id,role').eq('user_id',user.id);
  if(roleError)throw Error('Não foi possível verificar o acesso.');
  const unitRoles=(roles??[]).filter(r=>r.business_unit_id===unit||(r.business_unit_id===null&&r.role==='admin')).map(r=>String(r.role));
  const page=typeof body.page==='string'?body.page.slice(0,200):'';
  const currentPage=findAgentPage(page);
  if(!currentPage||!canAccessAgentPage(unitRoles,currentPage))return json({error:'O agente não está disponível nesta página para o seu perfil'},403);
  const {data:business,error:businessError}=await admin.from('business_units').select('id,name').eq('id',unit).eq('active',true).maybeSingle();
  if(businessError)throw Error('Não foi possível consultar a unidade.');if(!business)return json({error:'Unidade indisponível'},404);
  const {data:credentials,error:credentialError}=await admin.from('ai_provider_credentials').select('provider,encrypted_key,iv').eq('business_unit_id',unit).eq('status','connected');
  if(credentialError)throw Error('Não foi possível verificar a configuração da IA.');
  if(body.action==='models'){
   const available:{id:string;label:string;provider:string}[]=[];const warnings:string[]=[];
   for(const provider of ['google','openai','anthropic']){
    const credential=credentials?.find(c=>c.provider===provider);if(!credential)continue;
    try{
     const key=await decryptAIKey(credential.encrypted_key,credential.iv);
     const headers:Record<string,string>=provider==='google'?{'x-goog-api-key':key}:provider==='openai'?{Authorization:'Bearer '+key}:{'x-api-key':key,'anthropic-version':'2023-06-01'};
     const endpoint=provider==='google'?'https://generativelanguage.googleapis.com/v1beta/models?pageSize=100':provider==='openai'?'https://api.openai.com/v1/models':'https://api.anthropic.com/v1/models?limit=100';
     const result=await providerJson(endpoint,headers);
     const ids=new Set((provider==='google'?result.models:result.data??[]).filter((m:{supportedGenerationMethods?:string[]})=>provider!=='google'||m.supportedGenerationMethods?.includes('generateContent')).map((m:{name?:string;id?:string})=>(m.name??m.id??'').replace(/^models\//,'')));
     available.push(...CHAT_MODELS.filter(m=>m.provider===provider&&ids.has(m.model)).map(m=>({id:m.id,label:m.label,provider:m.provider})));
     if(!CHAT_MODELS.some(m=>m.provider===provider&&ids.has(m.model)))warnings.push('Nenhum modelo homologado disponível em '+provider+'.');
    }catch(e){warnings.push(e instanceof Error?e.message:'Falha ao verificar '+provider);}
   }
   return json({models:available,warnings});
  }
  const prompt=body.prompt;
  if(typeof prompt!=='string'||!prompt.trim()||prompt.length>4000)return json({error:'Descreva uma tarefa de até 4.000 caracteres'},400);
  const model=CHAT_MODELS.find(m=>m.id===body.model);if(!model)return json({error:'Selecione um modelo disponível'},400);
  const credential=credentials?.find(c=>c.provider===model.provider);if(!credential)return json({error:'Conecte a IA em Conexões desta unidade'},409);
  const validatedRequestId=body.requestId;
  if(!uuid(validatedRequestId))return json({error:'Solicitação inválida'},400);requestId=validatedRequestId;
  // A migration nova amplia a reserva para papéis da unidade. Enquanto ela não
  // estiver aplicada, a função antiga rejeita não-admin como "Não autorizado";
  // isso é uma falha de dependência/deploy, não esgotamento de quota.
  const {error:reserveError}=await admin.rpc('reserve_assistant_request',{p_id:validatedRequestId,p_unit:unit,p_user:user.id,p_action:'chat',p_model:model.id});
  if(reserveError){
   const code=reserveError.code??'';const message=reserveError.message??'';
   const legacy=code===''||code==='P0001';
   if(code==='42501'||(legacy&&message.includes('Não autorizado')))return json({error:'Seu perfil não está autorizado a iniciar tarefas nesta unidade. A habilitação da quota para este perfil ainda está pendente.'},403);
   if(code==='54000'||(legacy&&message.includes('Limite')))return json({error:'Limite de IA da unidade atingido. Tente novamente mais tarde.'},429);
   if(code==='23505')return json({error:'Esta solicitação já foi utilizada. Envie uma nova tarefa.'},409);
   if(code==='22023')return json({error:'Os dados da solicitação são inválidos ou a unidade está inativa.'},400);
   return json({error:'Não foi possível iniciar esta tarefa. Envie uma nova solicitação.'},503);
  }reserved=true;
  const allowedPages=AGENT_PAGES.filter(target=>canAccessAgentPage(unitRoles,target)).map(({id,label,path,draftForm})=>({id,label,path,draftForm:draftForm??null}));
  const system=AGENT_TASK_RULES+'\nUnidade autorizada: '+business.name+'\nTutoriais do produto: '+JSON.stringify(TUTORIALS)+'\nPágina atual validada: '+JSON.stringify({id:currentPage.id,label:currentPage.label,path:currentPage.path})+'\nRotas disponíveis para este papel: '+JSON.stringify(allowedPages);
  const result=await textCompletion(model.provider,model.model,await decryptAIKey(credential.encrypted_key,credential.iv),system,[{role:'user',content:prompt.trim()}]);
  let parsedPlan:unknown;try{parsedPlan=parseModelJson(result.text);}catch{throw Error('A IA não devolveu um plano legível. Reformule a solicitação ou tente novamente com um único pedido.');}
  const plan=validateAgentPlan(parsedPlan,unitRoles,currentPage);
  const {error:completeError}=await admin.from('ai_assistant_usage').update({status:'completed',completed_at:new Date().toISOString(),input_tokens:result.inputTokens,output_tokens:result.outputTokens}).eq('id',validatedRequestId).eq('business_unit_id',unit);
  if(completeError)throw Error('A proposta foi gerada, mas não foi possível registrar a conclusão.');
  return json({plan,model:model.id});
 }catch(e){
  if(reserved&&admin&&requestId)await admin.from('ai_assistant_usage').update({status:'failed',completed_at:new Date().toISOString()}).eq('id',requestId);
  return json({error:e instanceof Error?e.message:'Falha ao preparar a tarefa'},503);
 }
});
