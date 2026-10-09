import {useEffect,useMemo,useRef,useState} from "react";
import {supabase} from "@/integrations/supabase/client";
import {useCurrentBusinessUnit} from "@/hooks/useCurrentBusinessUnit";
import {useAuth} from "@/hooks/useAuth";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {crmReport,type CrmVisit,type CrmOrder,type WhatsAppContact} from "@/utils/crm";
import {buildCsv,downloadBlob} from "@/utils/fileExport";
import {formatCurrency} from "@/utils/orders";
export default function CRMTab(){
  const {businessUnitId}=useCurrentBusinessUnit();const {user}=useAuth();const scope=`${user?.id}:${businessUnitId}`;const current=useRef(scope);current.current=scope;
  const [state,setState]=useState<{scope:string;visits:CrmVisit[];orders:CrmOrder[];contacts:WhatsAppContact[];failures:number;loading:boolean;error:string}>({scope,visits:[],orders:[],contacts:[],failures:0,loading:true,error:""});
  const [search,setSearch]=useState("");const [period,setPeriod]=useState("all");const [attempt,setAttempt]=useState(0);
  useEffect(()=>{let cancelled=false;setState({scope,visits:[],orders:[],contacts:[],failures:0,loading:true,error:""});if(!businessUnitId || !user)return;
    void Promise.all([
      supabase.from("session_clients").select("id,customer_id,name,phone,email,added_at").eq("business_unit_id",businessUnitId).order("added_at",{ascending:false}).limit(5000),
      supabase.from("orders").select("id,client_id,placed_at,total,status").eq("business_unit_id",businessUnitId).neq("status","cancelled").order("placed_at",{ascending:false}).limit(5000),
      supabase.from("whatsapp_contacts").select("id,phone,name,email,bairro,preferences,profile_consent_at,marketing_consent_at,opted_out_at,message_count,first_seen_at,last_seen_at").eq("business_unit_id",businessUnitId).order("last_seen_at",{ascending:false}).limit(5000),
      supabase.from("whatsapp_events").select("id",{count:"exact",head:true}).eq("business_unit_id",businessUnitId).in("delivery_state",["failed","sending"]),
    ]).then(([visits,orders,contacts,events])=>{if(cancelled || current.current!==scope)return;const error=visits.error || orders.error || contacts.error || events.error;setState({scope,visits:error ? [] : visits.data ?? [],orders:error ? [] : orders.data ?? [],contacts:error ? [] : contacts.data ?? [],failures:events.count ?? 0,loading:false,error:error ? "Não foi possível carregar o CRM completo. Verifique a publicação das integrações." : ""});}).catch(()=>{if(!cancelled && current.current===scope)setState({scope,visits:[],orders:[],contacts:[],failures:0,loading:false,error:"Falha ao carregar CRM"});});return ()=>{cancelled=true;};
  },[businessUnitId,user,scope,attempt]);
  const visible=state.scope===scope ? state : {...state,visits:[],orders:[],contacts:[],failures:0,loading:true,error:""};
  const cutoff=useMemo(()=>period==="all" ? 0 : Date.now()-Number(period)*86400000,[period]);
  const report=useMemo(()=>crmReport(visible.visits,visible.orders,visible.contacts,cutoff),[visible.visits,visible.orders,visible.contacts,cutoff]);
  const filtered=report.filter(c=>`${c.name} ${c.phone ?? ""} ${c.email ?? ""} ${c.bairro ?? ""} ${c.preferences ?? ""}`.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")));
  const exportCsv=()=>downloadBlob(new Blob([buildCsv([["Cliente","Telefone","Email","Bairro","Preferências","Visitas","Pedidos","Consumo","Mensagens WhatsApp","Autorizou ofertas","Último contato"],...filtered.map(c=>[c.name,c.phone,c.email,c.bairro,c.preferences,c.visits.size,c.orders,c.total.toFixed(2),c.messages,c.marketingConsent ? "Sim" : "Não",c.last])])],{type:"text/csv;charset=utf-8"}),`pop9-crm-${new Date().toISOString().slice(0,10)}.csv`);
  if(!businessUnitId)return <p>Selecione a unidade.</p>;if(visible.loading)return <p role="status">Carregando CRM...</p>;
  return <section className="space-y-4"><div><h2 tabIndex={0} data-tooltip="Consulte clientes, consumo e autorizações do WhatsApp por unidade." className="text-xl font-semibold">CRM — clientes e WhatsApp</h2><p className="text-sm text-muted-foreground">Relacionamento por telefone, atendimentos e consumo em pedidos não cancelados. Mensagens não são contadas como visitas.</p></div>
    {visible.error && <p role="alert">{visible.error} <Button onClick={()=>setAttempt(v=>v+1)}>Tentar novamente</Button></p>}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{([["Clientes identificados",report.length],["Contatos WhatsApp",report.filter(c=>c.whatsapp).length],["Consumo vinculado",formatCurrency(report.reduce((sum,c)=>sum+c.total,0))],["Autorizaram ofertas",report.filter(c=>c.marketingConsent).length]] as const).map(([label,value])=><div key={label} className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-semibold">{value}</p></div>)}</div>
    {visible.failures>0 && <p role="alert" className="text-amber-500">{visible.failures} resposta(s) do bot com falha ou envio ainda não confirmado. Consulte Conexões; o sistema não repete automaticamente um envio incerto.</p>}
    <div className="flex flex-wrap gap-2"><Input className="max-w-sm" aria-label="Buscar cliente no CRM" placeholder="Nome, telefone, bairro ou preferência" value={search} onChange={e=>setSearch(e.target.value)}/><select aria-label="Período do CRM" className="rounded-md border bg-background p-2" value={period} onChange={e=>setPeriod(e.target.value)}><option value="all">Todo o histórico</option><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option><option value="365">Últimos 12 meses</option></select><Button variant="outline" disabled={Boolean(visible.error)} onClick={exportCsv}>Exportar CSV</Button><Button variant="outline" onClick={()=>setAttempt(v=>v+1)}>Atualizar</Button></div>
    <div className="overflow-x-auto rounded-xl border"><table className="w-full text-left text-sm"><thead className="bg-muted"><tr>{["Cliente","Contato","Perfil","Visitas / pedidos","Consumo","WhatsApp","Ofertas","Último contato"].map(label=><th className="whitespace-nowrap p-3" key={label}>{label}</th>)}</tr></thead><tbody>{filtered.map(c=><tr className="border-t" key={c.key}><td className="p-3">{c.name}</td><td className="p-3">{c.phone ?? "—"}<br/>{c.email}</td><td className="p-3">{c.bairro ?? "—"}<br/>{c.preferences}</td><td className="p-3">{c.visits.size} / {c.orders}</td><td className="p-3">{formatCurrency(c.total)}</td><td className="p-3">{c.messages} mensagens</td><td className="p-3">{c.marketingConsent ? "Autorizadas" : "Sem autorização"}</td><td className="p-3">{new Date(c.last).toLocaleDateString("pt-BR")}</td></tr>)}</tbody></table>{!filtered.length && <p className="p-5">Nenhum cliente encontrado.</p>}</div>
    <p className="text-xs text-muted-foreground">Identificação por telefone normalizado dentro da unidade. Campos opcionais vêm de respostas explícitas após PERFIL SIM; campanhas exigem MARKETING SIM. Limite de consulta: 5.000 registros por fonte.</p>
  </section>;
}
