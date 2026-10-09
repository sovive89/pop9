import {useEffect,useState} from "react";
import {Navigate,Link} from "react-router-dom";
import {useAuth} from "@/hooks/useAuth";
import {useUnitRoles} from "@/hooks/useUnitRoles";
import {useSessionStore} from "@/hooks/useSessionStore";
import {useCurrentBusinessUnit} from "@/hooks/useCurrentBusinessUnit";
import CloseAccountPanel from "@/components/CloseAccountPanel";
import {Button} from "@/components/ui/button";
import {getTableTotal,formatCurrency,statusLabels} from "@/utils/orders";
import {pickupLabel} from "@/utils/operationalLinks";
export default function OnlineOrders(){
  const {user}=useAuth();const {businessUnitId}=useCurrentBusinessUnit();const {roles,loading:rolesLoading,error}=useUnitRoles();
  const {sessions,loading,reload,markDelivered,requestCloseSession}=useSessionStore();const [selected,setSelected]=useState<number|null>(null);
  useEffect(()=>{setSelected(null);},[businessUnitId,user?.id]);
  const allowed=roles.some(role=>["admin","attendant","cashier"].includes(role));
  if(!user)return <Navigate to="/login" replace/>;if(rolesLoading)return <p>Verificando acesso...</p>;if(error)return <p role="alert">Não foi possível verificar o acesso.</p>;if(!allowed)return <Navigate to="/" replace/>;
  if(!businessUnitId)return <p>Selecione a unidade.</p>;
  const chosen=selected!==null ? sessions[selected] : null;
  return <main className="mx-auto max-w-5xl space-y-4 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-semibold">Pedidos online — retirada</h1><div className="flex gap-3"><Link to="/">Atendimento</Link><Link to="/caixa">Caixa</Link><Button variant="outline" onClick={()=>void reload()}>Atualizar</Button></div></div><p className="text-sm text-muted-foreground">Pedidos do PWA entram na cozinha. Após a retirada, marque como entregue, registre o pagamento e solicite o encerramento ao Caixa.</p>
    {chosen ? <CloseAccountPanel key={chosen.session.dbId} tableId={selected!} sessionId={chosen.session.dbId} clients={chosen.session.clients} orders={chosen.orders} closureRequested={Boolean(chosen.session.closureRequestedAt)} serviceChargeEnabled={Boolean(chosen.session.serviceChargeEnabled)} onRequestCloseSession={charge=>requestCloseSession(selected!,charge)} onBack={()=>setSelected(null)}/> : <>
      {loading && <p role="status">Carregando pedidos...</p>}
      {Object.entries(sessions).filter(([number])=>Number(number)<0).map(([number,entry])=><section key={entry.session.dbId} className="space-y-3 rounded-xl border bg-card p-4"><div className="flex justify-between gap-2"><h2 className="font-semibold">{pickupLabel(Number(number))}</h2><span>{formatCurrency(getTableTotal(entry.orders))}</span></div><p>{entry.session.clients.map(client=>`${client.name}${client.phone ? ` · ${client.phone}` : ""}`).join(", ")}</p>
        {entry.orders.flatMap(client=>client.orders).map(order=><div key={order.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted p-3"><p>{order.items.map(item=>`${item.quantity}× ${item.name}`).join(", ")} · {statusLabels[order.status]}</p>{order.status==="ready" && <Button size="sm" onClick={()=>void markDelivered(order.id)}>Confirmar retirada</Button>}</div>)}
        <Button variant="outline" onClick={()=>setSelected(Number(number))}>Pagamento e solicitação de encerramento</Button>{entry.session.closureRequestedAt && <p className="text-sm text-amber-500">Aguardando confirmação do Caixa</p>}
      </section>)}{!loading && !Object.keys(sessions).some(number=>Number(number)<0) && <p>Não há pedidos online com sessão ativa.</p>}
    </>}
  </main>;
}
