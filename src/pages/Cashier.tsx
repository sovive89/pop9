import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Wallet, Lock, ArrowLeft, LogOut } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useCurrentBusinessUnit } from "@/hooks/useCurrentBusinessUnit";
import { useUnitRoles } from "@/hooks/useUnitRoles";
import { useClosureQueue } from "@/hooks/useClosureQueue";
import { useSessionStore } from "@/hooks/useSessionStore";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import CloseAccountPanel from "@/components/CloseAccountPanel";
import { formatCurrency } from "@/utils/orders";

export default function Cashier() {
  const { user, signOut } = useAuth();
  const { businessUnitId, units } = useCurrentBusinessUnit();
  const { roles, canCashier, loading: rolesLoading, error: rolesError } = useUnitRoles();
  const navigate = useNavigate();
  const { queue, loading, error, more, reload, loadMore } = useClosureQueue(canCashier);
  const { sessions, requestCloseSession } = useSessionStore();
  const scope = `${user?.id}:${businessUnitId}`;
  const currentScope = useRef(scope); currentScope.current = scope;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [paymentTable, setPaymentTable] = useState<number | null>(null);
  const [password, setPassword] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const selected = queue.find(row => row.id === selectedId);
  const paymentSession = paymentTable !== null ? sessions[paymentTable] : undefined;
  useEffect(() => { setSelectedId(null); setPaymentTable(null); setPassword(""); setReason(""); setSubmitting(false); }, [businessUnitId, user?.id]);

  const approve = async () => {
    if (!selected || submitting) return;
    if (!password) { toast.error("Digite sua senha"); return; }
    if (selected.snapshot.remaining > 0 && reason.trim().length < 10) { toast.error("Informe uma justificativa de ao menos 10 caracteres"); return; }
    const requestScope = scope;
    setSubmitting(true);
    try {
      const { data, error: functionError } = await supabase.functions.invoke("close-session", {
        body: { session_id: selected.id, password, justification: reason.trim() || null },
      });
      if (currentScope.current !== requestScope) return;
      if (functionError || data?.error) {
        let message = data?.error ?? "Não foi possível confirmar o encerramento";
        if (functionError && "context" in functionError && functionError.context instanceof Response) {
          try { message = (await functionError.context.json()).error ?? message; } catch { /* fallback */ }
        }
        toast.error(message);
        reload();
        return;
      }
      if (!data?.closed) { toast.error("O servidor não confirmou o encerramento"); return; }
      toast.success(data.unpaidTotal > 0 ? "Mesa liberada. Pendência registrada em inadimplência." : "Comanda quitada. Mesa liberada!");
      setSelectedId(null); setReason(""); reload();
    } catch { if (currentScope.current === requestScope) toast.error("Falha de conexão ao encerrar a mesa"); }
    finally { if (currentScope.current === requestScope) { setPassword(""); setSubmitting(false); } }
  };

  if (rolesLoading) return <p className="p-6" role="status">Carregando caixa...</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (rolesError) return <p role="alert" className="p-6">Não foi possível verificar as permissões do caixa. Recarregue a página.</p>;
  if (!businessUnitId) return <p className="p-6">Selecione uma unidade para acessar o caixa.</p>;
  if (!canCashier) return <Navigate to="/" replace />;

  return <main className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="flex items-center gap-2 text-2xl font-semibold"><Wallet aria-hidden className="h-6 w-6" /> Caixa</h1><p className="text-sm text-muted-foreground">{units.find(unit => unit.id === businessUnitId)?.name} · Solicitações de encerramento</p></div>
      <div className="flex flex-wrap gap-2">
        {(roles.includes("attendant") || roles.includes("admin")) && <Button variant="outline" onClick={() => navigate("/")}><ArrowLeft className="mr-2 h-4 w-4" />Mesas</Button>}
        <Button variant="outline" onClick={() => navigate("/inadimplencia")}>Inadimplência</Button>
        <Button variant="outline" onClick={() => void signOut()}><LogOut className="mr-2 h-4 w-4" />Sair</Button>
      </div>
    </header>
    <p className="text-sm text-muted-foreground">A mesa fica ocupada até a confirmação com sua senha. Pendências de pagamento exigem justificativa e ficam registradas no relatório de inadimplência.</p>
    {loading && <p role="status">Atualizando solicitações...</p>}
    {error && <div role="alert">Não foi possível consultar as comandas. <Button onClick={reload}>Tentar novamente</Button></div>}
    {!loading && !error && queue.length === 0 && <p className="rounded-xl border p-6">Nenhuma solicitação de encerramento nesta unidade.</p>}
    <div className="grid gap-4 sm:grid-cols-2">{queue.map(row => <section key={row.id} className="space-y-3 rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between"><h2 className="text-xl font-semibold">Mesa {String(row.tableNumber).padStart(2, "0")}</h2><span className={row.snapshot.remaining > 0 ? "text-amber-500" : "text-emerald-500"}>{row.snapshot.remaining > 0 ? "Com pendências" : "Comanda quitada"}</span></div>
      <p className="text-xs text-muted-foreground">Solicitada em {new Date(row.requestedAt).toLocaleString("pt-BR")}</p>
      <dl className="grid grid-cols-2 gap-2 text-sm"><dt>Consumo e serviço</dt><dd className="text-right">{formatCurrency(row.snapshot.totalConsumed + row.snapshot.totalService)}</dd><dt>Pagamentos confirmados</dt><dd className="text-right">{formatCurrency(row.snapshot.totalPaid)}</dd><dt>Saldo pendente</dt><dd className="text-right font-semibold">{formatCurrency(row.snapshot.remaining)}</dd></dl>
      {row.snapshot.clients.map(client => <p key={client.id} className="text-sm">{client.name}: {client.remaining > 0 ? `pendente ${formatCurrency(client.remaining)}` : "quitado"}</p>)}
      {row.snapshot.openOrders > 0 && <p className="text-sm text-amber-500">{row.snapshot.openOrders} pedido(s) aguardando entrega ou cancelamento.</p>}
      <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={!sessions[row.tableNumber] || sessions[row.tableNumber].session.dbId !== row.id} onClick={() => setPaymentTable(row.tableNumber)}>Conferir pagamentos</Button><Button disabled={row.snapshot.openOrders > 0} onClick={() => { setSelectedId(row.id); setPassword(""); setReason(""); }}><Lock className="mr-2 h-4 w-4" />Encerrar com senha</Button></div>
    </section>)}</div>
    {more && <Button variant="outline" onClick={loadMore}>Carregar mais solicitações</Button>}
    <Dialog open={Boolean(selectedId)} onOpenChange={open => { if (!open && !submitting) { setSelectedId(null); setPassword(""); setReason(""); } }}>
      <DialogContent><DialogHeader><DialogTitle>Encerrar Mesa {selected?.tableNumber}</DialogTitle><DialogDescription>Confirme com a senha da sua conta de Caixa ou Administrador. A mesa será liberada após a aprovação.</DialogDescription></DialogHeader>
        {loading && <p role="status">Atualizando saldo...</p>}
        {selected && <><p>{selected.snapshot.remaining > 0 ? `Saldo pendente: ${formatCurrency(selected.snapshot.remaining)}` : "Comanda quitada"}</p>
          {selected.snapshot.remaining > 0 && <label className="space-y-2 text-sm">Justificativa da inadimplência<textarea aria-label="Justificativa da inadimplência" value={reason} onChange={event => setReason(event.target.value)} minLength={10} maxLength={1000} className="w-full rounded-md border bg-background p-3" /><span className="text-xs text-muted-foreground">Será registrada no relatório com o valor e os clientes envolvidos.</span></label>}
          <label className="space-y-2 text-sm">Sua senha<input aria-label="Sua senha" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} className="w-full rounded-md border bg-background p-3" onKeyDown={event => { if (event.key === "Enter") void approve(); }} /></label>
          <Button disabled={submitting || loading || selected.snapshot.openOrders > 0} onClick={() => void approve()}>{submitting ? "Confirmando..." : "Confirmar encerramento"}</Button></>}
        {!loading && !selected && <p>A solicitação foi atualizada ou encerrada. Feche esta janela e consulte a fila.</p>}
      </DialogContent>
    </Dialog>
    {paymentSession && paymentTable !== null && <CloseAccountPanel key={paymentSession.session.dbId} tableId={paymentTable} sessionId={paymentSession.session.dbId} clients={paymentSession.session.clients} orders={paymentSession.orders}
      closureRequested serviceChargeEnabled={paymentSession.session.serviceChargeEnabled}
      onRequestCloseSession={charge => requestCloseSession(paymentTable, charge)} onBack={() => { setPaymentTable(null); reload(); }} />}
  </main>;
}
