import {useEffect,useRef,useState} from "react";
import {useParams} from "react-router-dom";
import {Button} from "@/components/ui/button";
import {formatCurrency} from "@/utils/orders";
import {whatsappLink} from "@/utils/operationalLinks";
type Item={id:string;name:string;description:string|null;price:number;image_url:string|null;category:string};
type Store={name:string;items:Item[];businessPhone:string};
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
  const total=store?.items.reduce((sum,item)=>sum+Number(item.price)*(cart[item.id] ?? 0),0) ?? 0;
  const count=Object.values(cart).reduce((a,b)=>a+b,0);
  const change=(id:string,amount:number)=>setCart(prev=>{const previous=prev.scope===scope ? prev.cart : {};return {scope,cart:{...previous,[id]:Math.max(0,Math.min(20,(previous[id] ?? 0)+amount))}};});
  const submit=async()=>{
    if(busy || !count || token.current.scope!==scope)return;setBusy(true);setSubmitError("");const requested=scope;
    try{const data=await publicOrderApi({action:"submit",business_unit_id:scope,access_token:token.current.value,items:Object.entries(cart).filter(([,qty])=>qty>0).map(([id,quantity])=>({id,quantity})),note});if(current.current===requested){setConfirmation({scope:requested,data});setCart({scope:requested,cart:{}});}}
    catch(error){if(current.current===requested)setSubmitError(error instanceof Error ? error.message : "Falha de conexão. Tente novamente; seu pedido não será duplicado.");}
    finally{if(current.current===requested)setBusy(false);}
  };
  const whatsapp=whatsappLink(store?.businessPhone ?? "");
  return <main className="mx-auto min-h-screen max-w-3xl space-y-5 bg-background p-4 pb-12">
    <header className="space-y-2 py-4"><h1 className="text-2xl font-bold">{store?.name ?? "Pedidos próprios"}</h1><p className="text-sm text-muted-foreground">Escolha seus itens para retirada. Pagamento no estabelecimento.</p></header>
    {(loaded.scope!==scope || loaded.loading) && <p role="status">Carregando cardápio...</p>}
    {loaded.scope===scope && loaded.error && <div role="alert"><p>{loaded.error}</p><Button onClick={()=>setAttempt(v=>v+1)}>Tentar novamente</Button></div>}
    {confirmation?.scope===scope ? <section className="space-y-3 rounded-xl border bg-card p-5"><h2 className="text-xl font-semibold">Pedido recebido — retirada #{confirmation.data.pickupNumber}</h2><p>Total: {formatCurrency(confirmation.data.total)}. O atendimento confirmará o preparo e a retirada.</p><p className="text-sm text-muted-foreground">Este link já foi usado. Para outro pedido, envie PEDIR novamente no WhatsApp.</p>{whatsapp && <a className="inline-block rounded-md bg-primary p-3 text-primary-foreground" href={whatsapp} rel="noreferrer">Falar com a loja</a>}</section> : store && <>
      {!token.current.value && <section className="space-y-2 rounded-xl border bg-card p-4"><p>Para finalizar o pedido, confirme seu WhatsApp enviando <strong>PEDIR</strong>. Você receberá um link pessoal.</p>{whatsapp ? <a className="inline-block rounded-md bg-primary p-3 text-primary-foreground" href={whatsapp} rel="noreferrer">Validar WhatsApp e pedir</a> : <p className="text-sm text-muted-foreground">O WhatsApp da loja ainda não está disponível. Fale com o atendimento.</p>}</section>}
      <section aria-label="Cardápio" className="space-y-3">{store.items.map(item=><article key={item.id} className="flex gap-3 rounded-xl border bg-card p-3">{item.image_url && /^https:\/\//.test(item.image_url) && <img src={item.image_url} alt={item.name} referrerPolicy="no-referrer" loading="lazy" className="h-24 w-24 rounded-lg object-cover"/>}<div className="min-w-0 flex-1 space-y-2"><h2 className="font-semibold">{item.name}</h2><p className="text-sm text-muted-foreground">{item.description}</p><p>{formatCurrency(Number(item.price))}</p><div className="flex items-center gap-3"><Button size="sm" variant="outline" disabled={busy || !cart[item.id]} aria-label={`Remover ${item.name}`} onClick={()=>change(item.id,-1)}>−</Button><span aria-label={`Quantidade de ${item.name}`}>{cart[item.id] ?? 0}</span><Button size="sm" disabled={busy || (cart[item.id] ?? 0)>=20} aria-label={`Adicionar ${item.name}`} onClick={()=>change(item.id,1)}>+</Button></div></div></article>)}{!store.items.length && <p>Nenhum item disponível agora.</p>}</section>
      <section className="space-y-3 rounded-xl border bg-card p-4"><h2 className="font-semibold">Seu pedido: {count} item(ns) · {formatCurrency(total)}</h2><label className="block space-y-1 text-sm">Observação<textarea disabled={busy} className="w-full rounded-md border bg-background p-2" maxLength={500} value={note} onChange={e=>setNote(e.target.value)} placeholder="Orientação para o preparo"/></label><p className="text-xs text-muted-foreground">Seu nome e WhatsApp serão usados para identificar o pedido e organizar a retirada. Preferências e campanhas dependem de autorização separada no WhatsApp.</p>{submitError && <p role="alert" className="text-destructive">{submitError}</p>}<Button className="w-full" disabled={busy || !count || !token.current.value} onClick={()=>void submit()}>{busy ? "Enviando pedido..." : "Confirmar pedido para retirada"}</Button></section>
    </>}
  </main>;
}
