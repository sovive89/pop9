import {useState} from "react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {pwaVerifyApi,type PwaProfile} from "@/lib/pwaVerifyApi";

// Etapa 2: os mesmos dados do check-in da mesa. Nome obrigatório; o resto é opcional.
export default function CustomerProfileForm({unit,token,initial,onDone}:{unit:string;token:string;initial:PwaProfile;onDone:(profile:PwaProfile)=>void}){
  const [name,setName]=useState(initial.name ?? "");const [email,setEmail]=useState(initial.email ?? "");
  const [bairro,setBairro]=useState(initial.bairro ?? "");const [marketing,setMarketing]=useState(initial.marketing);
  const [busy,setBusy]=useState(false);const [error,setError]=useState("");
  const save=async()=>{if(busy)return;setBusy(true);setError("");
    try{const data=await pwaVerifyApi<{profile:PwaProfile}>({action:"profile",business_unit_id:unit,access_token:token,name,email,bairro,marketing});onDone(data.profile);}
    catch(e){setError(e instanceof Error ? e.message : "Falha de conexão");}finally{setBusy(false);}};
  return <section aria-label="Seus dados" className="space-y-3 rounded-xl border bg-card p-4">
    <h2 className="text-lg font-semibold">Seus dados</h2>
    <p className="text-sm text-muted-foreground">Celular confirmado. Só o nome é obrigatório.</p>
    <label className="block space-y-1 text-sm">Seu nome<Input autoComplete="name" maxLength={80} value={name} disabled={busy} onChange={e=>setName(e.target.value)}/></label>
    <label className="block space-y-1 text-sm">E-mail (opcional)<Input type="email" autoComplete="email" maxLength={120} value={email} disabled={busy} onChange={e=>setEmail(e.target.value)}/></label>
    <label className="block space-y-1 text-sm">Bairro (opcional)<Input autoComplete="address-level3" maxLength={80} value={bairro} disabled={busy} onChange={e=>setBairro(e.target.value)}/></label>
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={marketing} disabled={busy} onChange={e=>setMarketing(e.target.checked)}/>Quero receber novidades e promoções da loja (opcional).</label>
    <p className="text-xs text-muted-foreground">Usamos seu nome e celular para identificar o pedido e a retirada. Você pode retirar a autorização de novidades quando quiser.</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button className="w-full" disabled={busy || name.trim().length<2} onClick={()=>void save()}>{busy ? "Salvando..." : "Continuar para o cardápio"}</Button>
  </section>;
}
