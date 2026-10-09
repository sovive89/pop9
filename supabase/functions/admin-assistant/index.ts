import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.99.2';
import { json, cors, uuid } from '../_shared/operational.ts';
import { TUTORIALS, ASSISTANT_RULES, CHAT_MODELS, validateMessages } from '../_shared/assistant-help.ts';
import { decryptAIKey, providerJson, textCompletion } from '../_shared/ai-text.ts';
Deno.serve(async(req)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return json({error:'Método não permitido'},405);
 let admin:ReturnType<typeof createClient>|undefined;let requestId:string|undefined;let reserved=false;
 try{
  const authorization=req.headers.get('Authorization');if(!authorization?.startsWith('Bearer '))return json({error:'Não autenticado'},401);
  const token=authorization.slice(7);
  admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error:authError}=await admin.auth.getUser(token);
  if(authError||!user)return json({error:'Não autenticado'},401);
  const raw=await req.text();if(raw.length>50000)return json({error:'Conversa muito grande'},413);
  let body;try{body=JSON.parse(raw);}catch{return json({error:'Dados inválidos'},400);}
  const unit=body.businessUnitId;if(!uuid(unit))return json({error:'Unidade inválida'},400);
  const {data:roles,error:roleError}=await admin.from('user_roles').select('business_unit_id').eq('user_id',user.id).eq('role','admin');
  if(roleError)throw Error('Não foi possível verificar o acesso.');
  if(!roles?.some(r=>r.business_unit_id===null||r.business_unit_id===unit))return json({error:'Assistente disponível somente ao administrador desta unidade'},403);
  const {data:business,error:businessError}=await admin.from('business_units').select('id,name').eq('id',unit).eq('active',true).maybeSingle();
  if(businessError)throw Error('Não foi possível consultar a unidade.');if(!business)return json({error:'Unidade indisponível'},404);
  const {data:credentials,error:credentialError}=await admin.from('ai_provider_credentials').select('provider,encrypted_key,iv').eq('business_unit_id',unit).eq('status','connected');
  if(credentialError)throw Error('Não foi possível verificar a configuração da IA.');
  if(body.action==='models'){
   const available=[];const warnings=[];
   for(const provider of ['google','openai','anthropic']){
    const credential=credentials?.find(c=>c.provider===provider);if(!credential)continue;
    try{
     const key=await decryptAIKey(credential.encrypted_key,credential.iv);
     const headers=provider==='google'?{'x-goog-api-key':key}:provider==='openai'?{Authorization:'Bearer '+key}:{'x-api-key':key,'anthropic-version':'2023-06-01'};
     const endpoint=provider==='google'?'https://generativelanguage.googleapis.com/v1beta/models?pageSize=100':provider==='openai'?'https://api.openai.com/v1/models':'https://api.anthropic.com/v1/models?limit=100';
     const result=await providerJson(endpoint,headers);
     const ids=new Set((provider==='google'?result.models:result.data??[]).filter((m:{supportedGenerationMethods?:string[]})=>provider!=='google'||m.supportedGenerationMethods?.includes('generateContent')).map((m:{name?:string;id?:string})=>(m.name??m.id??'').replace(/^models\//,'')));
     available.push(...CHAT_MODELS.filter(m=>m.provider===provider&&ids.has(m.model)).map(m=>({id:m.id,label:m.label,provider:m.provider})));
     if(!CHAT_MODELS.some(m=>m.provider===provider&&ids.has(m.model)))warnings.push('Nenhum modelo de conversa homologado disponível em '+provider+'.');
    }catch(e){warnings.push(e instanceof Error?e.message:'Falha ao verificar '+provider);}
   }
   return json({models:available,warnings});
  }
  if(body.action!=='chat')return json({error:'Ação inválida'},400);
  let messages;try{messages=validateMessages(body.messages);}catch(e){return json({error:(e as Error).message},400);}
  const model=CHAT_MODELS.find(m=>m.id===body.model);if(!model)return json({error:'Selecione um modelo de conversa disponível'},400);
  const credential=credentials?.find(c=>c.provider===model.provider);if(!credential)return json({error:'Conecte a IA em Conexões desta unidade'},409);
  const context=body.context??'help';if(!['help','menu','stock','orders'].includes(context))return json({error:'Consulta inválida'},400);
  if(!uuid(body.requestId))return json({error:'Solicitação inválida'},400);requestId=body.requestId;
  const {error:reserveError}=await admin.rpc('reserve_assistant_request',{p_id:requestId,p_unit:unit,p_user:user.id,p_action:'chat',p_model:model.id});
  if(reserveError)return json({error:reserveError.message.includes('Limite')?'Limite de IA da unidade atingido. Tente novamente mais tarde.':'Não foi possível iniciar esta solicitação. Envie uma nova mensagem.'},429);reserved=true;
  let snapshot:unknown={type:'help',note:'Nenhum dado operacional consultado'};
  if(context==='menu'||context==='stock'){
   const query=context==='menu'?admin.from('menu_items').select('id,name,description,price,status,active').eq('business_unit_id',unit).order('name').limit(101):admin.from('raw_materials').select('id,name,unit,current_stock,min_stock,average_cost,active,categoria').eq('business_unit_id',unit).eq('active',true).order('name').limit(101);
   const {data,error}=await query;if(error)throw Error('Não foi possível consultar os dados da unidade.');
   snapshot={type:context,asOf:new Date().toISOString(),limited:(data?.length??0)>100,limit:100,rows:(data??[]).slice(0,100).map(row=>context==='menu'?{id:String(row.id).slice(0,150),name:String(row.name).slice(0,120),description:String(row.description??'').slice(0,500),price:Number(row.price),status:row.status,active:row.active}:{name:String(row.name).slice(0,120),unit:String(row.unit).slice(0,30),currentStock:Number(row.current_stock),minStock:Number(row.min_stock),averageCost:Number(row.average_cost),category:String(row.categoria??'').slice(0,100)})};
  }else if(context==='orders'){
   const from=new Date(Date.now()-24*60*60*1000).toISOString();
   const {data,error}=await admin.from('orders').select('status,total,subtotal,placed_at,origin').eq('business_unit_id',unit).gte('placed_at',from).order('placed_at',{ascending:false}).limit(1001);
   if(error)throw Error('Não foi possível consultar os pedidos.');
   const rows=(data??[]).slice(0,1000);snapshot={type:'orders',from,to:new Date().toISOString(),limit:1000,limited:(data?.length??0)>1000,count:rows.length,counts:rows.reduce((acc:Record<string,number>,r)=>({...acc,[r.status]:(acc[r.status]??0)+1}),{}),totalExcludingCancelled:rows.filter(r=>r.status!=='cancelled').reduce((sum,r)=>sum+Number(r.total??r.subtotal??0),0),note:'Valores de pedidos não equivalem a pagamentos recebidos.'};
  }
  const page=typeof body.page==='string'?body.page.slice(0,150):'';
  const system=ASSISTANT_RULES+'\nTutoriais disponíveis: '+JSON.stringify(TUTORIALS)+'\nContexto validado pelo servidor: '+JSON.stringify({unitName:business.name,page,snapshot});
  const result=await textCompletion(model.provider,model.model,await decryptAIKey(credential.encrypted_key,credential.iv),system,messages);
  const {error:completeError}=await admin.from('ai_assistant_usage').update({status:'completed',completed_at:new Date().toISOString(),input_tokens:result.inputTokens,output_tokens:result.outputTokens}).eq('id',requestId).eq('business_unit_id',unit);
  if(completeError)throw Error('A resposta foi gerada, mas não foi possível registrar a conclusão.');
  return json({reply:result.text,model:model.id,context,snapshot});
 }catch(e){
  if(reserved&&admin&&requestId)await admin.from('ai_assistant_usage').update({status:'failed',completed_at:new Date().toISOString()}).eq('id',requestId);
  return json({error:e instanceof Error?e.message:'Falha ao conversar com a IA'},503);
 }
});
