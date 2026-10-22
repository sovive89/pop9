import {useEffect,useRef,useState,type CSSProperties} from "react";
import {useParams} from "react-router-dom";
import {Image as ImageIcon} from "lucide-react";
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
const categoryCopy=(category:string)=>{
  const value=category.trim().toLowerCase();
  if(/burger|hamb|lanche/.test(value))return "Burgers artesanais, feitos na chapa e montados na hora.";
  if(/entrada|porção|porcao/.test(value))return "Para começar ou dividir enquanto o pedido fica pronto.";
  if(/molho/.test(value))return "Molhos da casa para deixar seu pedido ainda mais especial.";
  if(/bebida|chope|drink/.test(value))return "Bebidas geladas para acompanhar.";
  if(/sobremesa|doce/.test(value))return "Um final doce para fechar o pedido.";
  return "Escolha seus favoritos e monte sua sacola.";
};
// Card grande do cardápio: foto em cima, nome, preço, descrição e botão de largura total (vira contador depois de adicionar).
function MenuCard({name,description,image,price,note,qty,busy,onChange}:{name:string;description:string|null;image:string|null;price:number;note?:string;qty:number;busy:boolean;onChange:(delta:number)=>void}){
  const [broken,setBroken]=useState(false);
  const actionRef=useRef<HTMLButtonElement>(null);
  const had=useRef(qty>0);
  // O botão focado some quando o card troca entre "Adicionar" e o contador; devolve o foco ao botão novo.
  useEffect(()=>{if(had.current!==qty>0){had.current=qty>0;actionRef.current?.focus();}},[qty]);
  return <article className="group overflow-hidden rounded-[1.6rem] border border-[#252525]/10 bg-[#fffaf3] shadow-[0_12px_35px_rgba(36,25,17,0.08)] transition-transform hover:-translate-y-0.5">
    {image && !broken && /^https:\/\//.test(image) ? <img src={image} alt={name} onError={()=>setBroken(true)} referrerPolicy="no-referrer" loading="lazy" className="aspect-[4/3] w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"/> : <div aria-hidden className="flex aspect-[4/3] w-full items-center justify-center bg-[#191919] text-[#f7c84b]"><ImageIcon className="h-12 w-12 opacity-70"/></div>}
    <div className="space-y-3 p-5">
      <div className="flex items-start justify-between gap-3"><h3 className="text-2xl font-black uppercase leading-[0.95] tracking-tight text-[#171717]">{name}</h3><p className="shrink-0 text-xl font-black text-[#c74727]">{formatCurrency(price)}</p></div>
      {note && <p className="text-sm text-muted-foreground">{note}</p>}
      {description && <p className="text-base leading-relaxed text-muted-foreground">{description}</p>}
      {qty>0 ? <div className="flex items-center justify-between gap-3 rounded-full border-2 border-primary p-1">
          <Button type="button" variant="ghost" className="h-11 w-11 rounded-full text-xl" disabled={busy} aria-label={`Remover ${name}`} onClick={()=>onChange(-1)}>−</Button>
          <span className="text-lg font-bold" aria-label={`Quantidade de ${name}`}>{qty}</span>
          <Button ref={actionRef} type="button" variant="ghost" className="h-11 w-11 rounded-full text-xl" disabled={busy || qty>=20} aria-label={`Adicionar ${name}`} onClick={()=>onChange(1)}>+</Button>
        </div>
        : <Button ref={actionRef} type="button" className="h-12 w-full rounded-full bg-[#171717] text-sm font-black uppercase tracking-wider text-[#fffaf3] hover:bg-[#c74727]" disabled={busy} aria-label={`Adicionar ${name}`} onClick={()=>onChange(1)}>Escolher e adicionar</Button>}
    </div>
  </article>;
}
type PublicOrderStatus="pending"|"preparing"|"ready"|"delivered"|"cancelled";
type Confirmation={orderId:string;pickupNumber:number;total:number;status:PublicOrderStatus};
const statusLabels:Record<PublicOrderStatus,string>={pending:"Pedido recebido",preparing:"Em preparo",ready:"Pronto para retirada",delivered:"Entregue",cancelled:"Cancelado"};
const statusMessages:Record<PublicOrderStatus,string>={pending:"A loja recebeu o pedido e ainda vai iniciar o preparo.",preparing:"A cozinha está preparando seu pedido.",ready:"Seu pedido está pronto. Você já pode fazer a retirada.",delivered:"Este pedido foi marcado como entregue pela loja.",cancelled:"Este pedido foi cancelado pela loja."};
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
    try{const saved=sessionStorage.getItem(`pop9:order-confirmation:${scope}`);if(saved){const data=JSON.parse(saved) as Confirmation;if(data?.orderId)setConfirmation({scope,data});}}catch{/* segue sem restauração local */}
    setLoaded({scope,store:null,error:"",loading:true});
    void publicOrderApi({action:"menu",business_unit_id:scope}).then(store=>{if(!cancelled)setLoaded({scope,store,error:"",loading:false});}).catch(error=>{if(!cancelled)setLoaded({scope,store:null,error:error.message,loading:false});});
    let manifest=document.querySelector<HTMLLinkElement>('link[rel="manifest"]');const original=manifest?.href;const created=!manifest;
    if(!manifest){manifest=document.createElement("link");manifest.rel="manifest";document.head.appendChild(manifest);}
    if(manifest && import.meta.env.VITE_SUPABASE_URL)manifest.href=`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-order?action=manifest&unit=${encodeURIComponent(scope)}`;
    return ()=>{cancelled=true;if(manifest && created)manifest.remove();else if(manifest && original)manifest.href=original;};
  },[scope,attempt]);
  useEffect(()=>{
    if(!confirmation || confirmation.scope!==scope || !token.current.value)return;
    let cancelled=false;
    const refresh=async()=>{
      try{
        const data=await publicOrderApi({action:"status",business_unit_id:scope,access_token:token.current.value});
        if(!cancelled && data?.orderId){
          const next={...confirmation.data,...data,status:data.status as PublicOrderStatus};
          setConfirmation(previous=>previous?.scope===scope ? {scope,data:next} : previous);
          try{sessionStorage.setItem(`pop9:order-confirmation:${scope}`,JSON.stringify(next));}catch{/* segue sem persistência local */}
        }
      }catch(error){if(!cancelled)setSubmitError(error instanceof Error ? error.message : "Não foi possível atualizar o status do pedido.");}
    };
    void refresh();
    if(confirmation.data.status!=="delivered" && confirmation.data.status!=="cancelled"){
      const timer=window.setInterval(()=>void refresh(),10000);
      return()=>{cancelled=true;window.clearInterval(timer);};
    }
    return()=>{cancelled=true;};
  },[confirmation?.scope,confirmation?.data.status,scope]);
  const store=loaded.scope===scope ? loaded.store : null;const cart=cartState.scope===scope ? cartState.cart : {};
  // Só combos prontos no formato novo (components); o formato antigo do servidor (slots) não é oferecido por aqui.
  const combos=(store?.combos ?? []).filter(combo=>Array.isArray(combo?.components) && Number.isFinite(Number(combo.price)));
  const total=(store?.items.reduce((sum,item)=>sum+Number(item.price)*(cart[itemKey(item.id)] ?? 0),0) ?? 0)+combos.reduce((sum,combo)=>sum+Number(combo.price)*(cart[comboKey(combo.id)] ?? 0),0);
  const count=Object.values(cart).reduce((a,b)=>a+b,0);
  const change=(id:string,amount:number)=>setCart(prev=>{const previous=prev.scope===scope ? prev.cart : {};return {scope,cart:{...previous,[id]:Math.max(0,Math.min(20,(previous[id] ?? 0)+amount))}};});
  const submit=async()=>{
    if(busy || !count || store?.acceptingOrders===false || token.current.scope!==scope)return;setBusy(true);setSubmitError("");const requested=scope;
    try{const data=await publicOrderApi({action:"submit",business_unit_id:scope,access_token:token.current.value,items:Object.entries(cart).filter(([,qty])=>qty>0).map(([key,quantity])=>key.startsWith("combo:") ? {combo_id:key.slice("combo:".length),quantity} : {id:key.slice("item:".length),quantity}),note});if(current.current===requested){const confirmationData={...data,status:(data.status ?? "pending") as PublicOrderStatus};setConfirmation({scope:requested,data:confirmationData});try{sessionStorage.setItem(`pop9:order-confirmation:${requested}`,JSON.stringify(confirmationData));}catch{/* segue sem persistência local */}setCart({scope:requested,cart:{}});}}
    catch(error){if(current.current===requested)setSubmitError(error instanceof Error ? error.message : "Falha de conexão. Tente novamente; seu pedido não será duplicado.");}
    finally{if(current.current===requested)setBusy(false);}
  };
  const whatsapp=whatsappLink(store?.businessPhone ?? "");
  const smsEnabled=Boolean((store as {smsVerification?:boolean}|null)?.smsVerification);
  const onVerified=(value:string)=>{try{sessionStorage.setItem(`pop9:order-access:${scope}`,value);}catch{/* sem sessionStorage: segue só na memória */}token.current={scope,value};setVerifiedAt(Date.now());};
  const restart=()=>{try{sessionStorage.removeItem(`pop9:order-access:${scope}`);sessionStorage.removeItem(`pop9:order-confirmation:${scope}`);}catch{/* idem */}token.current={scope,value:""};setConfirmation(null);setSubmitError("");setVerifiedAt(Date.now());};
  // Com SMS ativo, o cardápio só aparece depois de identificar o cliente e confirmar o código.
  const gate=store && smsEnabled && store.acceptingOrders!==false && !token.current.value
    ? <CustomerAccess unit={scope} whatsappUrl={whatsapp} onVerified={onVerified}/> : null;
  // Marca da loja: só cores e imagens validadas, aplicadas apenas neste contêiner.
  // A função public-order já validou cada campo com a URL do Storage do servidor
  // (que pode ser um domínio próprio diferente de VITE_SUPABASE_URL).
  const brand=store?.brand ?? null;
  const style={...(brand ? brandCssVars(brand) : {}),...(brand?.background_url ? {backgroundImage:`url("${brand.background_url}")`,backgroundSize:"cover",backgroundPosition:"center",backgroundAttachment:"fixed"} : {})} as CSSProperties;
  return <div style={style} className="min-h-screen bg-[#f5efe6] text-[#171717]"><main className="mx-auto min-h-screen max-w-6xl space-y-8 pb-28">
    <header className="sticky top-0 z-20 border-b border-[#171717]/10 bg-[#f5efe6]/95 px-4 py-3 backdrop-blur sm:px-8"><div className="mx-auto flex max-w-6xl items-center justify-between gap-4"><a href="#topo" className="flex items-center gap-2" aria-label="Voltar ao início">{brand?.logo_url ? <img src={brand.logo_url} alt={store?.name ?? "Logo da loja"} className="h-9 max-w-[9rem] object-contain"/> : <span className="text-lg font-black uppercase tracking-tight">{store?.name ?? "Pedidos próprios"}</span>}</a><nav aria-label="Navegação do cardápio" className="hidden items-center gap-5 text-xs font-bold uppercase tracking-wider text-[#171717]/70 md:flex"><a href="#cardapio" className="hover:text-[#c74727]">Cardápio</a>{brand?.address && <a href="#sobre" className="hover:text-[#c74727]">A casa</a>}{brand?.address && <a href="#local" className="hover:text-[#c74727]">Localização</a>}</nav><button type="button" onClick={()=>document.getElementById("sacola")?.scrollIntoView({behavior:"smooth"})} className="rounded-full border border-[#171717]/20 bg-[#fffaf3] px-4 py-2 text-xs font-black uppercase tracking-wider hover:border-[#c74727] hover:text-[#c74727]">Sacola{count>0 ? ` · ${count}` : ""}</button></div></header>
    <section id="topo" className="mx-4 overflow-hidden rounded-[2rem] bg-[#1a1a1a] px-6 py-14 text-center text-[#fffaf3] shadow-[0_20px_50px_rgba(36,25,17,0.18)] sm:mx-8 sm:px-12 sm:py-20"><p className="mb-3 text-xs font-bold uppercase tracking-[0.3em] text-[#f7c84b]">{brand?.address ? brand.address.split(",")[0] : "Hambúrguer artesanal"}</p><h1 className="mx-auto max-w-3xl text-5xl font-black uppercase leading-[0.88] tracking-tight sm:text-7xl">{store?.name ?? "Pedidos próprios"}<span className="mt-3 block text-[#f06b37]">sabor com atitude</span></h1><p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-[#fffaf3]/75">Monte seu pedido para retirada no balcão. Escolha seus favoritos, confira a sacola e acompanhe o preparo pela mesma fila da loja.</p><div className="mt-8 flex flex-wrap justify-center gap-3"><a href="#cardapio" className="rounded-full bg-[#f06b37] px-6 py-3 text-sm font-black uppercase tracking-wider text-[#171717] hover:bg-[#f7c84b]">Montar pedido</a><a href="#sobre" className="rounded-full border border-[#fffaf3]/40 px-6 py-3 text-sm font-black uppercase tracking-wider text-[#fffaf3] hover:border-[#f7c84b] hover:text-[#f7c84b]">Conheça a casa</a></div></section>
    {brand && (brand.about_text || brand.address || brand.opening_hours) && <section id="sobre" aria-label="Sobre a loja" className="mx-4 grid gap-4 rounded-[1.5rem] border border-[#171717]/10 bg-[#fffaf3] p-6 text-sm shadow-sm sm:mx-8 sm:grid-cols-2">{brand.about_text && <p className="whitespace-pre-line leading-relaxed">{brand.about_text}</p>}<div className="space-y-2">{brand.address && <p className="whitespace-pre-line"><strong>Endereço:</strong> {brand.address}</p>}{brand.opening_hours && <p className="whitespace-pre-line"><strong>Horário:</strong> {brand.opening_hours}</p>}</div></section>}
    {(loaded.scope!==scope || loaded.loading) && <p role="status">Carregando cardápio...</p>}
    {loaded.scope===scope && loaded.error && <div role="alert"><p>{loaded.error}</p><Button onClick={()=>setAttempt(v=>v+1)}>Tentar novamente</Button></div>}
    {confirmation?.scope===scope ? <section className="space-y-4 rounded-xl border bg-card p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-semibold">Retirada #{confirmation.data.pickupNumber}</h2><span className="rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">{statusLabels[confirmation.data.status]}</span></div><p>{statusMessages[confirmation.data.status]}</p><p className="text-sm text-muted-foreground">Total: {formatCurrency(confirmation.data.total)}. Este status é atualizado pela mesma fila usada no atendimento e na cozinha.</p><div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">{(["pending","preparing","ready","delivered"] as PublicOrderStatus[]).map(step=><div key={step} className={`rounded-md border p-2 ${confirmation.data.status===step ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>{statusLabels[step]}</div>)}</div>{confirmation.data.status==="cancelled" && <p role="alert" className="text-destructive">Fale com a loja para verificar o motivo do cancelamento.</p>}{smsEnabled ? <Button variant="outline" onClick={restart}>Fazer outro pedido</Button> : <p className="text-sm text-muted-foreground">Este link já foi usado. Para outro pedido, envie PEDIR novamente no WhatsApp.</p>}{whatsapp && <a className="inline-block rounded-md bg-primary p-3 text-primary-foreground" href={whatsapp} rel="noreferrer">Falar com a loja</a>}</section> : store && <>
      {store.acceptingOrders===false && <section role="status" className="space-y-2 rounded-xl border bg-card p-4"><h2 className="font-semibold">Loja fechada para novos pedidos</h2><p className="text-sm text-muted-foreground">Você pode consultar o cardápio. Volte quando a loja abrir para fazer seu pedido.</p><Button variant="outline" onClick={()=>setAttempt(value=>value+1)}>Atualizar disponibilidade</Button></section>}
      {store.acceptingOrders!==false && !smsEnabled && !token.current.value && <section className="space-y-2 rounded-xl border bg-card p-4"><p>Para finalizar o pedido, confirme seu WhatsApp enviando <strong>PEDIR</strong>. Você receberá um link pessoal.</p>{whatsapp ? <a className="inline-block rounded-md bg-primary p-3 text-primary-foreground" href={whatsapp} rel="noreferrer">Validar WhatsApp e pedir</a> : <p className="text-sm text-muted-foreground">O WhatsApp da loja ainda não está disponível. Fale com o atendimento.</p>}</section>}
      {gate ?? <>
      {combos.length>0 && <section aria-label="Combos" className="mx-4 space-y-4 sm:mx-8"><div><p className="text-xs font-bold uppercase tracking-[0.25em] text-[#c74727]">Para completar</p><h2 className="mt-1 text-4xl font-black uppercase tracking-tight">Combos</h2><p className="mt-2 text-sm text-[#171717]/65">{categoryCopy("combos")}</p></div><div className="grid gap-5 sm:grid-cols-2">{combos.map(combo=>{const key=comboKey(combo.id);const saving=Number(combo.list_price)-Number(combo.price);return <MenuCard key={combo.id} name={combo.name} image={null} price={Number(combo.price)} qty={cart[key] ?? 0} busy={busy} description={[combo.description,combo.components.map(part=>part.name).join(" + ")].filter(Boolean).join(" — ")} note={saving>0.004 ? `De ${formatCurrency(Number(combo.list_price))} · economize ${formatCurrency(saving)}` : undefined} onChange={delta=>change(key,delta)}/>;})}</div></section>}
      <section id="cardapio" aria-label="Cardápio" className="mx-4 space-y-12 sm:mx-8"><div><p className="text-xs font-bold uppercase tracking-[0.25em] text-[#c74727]">Cardápio</p><h2 className="mt-1 text-5xl font-black uppercase leading-none tracking-tight">Tudo o que sai da chapa</h2><p className="mt-3 max-w-2xl text-base text-[#171717]/65">Escolha seus favoritos, adicione à sacola e deixe a cozinha cuidar do resto.</p></div>{[...new Set(store.items.map(item=>item.category))].map(category=><div key={category} className="space-y-5"><div><h2 className="text-3xl font-black uppercase tracking-tight">{category || "Favoritos"}</h2><p className="mt-1 text-sm text-[#171717]/60">{categoryCopy(category)}</p></div><div className="grid gap-5 sm:grid-cols-2">{store.items.filter(item=>item.category===category).map(item=><MenuCard key={item.id} name={item.name} image={item.image_url} price={Number(item.price)} description={item.description} qty={cart[itemKey(item.id)] ?? 0} busy={busy} onChange={delta=>change(itemKey(item.id),delta)}/>)}</div></div>)}{!store.items.length && <p>Nenhum item disponível agora.</p>}</section>
      <section id="sacola" className="mx-4 scroll-mt-24 space-y-4 rounded-[1.5rem] bg-[#1a1a1a] p-6 text-[#fffaf3] shadow-[0_20px_50px_rgba(36,25,17,0.16)] sm:mx-8"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.25em] text-[#f7c84b]">Sua sacola</p><h2 className="mt-1 text-3xl font-black uppercase">{count ? `${count} item(ns)` : "Ainda vazia"}</h2></div><span className="text-2xl font-black text-[#f06b37]">{formatCurrency(total)}</span></div><label className="block space-y-1 text-sm">Observação<textarea disabled={busy} className="min-h-24 w-full rounded-xl border border-[#fffaf3]/20 bg-[#fffaf3]/10 p-3 text-[#fffaf3] placeholder:text-[#fffaf3]/45" maxLength={500} value={note} onChange={e=>setNote(e.target.value)} placeholder="Alguma orientação para o preparo?"/></label><p className="text-xs text-[#fffaf3]/60">Pagamento no estabelecimento. Seu nome e WhatsApp identificam o pedido e organizam a retirada.</p>{submitError && <p role="alert" className="text-[#ff9b7b]">{submitError}</p>}<Button className="h-12 w-full rounded-full bg-[#f06b37] text-sm font-black uppercase tracking-wider text-[#171717] hover:bg-[#f7c84b]" disabled={busy || !count || !token.current.value || store.acceptingOrders===false} onClick={()=>void submit()}>{busy ? "Enviando pedido..." : "Confirmar pedido para retirada"}</Button></section>
      </>}
    </>}
  </main></div>;
}
