import {useEffect,useState} from "react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {formatPhone,pwaVerifyApi,type PwaProfile} from "@/lib/pwaVerifyApi";

// Etapa 1: confirmar o celular com código por SMS (Twilio Verify).
export default function PhoneVerification({unit,whatsappUrl,onVerified}:{unit:string;whatsappUrl:string;onVerified:(token:string,profile:PwaProfile)=>void}){
  const [phone,setPhone]=useState("");const [code,setCode]=useState("");const [sent,setSent]=useState(false);
  const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [wait,setWait]=useState(0);
  useEffect(()=>{if(wait<=0)return;const t=window.setTimeout(()=>setWait(w=>w-1),1000);return()=>window.clearTimeout(t);},[wait]);
  const send=async()=>{if(busy)return;setBusy(true);setError("");
    try{await pwaVerifyApi({action:"start",business_unit_id:unit,phone});setSent(true);setCode("");setWait(30);}
    catch(e){setError(e instanceof Error ? e.message : "Falha de conexão");}finally{setBusy(false);}};
  const check=async()=>{if(busy)return;setBusy(true);setError("");
    try{const data=await pwaVerifyApi<{access_token:string;profile:PwaProfile}>({action:"check",business_unit_id:unit,phone,code});onVerified(data.access_token,data.profile);}
    catch(e){setError(e instanceof Error ? e.message : "Falha de conexão");}finally{setBusy(false);}};
  const digits=phone.replace(/\D/g,"");
  return <section aria-label="Confirmar celular" className="space-y-3 rounded-xl border bg-card p-4">
    <h2 className="text-lg font-semibold">Confirme seu celular</h2>
    <p className="text-sm text-muted-foreground">Enviaremos um código por SMS. Ele identifica seu pedido na retirada.</p>
    <label className="block space-y-1 text-sm">Celular com DDD<Input inputMode="tel" autoComplete="tel-national" placeholder="(61) 98765-4321" value={formatPhone(phone)} disabled={busy || sent} onChange={e=>setPhone(e.target.value)}/></label>
    {!sent ? <Button className="w-full" disabled={busy || digits.length<10} onClick={()=>void send()}>{busy ? "Enviando..." : "Receber código por SMS"}</Button> : <>
      <label className="block space-y-1 text-sm">Código recebido<Input inputMode="numeric" autoComplete="one-time-code" maxLength={10} value={code} disabled={busy} onChange={e=>setCode(e.target.value.replace(/\D/g,""))}/></label>
      <Button className="w-full" disabled={busy || code.length<4} onClick={()=>void check()}>{busy ? "Confirmando..." : "Confirmar código"}</Button>
      <div className="flex flex-wrap justify-between gap-2 text-sm"><button type="button" className="text-primary underline disabled:opacity-50" disabled={busy || wait>0} onClick={()=>void send()}>{wait>0 ? `Reenviar em ${wait}s` : "Reenviar código"}</button><button type="button" className="text-primary underline" disabled={busy} onClick={()=>{setSent(false);setCode("");setError("");}}>Trocar número</button></div>
    </>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {whatsappUrl && <p className="text-xs text-muted-foreground">Prefere o WhatsApp? <a className="text-primary underline" href={whatsappUrl} rel="noreferrer">Envie PEDIR para a loja</a>.</p>}
  </section>;
}
