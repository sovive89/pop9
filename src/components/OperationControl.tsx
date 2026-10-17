import { useEffect, useRef, useState } from "react";
import { Power } from "lucide-react";
import { toast } from "sonner";
import { useUnitRoles } from "@/hooks/useUnitRoles";
import { useUnitOperation, setUnitOperation } from "@/hooks/useUnitOperation";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export default function OperationControl() {
  const operation = useUnitOperation();
  const { canCashier, loading: rolesLoading, error: rolesError } = useUnitRoles();
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const identity = useRef(operation.identity);identity.current = operation.identity;
  const mounted = useRef(true);
  const locked = useRef(false);
  useEffect(() => { mounted.current = true;return () => { mounted.current = false; }; }, []);
  const change = async (open: boolean) => {
    if (!operation.businessUnitId || !canCashier || rolesLoading || rolesError || operation.loading || operation.error || locked.current) return;
    const request = operation.identity;locked.current = true;setBusy(true);
    try {
      await setUnitOperation(operation.businessUnitId, open);
      if (!mounted.current || identity.current !== request) return;
      toast.success(open ? "Operação iniciada" : "Operação fechada");setConfirmation(null);await operation.reload();
    } catch (error) { if (mounted.current && identity.current === request) { toast.error(error instanceof Error ? error.message : "Não foi possível alterar a operação");await operation.reload(); } }
    finally { locked.current = false;if (mounted.current) setBusy(false); }
  };
  if (!operation.businessUnitId) return null;
  return <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3" aria-label="Controle da operação">
    <div><p className="flex items-center gap-2 text-sm font-semibold"><Power className="h-4 w-4" />{operation.loading ? "Consultando operação..." : operation.error ? "Estado da operação indisponível" : operation.open ? "Operação aberta" : "Operação fechada"}</p>
      {!operation.loading && !operation.error && <p className="mt-1 text-xs text-muted-foreground">{operation.open ? `${operation.activeSessions} comanda(s) aberta(s). Finalize todas no Caixa antes de fechar a operação.` : "Inicie a operação para receber novas mesas e pedidos."}</p>}
    </div>
    {operation.error ? <Button variant="outline" size="sm" onClick={() => void operation.reload()}>Atualizar operação</Button> : !rolesLoading && !rolesError && canCashier ? <Button size="sm" variant={operation.open ? "outline" : "default"} disabled={busy || operation.loading} onClick={() => operation.open ? setConfirmation(operation.identity) : void change(true)}>{busy ? "Aguarde..." : operation.open ? "Fechar operação" : "Iniciar operação"}</Button> : !operation.open && <p className="text-xs text-muted-foreground">Peça ao Administrador ou Caixa para iniciar.</p>}
    <AlertDialog open={confirmation === operation.identity} onOpenChange={open => { if (!open && !busy) setConfirmation(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Fechar operação?</AlertDialogTitle><AlertDialogDescription>Novas mesas e pedidos ficarão bloqueados até iniciar novamente. O fechamento só é permitido após encerrar todas as comandas no Caixa. O início, o fim e os responsáveis ficam registrados.</AlertDialogDescription></AlertDialogHeader>
      {operation.activeSessions > 0 && <div className="space-y-2"><p role="alert" className="text-sm text-amber-500">Ainda há {operation.activeSessions} comanda(s) aberta(s). Finalize-as no Caixa e atualize a operação.</p><Button variant="outline" size="sm" disabled={busy} onClick={() => void operation.reload()}>Atualizar comandas</Button></div>}
      <AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel><Button variant="destructive" disabled={busy || operation.loading || operation.error || operation.activeSessions > 0} onClick={() => void change(false)}>{busy ? "Fechando..." : "Confirmar fechamento"}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </section>;
}
