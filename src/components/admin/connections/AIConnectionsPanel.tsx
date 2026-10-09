import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const PROVIDERS = [
  ["openai","OpenAI — GPT Image"],["google","Google — Gemini / Nano Banana / Imagen"],
  ["xai","xAI — Grok Imagine"],["anthropic","Anthropic — Claude (texto)"],
  ["bfl","Black Forest Labs — FLUX"],["ideogram","Ideogram — imagens"],
] as const;
type Connection = { provider:string;status:string;validated_at:string|null };
export function AIConnectionsPanel() {
  const [unitId,setUnitId]=useState("");
  const [units,setUnits]=useState<{id:string;name:string}[]>([]);
  const [connections,setConnections]=useState<Connection[]>([]);
  const [provider,setProvider]=useState<string>("openai");
  const [key,setKey]=useState("");
  const [busy,setBusy]=useState(false);
  useEffect(()=>{void (async()=>{
    const {data:{user}}=await supabase.auth.getUser();
    if(!user)return;
    const {data,error}=await supabase.from("user_roles").select("business_unit_id").eq("user_id",user.id).eq("role","admin");
    if(error){toast.error(error.message);return;}
    const ids=[...new Set((data??[]).map(x=>x.business_unit_id).filter(Boolean))];
    const {data:businessUnits}=ids.length
      ? await supabase.from("business_units").select("id,name").in("id",ids)
      : await supabase.from("business_units").select("id,name").eq("active",true);
    if(businessUnits?.length){
      setUnits((businessUnits??[]).map(u=>({id:u.id,name:u.name})));
      setUnitId(businessUnits[0].id);
    }
  })()},[]);
  async function invoke(action:string,selectedProvider=provider,apiKey?:string){
    const {data,error}=await supabase.functions.invoke("manage-ai-credentials",{body:{action,businessUnitId:unitId,provider:selectedProvider,apiKey}});
    if(error)throw error;
    if(data?.error)throw new Error(data.error);
    return data;
  }
  async function refresh(){
    if(!unitId)return;
    try{const data=await invoke("list");setConnections(data.connections??[]);}catch(e){toast.error(String(e));}
  }
  useEffect(()=>{void refresh()},[unitId]);
  async function connect(){
    if(!key.trim())return toast.error("Informe a chave da API");
    setBusy(true);
    try{await invoke("connect",provider,key.trim());setKey("");toast.success("Credencial validada e salva");await refresh();}
    catch(e){toast.error(e instanceof Error?e.message:String(e));}
    finally{setBusy(false);}
  }
  async function disconnect(){
    setBusy(true);
    try{await invoke("disconnect");toast.success("Conexão removida");await refresh();}
    catch(e){toast.error(e instanceof Error?e.message:String(e));}
    finally{setBusy(false);}
  }
  return <section className="rounded-xl border border-border p-4 space-y-3">
    <h3 className="font-semibold">Inteligência Artificial — credenciais por unidade</h3>
    <p className="text-sm text-muted-foreground">As chaves são enviadas somente ao backend, validadas e armazenadas cifradas. Não são exibidas novamente.</p>
    <label className="block text-sm">Unidade</label>
    <select className="w-full rounded-md border border-border bg-background p-2 text-sm" value={unitId} onChange={e=>setUnitId(e.target.value)}>
      {units.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
    </select>
    <label className="block text-sm">Provedor</label>
    <select className="w-full rounded-md border border-border bg-background p-2 text-sm" value={provider} onChange={e=>setProvider(e.target.value)}>
      {PROVIDERS.map(([id,label])=><option key={id} value={id}>{label}</option>)}
    </select>
    <Input type="password" autoComplete="off" value={key} onChange={e=>setKey(e.target.value)} placeholder="Chave de API (não será exibida após salvar)" />
    <div className="flex gap-2">
      <Button disabled={busy||!unitId||!key.trim()} onClick={()=>void connect()}>Testar e salvar</Button>
      <Button variant="outline" disabled={busy||!unitId} onClick={()=>void refresh()}>Atualizar status</Button>
      {connections.some(c=>c.provider===provider)&&<Button variant="destructive" disabled={busy} onClick={()=>void disconnect()}>Desconectar</Button>}
    </div>
    <p className="text-sm">Status: {connections.find(c=>c.provider===provider)?.status==="connected"?"Conectado":"Não conectado"}</p>
    <p className="text-xs text-muted-foreground">FLUX e Ideogram permanecem sem ativação até existir teste seguro de credenciais. A geração de imagem usa as credenciais Google ou OpenAI desta unidade.</p>
  </section>;
}
