import {createClient} from "https://esm.sh/@supabase/supabase-js@2.99.2";
import {json,uuid,publicOrigin,botDestination} from "../_shared/operational.ts";

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return json({});
  if(req.method!=="POST")return json({error:"Método inválido"},405);
  try{
    const body=await req.json();const unit=body.business_unit_id;
    if(!uuid(unit))return json({error:"Unidade inválida"},400);
    const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
    const bearer=req.headers.get("Authorization")?.replace(/^Bearer /,"");
    if(!bearer)return json({error:"Não autorizado"},401);
    const {data:auth,error:authError}=await db.auth.getUser(bearer);
    if(authError || !auth.user)return json({error:"Não autorizado"},401);
    const {data:roles,error:rolesError}=await db.from("user_roles").select("business_unit_id").eq("user_id",auth.user.id).eq("role","admin");
    if(rolesError || !roles?.some(r=>r.business_unit_id===unit || r.business_unit_id===null))return json({error:"Apenas administrador desta unidade"},403);
    const {data:active}=await db.from("business_units").select("id").eq("id",unit).eq("active",true).maybeSingle();
    if(!active)return json({error:"Unidade inativa"},400);
    const secretNames=["WHATSAPP_VERIFY_TOKEN","WHATSAPP_APP_SECRET","WHATSAPP_ACCESS_TOKEN","BOT_ATENDIMENTO_WEBHOOK","BOT_WEBHOOK_SECRET"];
    const {data:capabilities,error:capabilitiesError}=await db.rpc("operational_readiness");if(capabilitiesError)throw capabilitiesError;
    const readiness=Object.fromEntries(secretNames.map(name=>[name,Boolean(Deno.env.get(name))]));
    readiness.CASHIER_WORKFLOW=capabilities?.cashierWorkflow===true;
    if(body.action==="health"){
      const {data,error}=await db.from("integrations").select("provider,status,config,last_sync_at,error_message").eq("business_unit_id",unit);
      if(error)throw error;return json({readiness,integrations:data,webhookUrl:`${Deno.env.get("SUPABASE_URL")}/functions/v1/whatsapp-webhook`});
    }
    const provider=body.provider;
    const allowedProviders=["whatsapp","own-pwa","ifood","99food","rappi","aiqfome","instagram","telegram","goomer","mercadopago","stone","cielo","rede","pagbank","asaas","pix","omie","bling","contaazul","focusnfe","nuvemfiscal","shopify","woocommerce","mercadolivre","shopee","webhook","rest-api","graphql","http"];
    if(!allowedProviders.includes(provider))return json({error:"Provedor não reconhecido"},400);
    if(body.action==="disconnect"){
      const {error}=await db.from("integrations").update({status:"DISCONNECTED",connected_at:null,updated_at:new Date().toISOString()}).eq("provider",provider).eq("business_unit_id",unit);
      if(error)throw error;return json({success:true});
    }
    if(!["save","connect"].includes(body.action))return json({error:"Ação inválida"},400);
    const input=body.config ?? {};let config:Record<string,unknown>;let status="NOT_CONNECTED";let issue:string|null=null;
    if(provider==="own-pwa"){
      const origin=publicOrigin(input.publicOrigin);config={publicOrigin:origin,enabled:input.enabled===true,pickupOnly:true};
      if(config.enabled){
        const {data:whatsapp}=await db.from("integrations").select("status,config").eq("business_unit_id",unit).eq("provider","whatsapp").maybeSingle();
        if(!readiness.CASHIER_WORKFLOW){config.enabled=false;issue="PWA pré-configurado. Publique o fluxo de encerramento com senha do Caixa antes de receber pedidos.";}
        else if(!["CONNECTING","CONNECTED"].includes(whatsapp?.status) || !whatsapp?.config?.businessPhone || !secretNames.slice(0,3).every(name=>readiness[name])){config.enabled=false;issue="PWA pré-configurado. Valide o WhatsApp na Meta antes de receber pedidos.";}
      }
      status=config.enabled ? "CONNECTED" : "NOT_CONNECTED";
    }else if(provider!=="whatsapp"){
      if(body.action==="connect")return json({error:"Conector ainda não implementado; salve uma pré-configuração"},409);
      config={};
      for(const key of ["pixKey","storeUrl","webhookUrl"]){
        if(input[key]===undefined)continue;
        if(typeof input[key]!=="string" || input[key].length>500)throw Error("Configuração inválida");
        config[key]=key.endsWith("Url") && input[key] ? botDestination(input[key]) : input[key];
      }
      issue="Pré-configuração salva. A ativação depende do conector e das credenciais deste serviço.";
    }else{
      const phoneId=String(input.phoneNumberId ?? "").trim();const phone=String(input.businessPhone ?? "").replace(/\D/g,"");
      if(phoneId && !/^\d{5,30}$/.test(phoneId))throw Error("Phone Number ID inválido");
      if(phone && !/^\d{8,15}$/.test(phone))throw Error("Número comercial inválido; inclua código do país");
      const version=String(input.graphVersion ?? "");if(version && !/^v\d{2,3}\.0$/.test(version))throw Error("Versão Graph inválida; confirme a versão do seu aplicativo Meta");
      const botMode=["off","welcome","crm","external"].includes(input.botMode) ? input.botMode : "welcome";
      const botUrl=input.botWebhookUrl ? botDestination(String(input.botWebhookUrl)) : "";
      config={phoneNumberId:phoneId,businessPhone:phone,graphVersion:version,botMode,botWebhookUrl:botUrl,welcomeMessage:String(input.welcomeMessage ?? "Olá! Envie PEDIR para acessar nosso cardápio.").slice(0,1500)};
      if(body.action==="connect"){
        const missing=secretNames.slice(0,3).filter(name=>!readiness[name]);
        if(missing.length || !phoneId || !version)issue="Faltam credenciais Meta, Phone Number ID ou versão Graph. Configuração salva; conexão não ativada.";
        else if(botMode==="external" && (!readiness.BOT_WEBHOOK_SECRET || !botUrl || botUrl!==Deno.env.get("BOT_ATENDIMENTO_WEBHOOK")))issue="Configure o endereço do bot e BOT_WEBHOOK_SECRET no backend antes de ativá-lo.";
        else{
          const response=await fetch(`https://graph.facebook.com/${version}/${phoneId}?fields=id,display_phone_number,verified_name`,{headers:{Authorization:`Bearer ${Deno.env.get("WHATSAPP_ACCESS_TOKEN")}`},signal:AbortSignal.timeout(10000)});
          if(!response.ok){status="ERROR";issue="A Meta recusou a validação. Confira token, permissões e número.";}
          else{const meta=await response.json();if(meta.id!==phoneId)throw Error("A Meta retornou outro número");status="CONNECTING";config.metaValidatedAt=new Date().toISOString();}
        }
      }
    }
    const {error}=await db.from("integrations").upsert({business_unit_id:unit,provider,config,status,error_message:issue,connected_at:null,updated_at:new Date().toISOString()},{onConflict:"business_unit_id,provider"});
    if(error)throw error;return json({success:!issue || (provider!=="whatsapp" && body.action==="save"),message:issue ?? (status==="CONNECTING" ? "Meta validada. Assine o evento messages no aplicativo e receba uma mensagem para confirmar o webhook." : "Configuração salva."),status,readiness});
  }catch(error){return json({error:error instanceof Error ? error.message : "Falha ao configurar integração"},400);}
});
