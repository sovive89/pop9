import {useEffect,useRef,useState,type CSSProperties} from "react";
import {useParams} from "react-router-dom";
import {Button} from "@/components/ui/button";
import {formatCurrency} from "@/utils/orders";
import {whatsappLink} from "@/utils/operationalLinks";
import {SOCIALS} from "@/lib/brandSocial";
import {brandCssVars,type Brand} from "../../supabase/functions/_shared/brand";
import CustomerAccess from "@/components/pwa/CustomerAccess";
type Item={id:string;name:string;description:string|null;price:number;image_url:string|null;category:string};
type ComboPart={menu_item_id:string;name:string;label:string;price:number};
type ReadyCombo={id:string;name:string;description:string|null;price:number;list_price:number;components:ComboPart[]};
type Store={name:string;items:Item[];combos?:ReadyCombo[];businessPhone:string;brand?:Brand;acceptingOrders?:boolean};
// Chave do carrinho para combos; itens avulsos usam o id do item.
const itemKey=(id:string)=>`item:${id}`;
const comboKey=(id:string)=>`combo:${id}`;
type Confirmation={orderId:string;pickupNumber:number;total:number};
async function publicOrderApi(body:Record<string,unknown>){
  const base=import.meta.env.VITE_SUPABASE_URL;
  if(!base)throw Error("O pedido online ainda não foi configurado");
  const response=await fetch(`${base}/functions/v1/public-order`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),cache:"no-store",credentials:"omit",referrerPolicy:"no-referrer"});
  const data=await response.json();if(!response.ok || data?.error)throw Error(data?.error ?? "Não foi possível acessar a loja");return data;
}
export default function PublicOrder(){
  const {unit}=useParams();const scope=unit ?? "";const current=useRef(scope);current.current=scope;
  const [loaded,setLoaded]=useState<{scope:string;store:Store|null;error:string;loading:boolean}>({scope,store:null,error:"",loading:true});
  const [cartState,setCart]=useState<{scope:string;cart:Record<string,number>}>({scope,cart:{}});
  const [note,setNote]=useState("");const [busy,setBusy]=useState(false);const [confirmation,setConfirmation]=useState<{scope:string;data:Confirmation}|null>(null);
  const [submitError,setSubmitError]=useState("");const token=useRef<{scope:string;value:string}>({scope:"",value:""});
  const [attempt,setAttempt]=useState(0);
  // Fluxo por SMS: 1) nome completo + celular 2) código 3) cardápio. Re-renderiza quando o acesso chega.
  const [,setVerifiedAt]=useState(0);
  useEffect(()=>{
    let cancelled=false;setNote("");setBusy(false);setSubmitError("");
    const params=new URLSearchParams(window.location.search);const value=params.get("acesso");
    try{if(value && /^[a-f0-9-]{72}$/.test(value))sessionStorage.setItem(`pop9:order-access:${scope}`,value);token.current={scope,value:sessionStorage.getItem(`pop9:order-access:${scope}`) ?? ""};}catch{token.current={scope,value:value ?? ""};}
    if(params.has("acesso")){params.delete("acesso");window.history.replaceState(null,"",`${window.location.pathname}${params.size ? `?${params}` : ""}`);}
    setLoaded({scope,store:null,error:"",loading:true});
    void publicOrderApi({action:"menu",business_unit_id:scope}).then(store=>{if(!cancelled)setLoaded({scope,store,error:"",loading:false});}).catch(error=>{if(!cancelled)setLoaded({scope,store:null,error:error.message,loading:false});});
    let manifest=document.querySelector<HTMLLinkElement>('link[rel="manifest"]');const original=manifest?.href;const created=!manifest;
    if(!manifest){manifest=document.createElement("link");manifest.rel="manifest";document.head.appendChild(manifest);}
    if(manifest && import.meta.env.VITE_SUPABASE_URL)manifest.href=`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-order?action=manifest&unit=${encodeURIComponent(scope)}`;
    return ()=>{cancelled=true;if(manifest && created)manifest.remove();else if(manifest && original)manifest.href=original;};
  },[scope,attempt]);
  const store=loaded.scope===scope ? loaded.store : null;const cart=cartState.scope===scope ? cartState.cart : {};
  // Só combos prontos no formato novo (components); o formato antigo do servidor (slots) não é oferecido por aqui.
  const combos=(store?.combos ?? []).filter(combo=>Array.isArray(combo?.components) && Number.isFinite(Number(combo.price)));
  const total=(store?.items.reduce((sum,item)=>sum+Number(item.price)*(cart[itemKey(item.id)] ?? 0),0) ?? 0)+combos.reduce((sum,combo)=>sum+Number(combo.price)*(cart[comboKey(combo.id)] ?? 0),0);
  const count=Object.values(cart).reduce((a,b)=>a+b,0);
  const change=(id:string,amount:number)=>setCart(prev=>{const previous=prev.scope===scope ? prev.cart : {};return {scope,cart:{...previous,[id]:Math.max(0,Math.min(20,(previous[id] ?? 0)+amount))}};});
  const submit=async()=>{
    if(busy || !count || store?.acceptingOrders===false || token.current.scope!==scope)return;setBusy(true);setSubmitError("");const requested=scope;
    try{const data=await publicOrderApi({action:"submit",business_unit_id:scope,access_token:token.current.value,items:Object.entries(cart).filter(([,qty])=>qty>0).map(([key,quantity])=>key.startsWith("combo:") ? {combo_id:key.slice("combo:".length),quantity} : {id:key.slice("item:".length),quantity}),note});if(current.current===requested){setConfirmation({scope:requested,data});setCart({scope:requested,cart:{}});}}
    catch(error){if(current.current===requested)setSubmitError(error instanceof Error ? error.message : "Falha de conexão. Tente novamente; seu pedido não será duplicado.");}
    finally{if(current.current===requested)setBusy(false);}
  };
  const whatsapp=whatsappLink(store?.businessPhone ?? "");
  const smsEnabled=Boolean((store as {smsVerification?:boolean}|null)?.smsVerification);
  const onVerified=(value:string)=>{try{sessionStorage.setItem(`pop9:order-access:${scope}`,value);}catch{/* sem sessionStorage: segue só na memória */}token.current={scope,value};setVerifiedAt(Date.now());};
  const restart=()=>{try{sessionStorage.removeItem(`pop9:order-access:${scope}`);}catch{/* idem */}token.current={scope,value:""};setConfirmation(null);setSubmitError("");setVerifiedAt(Date.now());};
  // Com SMS ativo, o cardápio só aparece depois de identificar o cliente e confirmar o código.
  const gate=store && smsEnabled && store.acceptingOrders!==false && !token.current.value
    ? <CustomerAccess unit={scope} whatsappUrl={whatsapp} onVerified={onVerified}/> : null;
  // Marca da loja: só cores e imagens validadas, aplicadas apenas neste contêiner.
  // A função public-order já validou cada campo com a URL do Storage do servidor
  // (que pode ser um domínio próprio diferente de VITE_SUPABASE_URL).
  const brand=store?.brand ?? null;
  const style={...(brand ? brandCssVars(brand) : {}),...(brand?.background_url ? {backgroundImage:`url("${brand.background_url}")`,backgroundSize:"cover",backgroundPosition:"center",backgroundAttachment:"fixed"} : {})} as CSSProperties;
  return <div style={style} className="min-h-screen bg-background text-foreground"><main className="mx-auto min-h-screen max-w-3xl space-y-5 p-4 pb-12">
    <header className="space-y-2 py-4">{brand?.logo_url && <img src={brand.logo_url} alt={store?.name ?? "Logo"} referrerPolicy="no-referrer" className="h-16 max-w-[12rem] object-contain"/>}<h1 className={`text-2xl font-bold ${brand?.background_url ? "inline-block rounded-lg bg-card/90 px-3 py-1" : ""}`}>{store?.name ?? "Pedidos próprios"}</h1>{brand && SOCIALS.some(({key})=>brand[key]) && <nav aria-label="Redes sociais" className="flex flex-wrap gap-2">{SOCIALS.filter(({key})=>brand[key]).map(({key,label,icon:Icon})=><a key={key} href={brand[key]!} target="_blank" rel="noopener noreferrer" aria-label={label} title={label} className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-card text-primary"><Icon className="h-4 w-4" aria-hidden/></a>)}</nav>}<p className="text-sm text-muted-foreground">Escolha seus itens para retirada. Pagamento no estabelecimento.</p></header>
    {brand && (brand.about_text || brand.address || brand.opening_hours) && <section aria-label="Sobre a loja" className="space-y-2 rounded-xl border bg-card p-4 text-sm">{brand.about_text && <p className="whitespace-pre-line">{brand.about_text}</p>}{brand.address && <p className="whitespace-pre-line"><strong>Endereço:</strong> {brand.address}</p>}{brand.opening_hours && <p className="whitespace-pre-line"><strong>Horário:</strong> {brand.opening_hours}</p>}</section>}
    {(loaded.scope!==scope || loaded.loading) && <p role="status">Carregando cardápio...</p>}
    {loaded.scope===scope && loaded.error && <div role="alert"><p>{loaded.error}</p><Button onClick={()=>setAttempt(v=>v+1)}>Tentar novamente</Button></div>}
    {confirmation?.scope===scope ? <section className="space-y-3 rounded-xl border bg-card p-5"><h2 className="text-xl font-semibold">Pedido recebido — retirada #{confirmation.data.pickupNumber}</h2><p>Total: {formatCurrency(confirmation.data.total)}. O atendimento confirmará o preparo e a retirada.</p>{smsEnabled ? <Button variant="outline" onClick={restart}>Fazer outro pedido</Button> : <p className="text-sm text-muted-foreground">Este link já foi usado. Para outro pedido, envie PEDIR novamente no WhatsApp.</p>}{whatsapp && <a className="inline-block rounded-md bg-primary p-3 text-primary-foreground" href={whatsapp} rel="noreferrer">Falar com a loja</a>}</section> : store && <>
      {store.acceptingOrders===false && <section role="status" className="space-y-2 rounded-xl border bg-card p-4"><h2 className="font-semibold">Loja fechada para novos pedidos</h2><p className="text-sm text-muted-foreground">Você pode consultar o cardápio. Volte quando a loja abrir para fazer seu pedido.</p><Button variant="outline" onClick={()=>setAttempt(value=>value+1)}>Atualizar disponibilidade</Button></section>}
      {store.acceptingOrders!==false && !smsEnabled && !token.current.value && <section className="space-y-2 rounded-xl border bg-card p-4"><p>Para finalizar o pedido, confirme seu WhatsApp enviando <strong>PEDIR</strong>. Você receberá um link pessoal.</p>{whatsapp ? <a className="inline-block rounded-md bg-primary p-3 text-primary-foreground" href={whatsapp} rel="noreferrer">Validar WhatsApp e pedir</a> : <p className="text-sm text-muted-foreground">O WhatsApp da loja ainda não está disponível. Fale com o atendimento.</p>}</section>}
      {gate ?? <>
      {combos.length>0 && <section aria-label="Combos" className="space-y-3"><h2 className="text-lg font-semibold">Combos</h2>{combos.map(combo=>{const key=comboKey(combo.id);const saving=Number(combo.list_price)-Number(combo.price);return <article key={combo.id} className="space-y-2 rounded-xl border bg-card p-3"><h3 className="font-semibold">{combo.name}</h3>{combo.description && <p className="text-sm text-muted-foreground">{combo.description}</p>}<p className="text-sm text-muted-foreground">{combo.components.map(part=>part.name).join(" + ")}</p><p>{formatCurrency(Number(combo.price))}{saving>0.004 && <span className="ml-2 text-sm text-muted-foreground"><s>{formatCurrency(Number(combo.list_price))}</s> · economize {formatCurrency(saving)}</span>}</p><div className="flex items-center gap-3"><Button size="sm" variant="outline" disabled={busy || !cart[key]} aria-label={`Remover ${combo.name}`} onClick={()=>change(key,-1)}>−</Button><span aria-label={`Quantidade de ${combo.name}`}>{cart[key] ?? 0}</span><Button size="sm" disabled={busy || (cart[key] ?? 0)>=20} aria-label={`Adicionar ${combo.name}`} onClick={()=>change(key,1)}>+</Button></div></article>;})}</section>}
      <section aria-label="Cardápio" className="space-y-3">{store.items.map(item=><article key={item.id} className="flex gap-3 rounded-xl border bg-card p-3">{item.image_url && /^https:\/\//.test(item.image_url) && <img src={item.image_url} alt={item.name} referrerPolicy="no-referrer" loading="lazy" className="h-24 w-24 rounded-lg object-cover"/>}<div className="min-w-0 flex-1 space-y-2"><h2 className="font-semibold">{item.name}</h2><p className="text-sm text-muted-foreground">{item.description}</p><p>{formatCurrency(Number(item.price))}</p><div className="flex items-center gap-3"><Button size="sm" variant="outline" disabled={busy || !cart[itemKey(item.id)]} aria-label={`Remover ${item.name}`} onClick={()=>change(itemKey(item.id),-1)}>−</Button><span aria-label={`Quantidade de ${item.name}`}>{cart[itemKey(item.id)] ?? 0}</span><Button size="sm" disabled={busy || (cart[itemKey(item.id)] ?? 0)>=20} aria-label={`Adicionar ${item.name}`} onClick={()=>change(itemKey(item.id),1)}>+</Button></div></div></article>)}{!store.items.length && <p>Nenhum item disponível agora.</p>}</section>
      <section className="space-y-3 rounded-xl border bg-card p-4"><h2 className="font-semibold">Seu pedido: {count} item(ns) · {formatCurrency(total)}</h2><label className="block space-y-1 text-sm">Observação<textarea disabled={busy} className="w-full rounded-md border bg-background p-2" maxLength={500} value={note} onChange={e=>setNote(e.target.value)} placeholder="Orientação para o preparo"/></label><p className="text-xs text-muted-foreground">Seu nome e WhatsApp serão usados para identificar o pedido e organizar a retirada. Preferências e campanhas dependem de autorização separada no WhatsApp.</p>{submitError && <p role="alert" className="text-destructive">{submitError}</p>}<Button className="w-full" disabled={busy || !count || !token.current.value || store.acceptingOrders===false} onClick={()=>void submit()}>{busy ? "Enviando pedido..." : "Confirmar pedido para retirada"}</Button></section>
      </>}
    </>}
  </main></div>;
}
