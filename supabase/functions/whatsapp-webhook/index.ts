import {createClient} from "https://esm.sh/@supabase/supabase-js@2.99.2";
import {json,hmac,equal,sha256,incomingMessages,botDestination,publicOrigin} from "../_shared/operational.ts";

Deno.serve(async(req:Request)=>{
  const verify=Deno.env.get("WHATSAPP_VERIFY_TOKEN"),secret=Deno.env.get("WHATSAPP_APP_SECRET");
  if(req.method==="GET"){
    const params=new URL(req.url).searchParams;
    if(verify && params.get("hub.mode")==="subscribe" && equal(params.get("hub.verify_token") ?? "",verify) && params.get("hub.challenge"))return new Response(params.get("hub.challenge"),{headers:{"Content-Type":"text/plain"}});
    return json({error:"Verificação inválida"},403);
  }
  if(req.method!=="POST")return json({error:"Método inválido"},405);
  if(!secret)return json({error:"Configuração Meta pendente"},503);
  const raw=await req.text();if(raw.length>1048576)return json({error:"Evento muito grande"},413);
  const signature=req.headers.get("x-hub-signature-256") ?? "";
  if(!/^sha256=[a-f0-9]{64}$/.test(signature) || !equal(signature.slice(7),await hmac(secret,raw)))return json({error:"Assinatura inválida"},403);
  try{
    const payload=JSON.parse(raw);const messages=incomingMessages(payload);
    if(messages.length>100)return json({error:"Lote muito grande"},413);
    const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
    for(const message of messages){
      const {data:integration,error:configError}=await db.from("integrations").select("business_unit_id,config,status").eq("provider","whatsapp").eq("config->>phoneNumberId",message.phoneId).maybeSingle();
      if(configError)throw configError;
      if(!integration?.business_unit_id || !["CONNECTING","CONNECTED"].includes(integration.status))continue;
      const unit=integration.business_unit_id;const config=integration.config;
      const {data:pwa,error:pwaError}=await db.from("integrations").select("config,status").eq("provider","own-pwa").eq("business_unit_id",unit).maybeSingle();
      if(pwaError)throw pwaError;
      const token=crypto.randomUUID()+crypto.randomUUID();const tokenHash=await sha256(token);
      const orderUrl=pwa?.config?.enabled && pwa.status!=="DISCONNECTED" ? `${publicOrigin(pwa.config.publicOrigin)}/pedir/${unit}?origem=whatsapp&acesso=${token}` : null;
      const {data:event,error:ingestError}=await db.rpc("ingest_whatsapp_message",{p_unit:unit,p_id:message.id,p_phone:message.phone,p_name:message.name,p_text:message.text,p_type:message.type,p_token_hash:orderUrl ? tokenHash : null,p_order_url:orderUrl});
      if(ingestError)throw ingestError;
      const {data:claimed,error:claimError}=await db.rpc("claim_whatsapp_reply",{p_id:event.id});if(claimError)throw claimError;if(!claimed)continue;
      let sent=false;let failure="configuration_missing";
      try{
        const external=config.botMode==="external" && !claimed.reply;
        let response:Response;
        if(external){
          const destination=Deno.env.get("BOT_ATENDIMENTO_WEBHOOK"),botSecret=Deno.env.get("BOT_WEBHOOK_SECRET");
          if(!destination || !botSecret || botDestination(destination)!==config.botWebhookUrl)throw Error("Bot pendente");
          const body=JSON.stringify(claimed.bot_payload);
          response=await fetch(destination,{method:"POST",headers:{"Content-Type":"application/json","X-Pop9-Signature":`sha256=${await hmac(botSecret,body)}`,"X-Pop9-Event-Id":claimed.id},body,redirect:"error",signal:AbortSignal.timeout(10000)});
        }else{
          const access=Deno.env.get("WHATSAPP_ACCESS_TOKEN");if(!access || !/^v\d{2,3}\.0$/.test(config.graphVersion))throw Error("Meta pendente");
          response=await fetch(`https://graph.facebook.com/${config.graphVersion}/${message.phoneId}/messages`,{method:"POST",headers:{Authorization:`Bearer ${access}`,"Content-Type":"application/json"},body:JSON.stringify({messaging_product:"whatsapp",to:message.phone,type:"text",text:{body:claimed.reply}}),signal:AbortSignal.timeout(10000)});
        }
        sent=response.ok;failure=`http_${response.status}`;
      }catch{failure="send_uncertain";}
      const {error:updateError}=await db.from("whatsapp_events").update({delivery_state:sent ? "sent" : "failed",lease_until:null,error_code:sent ? null : failure}).eq("id",claimed.id);
      if(updateError)throw updateError;
    }
    return json({received:true});
  }catch{console.error("WhatsApp event processing failed; Meta may retry");return json({error:"Falha ao registrar evento"},500);}
});
