import {useEffect,useRef,useState} from "react";
import {useUnitKds} from "@/hooks/useUnitKds";
import {toast} from "sonner";
import {Navigate,Link} from "react-router-dom";
import {useAuth} from "@/hooks/useAuth";
import {useUnitRoles} from "@/hooks/useUnitRoles";
import {useSessionStore} from "@/hooks/useSessionStore";
import {useCurrentBusinessUnit} from "@/hooks/useCurrentBusinessUnit";
import CloseAccountPanel from "@/components/CloseAccountPanel";
import {Button} from "@/components/ui/button";
import {getTableTotal,formatCurrency,statusLabels} from "@/utils/orders";
import {pickupLabel} from "@/utils/operationalLinks";
const minutesSince=(date:Date)=>Math.max(0,Math.floor((Date.now()-date.getTime())/60000));
function playAlert(){
  try{const ctx=new AudioContext();[0,0.18,0.36].forEach((delay,i)=>{const osc=ctx.createOscillator();const gain=ctx.createGain();osc.connect(gain);gain.connect(ctx.destination);osc.frequency.value=i===2?1320:880;gain.gain.value=0.3;osc.start(ctx.currentTime+delay);osc.stop(ctx.currentTime+delay+0.15);});}catch{/* sem áudio */}
  if(navigator.vibrate)navigator.vibrate([200,100,200]);
}
export default function OnlineOrders(){
  const {user}=useAuth();const {businessUnitId}=useCurrentBusinessUnit();const {roles,loading:rolesLoading,error}=useUnitRoles();
  const {sessions,loading,reload,markDelivered,requestCloseSession}=useSessionStore();const [selected,setSelected]=useState<number|null>(null);
  const kds=useUnitKds();const [,tick]=useState(0);
  // Alerta de pedido online novo: som + aviso, sem tocar para os pedidos que já estavam na tela ao abrir.
  const known=useRef<Set<string>|null>(null);
  useEffect(()=>{
    if(loading)return;
    const ids=Object.entries(sessions).filter(([n])=>Number(n)<0).flatMap(([,e])=>e.orders.flatMap(c=>c.orders.map(o=>o.id)));
    if(known.current){const fresh=ids.filter(id=>!known.current!.has(id));if(fresh.length){playAlert();toast.success(fresh.length===1?"Novo pedido online":`${fresh.length} novos pedidos online`,{duration:15000});}}
    known.current=new Set(ids);
  },[sessions,loading]);
  useEffect(()=>{known.current=null;},[businessUnitId]);
  useEffect(()=>{const t=window.setInterval(()=>tick(v=>v+1),30000);return()=>window.clearInterval(t);},[]);
  useEffect(()=>{setSelected(null);},[businessUnitId,user?.id]);
  const allowed=roles.some(role=>["admin","attendant","cashier"].includes(role));
  if(!user)return <Navigate to="/login" replace/>;if(rolesLoading)return <p>Verificando acesso...</p>;if(error)return <p role="alert">Não foi possível verificar o acesso.</p>;if(!allowed)return <Navigate to="/" replace/>;
  if(!businessUnitId)return <p>Selecione a unidade.</p>;
  const chosen=selected!==null ? sessions[selected] : null;
  return <main className="mx-auto max-w-5xl space-y-4 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-semibold">Pedidos online — retirada</h1><div className="flex gap-3"><Link to="/">Atendimento</Link><Link to="/caixa">Caixa</Link><Button variant="outline" onClick={()=>void reload()}>Atualizar</Button></div></div><p className="text-sm text-muted-foreground">Pedidos do PWA entram na cozinha. Após a retirada, marque como entregue, registre o pagamento e solicite o encerramento ao Caixa.</p>
    {chosen ? <CloseAccountPanel key={chosen.session.dbId} tableId={selected!} sessionId={chosen.session.dbId} clients={chosen.session.clients} orders={chosen.orders} closureRequested={Boolean(chosen.session.closureRequestedAt)} serviceChargeEnabled={Boolean(chosen.session.serviceChargeEnabled)} onRequestCloseSession={charge=>requestCloseSession(selected!,charge)} onBack={()=>setSelected(null)}/> : <>
      {loading && <p role="status">Carregando pedidos...</p>}
      {Object.entries(sessions).filter(([number])=>Number(number)<0).map(([number,entry])=><section key={entry.session.dbId} className="space-y-3 rounded-xl border bg-card p-4"><div className="flex justify-between gap-2"><h2 className="font-semibold">{pickupLabel(Number(number))}</h2><span>{formatCurrency(getTableTotal(entry.orders))}</span></div><p>{entry.session.clients.map(client=>`${client.name}${client.phone ? ` · ${client.phone}` : ""}`).join(", ")}</p>
        {entry.orders.flatMap(client=>client.orders).map(order=><div key={order.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted p-3"><div className="space-y-1"><p>{order.items.map(item=>`${item.quantity}× ${item.name}`).join(", ")} · {statusLabels[order.status]} · <span className={minutesSince(order.placedAt)>=20?"text-destructive font-medium":"text-muted-foreground"}>há {minutesSince(order.placedAt)} min</span></p>{order.items.filter(item=>item.observation).map((item,i)=><p key={i} className="text-xs text-muted-foreground">Obs. {item.name}: {item.observation}</p>)}</div>{(order.status==="ready" || (kds.loaded && !kds.enabled && order.status!=="delivered")) && <Button size="sm" onClick={()=>void markDelivered(order.id)}>Confirmar retirada</Button>}</div>)}
        <Button variant="outline" onClick={()=>setSelected(Number(number))}>Pagamento e solicitação de encerramento</Button>{entry.session.closureRequestedAt && <p className="text-sm text-amber-500">Aguardando confirmação do Caixa</p>}
      </section>)}{!loading && !Object.keys(sessions).some(number=>Number(number)<0) && <p>Não há pedidos online com sessão ativa.</p>}
    </>}
  </main>;
}
