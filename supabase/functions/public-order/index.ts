import {createClient} from "https://esm.sh/@supabase/supabase-js@2.99.2";
import {json,uuid,sha256,publicOrigin} from "../_shared/operational.ts";

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return json({});
  if(!["POST","GET"].includes(req.method))return json({error:"Método inválido"},405);
  try{
    const raw=req.method==="GET" ? JSON.stringify({action:new URL(req.url).searchParams.get("action"),business_unit_id:new URL(req.url).searchParams.get("unit")}) : await req.text();if(raw.length>20000)return json({error:"Pedido muito grande"},413);
    const body=JSON.parse(raw);const unit=body.business_unit_id;
    if(!uuid(unit))return json({error:"Loja inválida"},400);
    const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
    const {data:settings,error:settingsError}=await db.from("integrations").select("config,status").eq("provider","own-pwa").eq("business_unit_id",unit).maybeSingle();
    const {data:store}=await db.from("business_units").select("name").eq("id",unit).eq("active",true).maybeSingle();
    if(settingsError)throw settingsError;
    if(!store || !settings?.config?.enabled || settings.status==="DISCONNECTED")return json({error:"Pedidos online indisponíveis"},404);
    if(body.action==="manifest"){
      const origin=publicOrigin(settings.config.publicOrigin);const path=`/pedir/${unit}`;
      return new Response(JSON.stringify({id:path,name:`${store.name} — Pedidos`,short_name:"Pedidos",description:"Cardápio e pedidos para retirada",start_url:`${origin}${path}`,scope:`${origin}${path}`,display:"standalone",theme_color:"#0f172a",background_color:"#0f172a",icons:[{src:`${origin}/pwa-icon-192.png`,sizes:"192x192",type:"image/png"},{src:`${origin}/pwa-icon-512.png`,sizes:"512x512",type:"image/png",purpose:"any maskable"}]}),{headers:{"Content-Type":"application/manifest+json","Access-Control-Allow-Origin":"*","Cache-Control":"no-store"}});
    }
    if(req.method!=="POST")return json({error:"Método inválido"},405);
    if(body.action==="menu"){
      const {data:items,error}=await db.from("menu_items").select("id,name,description,price,image_url,category").eq("business_unit_id",unit).eq("active",true).eq("status","published").order("name");
      if(error)throw error;
      const {data:whatsapp}=await db.from("integrations").select("config").eq("provider","whatsapp").eq("business_unit_id",unit).maybeSingle();
      return json({name:store.name,items,businessPhone:whatsapp?.config?.businessPhone ?? "",pickupOnly:true});
    }
    if(body.action!=="submit")return json({error:"Ação inválida"},400);
    if(typeof body.access_token!=="string" || !/^[a-f0-9-]{72}$/.test(body.access_token))return json({error:"Valide seu número enviando PEDIR no WhatsApp da loja"},401);
    const {data,error}=await db.rpc("submit_pwa_order",{p_unit:unit,p_token_hash:await sha256(body.access_token),p_items:body.items,p_note:typeof body.note==="string" ? body.note : ""});
    if(error)return json({error:error.code==="P0001" ? error.message : "Não foi possível registrar o pedido"},409);
    return json(data);
  }catch{return json({error:"Não foi possível processar a solicitação"},400);}
});
