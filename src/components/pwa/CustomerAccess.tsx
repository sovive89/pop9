import {useEffect,useState} from "react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {formatPhone,isFullName,pwaVerifyApi,type PwaProfile} from "@/lib/pwaVerifyApi";

type Info={name:string;phone:string;email:string;bairro:string;marketing:boolean};
const KEY="pop9:pwa-customer";
const EMPTY:Info={name:"",phone:"",email:"",bairro:"",marketing:false};
// Pré-preenche quem volta neste aparelho (só nome/celular/opcionais; o código é sempre novo).
function remembered():Info{try{return {...EMPTY,...JSON.parse(localStorage.getItem(KEY) ?? "{}")};}catch{return EMPTY;}}

// 1) nome completo + celular  2) código por SMS  → o cliente entra no CRM e acessa o cardápio.
export default function CustomerAccess({unit,whatsappUrl,onVerified}:{unit:string;whatsappUrl:string;onVerified:(token:string,profile:PwaProfile)=>void}){
  const [info,setInfo]=useState<Info>(remembered);const [step,setStep]=useState<"info"|"code">("info");
  const [code,setCode]=useState("");const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [wait,setWait]=useState(0);
  const [more,setMore]=useState(()=>Boolean(info.email || info.bairro));
  useEffect(()=>{if(wait<=0)return;const t=window.setTimeout(()=>setWait(w=>w-1),1000);return()=>window.clearTimeout(t);},[wait]);
  const set=(key:keyof Info,value:string|boolean)=>setInfo(prev=>({...prev,[key]:value}));
  const payload={business_unit_id:unit,name:info.name,phone:info.phone,email:info.email,bairro:info.bairro,marketing:info.marketing};
  const send=async()=>{if(busy)return;setBusy(true);setError("");
    try{await pwaVerifyApi({action:"start",...payload});try{localStorage.setItem(KEY,JSON.stringify(info));}catch{/* sem armazenamento local */}setStep("code");setCode("");setWait(30);}
    catch(e){setError(e instanceof Error ? e.message : "Falha de conexão");}finally{setBusy(false);}};
  const check=async()=>{if(busy)return;setBusy(true);setError("");
    try{const data=await pwaVerifyApi<{access_token:string;profile:PwaProfile}>({action:"check",...payload,code});onVerified(data.access_token,data.profile);}
    catch(e){setError(e instanceof Error ? e.message : "Falha de conexão");}finally{setBusy(false);}};
  const phoneOk=info.phone.replace(/\D/g,"").length>=10;const nameOk=isFullName(info.name);
  if(step==="code")return <section aria-label="Código de verificação" className="space-y-3 rounded-xl border bg-card p-4">
    <h2 className="text-lg font-semibold">Digite o código</h2>
    <p className="text-sm text-muted-foreground">Enviamos um código por SMS para {formatPhone(info.phone)}.</p>
    <Input aria-label="Código recebido" inputMode="numeric" autoComplete="one-time-code" maxLength={10} autoFocus value={code} disabled={busy} onChange={e=>setCode(e.target.value.replace(/\D/g,""))}/>
    <Button className="w-full" disabled={busy || code.length<4} onClick={()=>void check()}>{busy ? "Confirmando..." : "Confirmar e ver o cardápio"}</Button>
    <div className="flex flex-wrap justify-between gap-2 text-sm"><button type="button" className="text-primary underline disabled:opacity-50" disabled={busy || wait>0} onClick={()=>void send()}>{wait>0 ? `Reenviar em ${wait}s` : "Reenviar código"}</button><button type="button" className="text-primary underline" disabled={busy} onClick={()=>{setStep("info");setCode("");setError("");}}>Corrigir dados</button></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>;
  return <section aria-label="Seus dados" className="space-y-3 rounded-xl border bg-card p-4">
    <h2 className="text-lg font-semibold">Identifique-se para pedir</h2>
    <p className="text-sm text-muted-foreground">Vamos enviar um código por SMS para confirmar seu celular.</p>
    <label className="block space-y-1 text-sm">Nome completo<Input autoComplete="name" maxLength={80} placeholder="Nome e sobrenome" value={info.name} disabled={busy} onChange={e=>set("name",e.target.value)}/></label>
    {info.name.trim() && !nameOk && <p className="text-xs text-muted-foreground">Informe nome e sobrenome.</p>}
    <label className="block space-y-1 text-sm">Celular com DDD<Input inputMode="tel" autoComplete="tel-national" placeholder="(61) 98765-4321" value={formatPhone(info.phone)} disabled={busy} onChange={e=>set("phone",e.target.value.replace(/\D/g,"").slice(0,11))}/></label>
    {!more ? <button type="button" className="text-sm text-primary underline" onClick={()=>setMore(true)}>Adicionar e-mail e bairro (opcional)</button> : <>
      <label className="block space-y-1 text-sm">E-mail (opcional)<Input type="email" autoComplete="email" maxLength={120} value={info.email} disabled={busy} onChange={e=>set("email",e.target.value)}/></label>
      <label className="block space-y-1 text-sm">Bairro (opcional)<Input autoComplete="address-level3" maxLength={80} value={info.bairro} disabled={busy} onChange={e=>set("bairro",e.target.value)}/></label>
    </>}
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={info.marketing} disabled={busy} onChange={e=>set("marketing",e.target.checked)}/>Quero receber novidades e promoções da loja (opcional).</label>
    <p className="text-xs text-muted-foreground">Usamos seu nome e celular para identificar o pedido e a retirada.</p>
    <Button className="w-full" disabled={busy || !nameOk || !phoneOk} onClick={()=>void send()}>{busy ? "Enviando..." : "Receber código por SMS"}</Button>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {whatsappUrl && <p className="text-xs text-muted-foreground">Prefere o WhatsApp? <a className="text-primary underline" href={whatsappUrl} rel="noreferrer">Envie PEDIR para a loja</a>.</p>}
  </section>;
}
