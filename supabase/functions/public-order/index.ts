import {createClient} from "https://esm.sh/@supabase/supabase-js@2.99.2";
import {json,uuid,sha256,publicOrigin} from "../_shared/operational.ts";
import {sanitizeBrand,brandAssetPrefix,EMPTY_BRAND} from "../_shared/brand.ts";
import {loadTwilio} from "../_shared/twilio.ts";

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return json({});
  if(!["POST","GET"].includes(req.method))return json({error:"Método inválido"},405);
  try{
    const raw=req.method==="GET" ? JSON.stringify({action:new URL(req.url).searchParams.get("action"),business_unit_id:new URL(req.url).searchParams.get("unit")}) : await req.text();if(raw.length>20000)return json({error:"Pedido muito grande"},413);
    const body=JSON.parse(raw);const unit=body.business_unit_id;
    if(!uuid(unit))return json({error:"Loja inválida"},400);
    const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
    const {data:settings,error:settingsError}=await db.from("integrations").select("config,status").eq("provider","own-pwa").eq("business_unit_id",unit).maybeSingle();
    const {data:store}=await db.from("business_units").select("name,disabled_modules").eq("id",unit).eq("active",true).maybeSingle();
    if(settingsError)throw settingsError;
    if(!store || (store.disabled_modules ?? []).includes("pwa_publica") || !settings?.config?.enabled || settings.status==="DISCONNECTED")return json({error:"Pedidos online indisponíveis"},404);
    if(body.action==="manifest"){
      const origin=publicOrigin(settings.config.publicOrigin);const path=`/pedir/${unit}`;
      return new Response(JSON.stringify({id:path,name:`${store.name} — Pedidos`,short_name:"Pedidos",description:"Cardápio e pedidos para retirada",start_url:`${origin}${path}`,scope:`${origin}${path}`,display:"standalone",theme_color:"#0f172a",background_color:"#0f172a",icons:[{src:`${origin}/pwa-icon-192.png`,sizes:"192x192",type:"image/png"},{src:`${origin}/pwa-icon-512.png`,sizes:"512x512",type:"image/png",purpose:"any maskable"}]}),{headers:{"Content-Type":"application/manifest+json","Access-Control-Allow-Origin":"*","Cache-Control":"no-store"}});
    }
    if(req.method!=="POST")return json({error:"Método inválido"},405);
    if(body.action==="menu"){
      const {data:period,error:periodError}=await db.from("operation_periods").select("id").eq("business_unit_id",unit).is("closed_at",null).maybeSingle();
      if(periodError)throw periodError;
      const {data:items,error}=await db.from("menu_items").select("id,name,description,price,image_url,category").eq("business_unit_id",unit).eq("active",true).eq("status","published").order("name");
      if(error)throw error;
      const itemIds=(items ?? []).map((item:{id:string})=>item.id);
      const [{data:ingredients,error:ingredientsError},{data:variants,error:variantsError}]=await Promise.all([
        db.from("menu_item_ingredients").select("id,menu_item_id,name,removable,extra_price,sort_order").in("menu_item_id",itemIds).order("sort_order"),
        db.from("menu_item_variants").select("id,menu_item_id,name,sort_order").in("menu_item_id",itemIds).order("sort_order"),
      ]);
      if(ingredientsError)throw ingredientsError;
      if(variantsError)throw variantsError;
      const ingredientsByItem=new Map<string,unknown[]>();for(const ingredient of ingredients ?? []){const key=ingredient.menu_item_id;ingredientsByItem.set(key,[...(ingredientsByItem.get(key) ?? []),{id:ingredient.id,name:ingredient.name,removable:Boolean(ingredient.removable),extra_price:Number(ingredient.extra_price ?? 0)}]);}
      const variantsByItem=new Map<string,unknown[]>();for(const variant of variants ?? []){const key=variant.menu_item_id;variantsByItem.set(key,[...(variantsByItem.get(key) ?? []),{id:variant.id,name:variant.name}]);}
      const publicItems=(items ?? []).map((item:{id:string})=>({...item,ingredients:ingredientsByItem.get(item.id) ?? [],variants:variantsByItem.get(item.id) ?? []}));
      const {data:whatsapp}=await db.from("integrations").select("config").eq("provider","whatsapp").eq("business_unit_id",unit).maybeSingle();
      // Código por SMS só quando o Twilio está conectado nesta unidade (Admin › Conexões).
      const {data:sms}=await db.from("integrations").select("status,config").eq("provider","twilio").eq("business_unit_id",unit).maybeSingle();
      // Marca é opcional: sem a tabela ou sem registro, o cardápio segue com o visual padrão.
      const {data:brandRow,error:brandError}=await db.from("brand_settings").select("*").eq("business_unit_id",unit).maybeSingle();
      const brand=brandError ? EMPTY_BRAND : sanitizeBrand(brandRow,brandAssetPrefix(Deno.env.get("SUPABASE_URL") ?? "",unit));
      // Combos prontos são opcionais: sem a migration, o cardápio segue só com itens avulsos.
      const {data:combos,error:combosError}=await db.rpc("list_pwa_ready_combos",{p_unit:unit});
      // Sem a migration (função ausente) o cardápio segue sem combos; outro erro é registrado para a operação.
      if(combosError && (combosError as {code?:string}).code!=="PGRST202")console.error("list_pwa_ready_combos",combosError);
      const smsVerification=sms?.status==="CONNECTED" && sms?.config?.enabled!==false && Boolean(await loadTwilio(Deno.env,db,unit));
      return json({name:store.name,items:publicItems,combos:combosError ? [] : combos ?? [],businessPhone:whatsapp?.config?.businessPhone ?? "",pickupOnly:true,brand,acceptingOrders:Boolean(period),smsVerification});
    }
    if(body.action==="status"){
      if(typeof body.access_token!=="string" || !/^[a-f0-9-]{72}$/.test(body.access_token))return json({error:"Acesso inválido"},401);
      const {data,error}=await db.rpc("get_pwa_order_status",{p_unit:unit,p_token_hash:await sha256(body.access_token)});
      if(error)return json({error:error.message?.includes("ainda não") ? "Pedido ainda não registrado" : "Não foi possível consultar o pedido"},404);
      return json(data);
    }
    if(body.action!=="submit")return json({error:"Ação inválida"},400);
    if(typeof body.access_token!=="string" || !/^[a-f0-9-]{72}$/.test(body.access_token))return json({error:"Valide seu número enviando PEDIR no WhatsApp da loja"},401);
    const {data,error}=await db.rpc("submit_pwa_order",{p_unit:unit,p_token_hash:await sha256(body.access_token),p_items:body.items,p_note:typeof body.note==="string" ? body.note : ""});
    if(error)return json({error:error.message?.includes("Operação fechada") ? "A loja está fechada para novos pedidos. Tente novamente quando abrir." : error.code==="P0001" ? error.message : "Não foi possível registrar o pedido"},409);
    return json(data);
  }catch(error){
    // JSON malformado é erro do cliente; qualquer outra falha (banco, rede, bug) é nossa e não deve induzir retry como se fosse payload ruim.
    if(error instanceof SyntaxError)return json({error:"Pedido inválido"},400);
    const requestId=crypto.randomUUID();
    console.error("public-order",requestId,(error as {code?:string})?.code ?? (error as Error)?.name);
    return json({error:"Não foi possível processar a solicitação",request_id:requestId},500);
  }
});
