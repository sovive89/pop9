import {createClient} from "https://esm.sh/@supabase/supabase-js@2.99.2";
import {json,uuid,sha256} from "../_shared/operational.ts";
import {normalizeBrPhone,loadTwilio,startVerification,checkVerification,fullName} from "../_shared/twilio.ts";

// Acesso do cliente ao PWA de pedidos:
//  start → nome completo + celular, envia o código por SMS (Twilio Verify)
//  check → confere o código, cria/atualiza o cliente no CRM e emite o acesso de uso único (60 min)
Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return json({});
  if(req.method!=="POST")return json({error:"Método inválido"},405);
  try{
    const raw=await req.text();if(raw.length>4000)return json({error:"Requisição muito grande"},413);
    const body=JSON.parse(raw);const unit=body.business_unit_id;
    if(!uuid(unit))return json({error:"Loja inválida"},400);
    const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
    const {data:settings}=await db.from("integrations").select("config,status").eq("provider","own-pwa").eq("business_unit_id",unit).maybeSingle();
    if(!settings?.config?.enabled || settings.status==="DISCONNECTED")return json({error:"Pedidos online indisponíveis"},404);
    const {data:sms}=await db.from("integrations").select("status,config").eq("provider","twilio").eq("business_unit_id",unit).maybeSingle();
    const twilio=sms?.status==="CONNECTED" && sms?.config?.enabled!==false ? await loadTwilio(Deno.env,db,unit) : null;
    if(!twilio)return json({error:"Verificação por SMS indisponível. Peça pelo WhatsApp da loja."},503);
    const name=fullName(body.name);if(!name)return json({error:"Informe nome e sobrenome"},400);
    const phone=normalizeBrPhone(body.phone);if(!phone)return json({error:"Informe um celular válido com DDD"},400);
    if(body.action==="start"){
      const {error}=await db.rpc("register_pwa_sms_send",{p_unit:unit,p_phone:phone});
      if(error)return json({error:error.code==="P0001" ? error.message : "Tente novamente em instantes"},429);
      if(!await startVerification(twilio,phone))return json({error:"Não foi possível enviar o código. Confira o número."},502);
      return json({sent:true});
    }
    if(body.action==="check"){
      if(typeof body.code!=="string" || !/^\d{4,10}$/.test(body.code))return json({error:"Código inválido"},400);
      if(!await checkVerification(twilio,phone,body.code))return json({error:"Código incorreto ou expirado"},401);
      const token=crypto.randomUUID()+crypto.randomUUID();
      const {data,error}=await db.rpc("issue_pwa_sms_access",{p_unit:unit,p_phone:phone,p_token_hash:await sha256(token),p_name:name,
        p_email:typeof body.email==="string" ? body.email : "",p_bairro:typeof body.bairro==="string" ? body.bairro : "",p_marketing:body.marketing===true});
      if(error)return json({error:error.code==="P0001" ? error.message : "Não foi possível liberar o pedido"},409);
      return json({access_token:token,profile:data});
    }
    return json({error:"Ação inválida"},400);
  }catch{return json({error:"Não foi possível processar a solicitação"},400);}
});
