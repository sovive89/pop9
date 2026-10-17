import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCurrentBusinessUnit } from "@/hooks/useCurrentBusinessUnit";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/utils/orders";
import type { CheckoutSnapshot } from "@/utils/checkout";
import type { Tables } from "@/integrations/supabase/types";
import { buildCsv, downloadBlob } from "@/utils/fileExport";
const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
export default function DebtsReport() {
  const { user } = useAuth();
  const { businessUnitId } = useCurrentBusinessUnit();
  const [from, setFrom] = useState(() => localDate(new Date(new Date().getFullYear(),new Date().getMonth(),1)));
  const [to, setTo] = useState(() => localDate(new Date()));
  const [limit, setLimit] = useState(100);
  const [revision, setRevision] = useState(0);
  const key = `${user?.id}:${businessUnitId}:${from}:${to}:${limit}:${revision}`;
  const [state,setState] = useState<{key:string;rows:Tables<"session_closures">[];error:boolean;more:boolean}>({key:"",rows:[],error:false,more:false});
  const invalid = from > to;
  useEffect(() => {
    if (!user || !businessUnitId || invalid) return;
    let disposed = false;
    const end = new Date(`${to}T00:00:00`); end.setDate(end.getDate()+1);
    const load = async () => {
      const {data,error} = await supabase.from("session_closures").select("*").eq("business_unit_id",businessUnitId).gt("unpaid_total",0)
        .gte("closed_at",new Date(`${from}T00:00:00`).toISOString()).lt("closed_at",end.toISOString()).order("closed_at",{ascending:false}).order("id").limit(limit+1);
      if (!disposed) setState({key,rows:error ? [] : (data ?? []).slice(0,limit),error:Boolean(error),more:(data?.length ?? 0)>limit});
    };
    void load().catch(() => {if(!disposed)setState({key,rows:[],error:true,more:false});});
    return () => {disposed=true;};
  },[businessUnitId,from,invalid,key,limit,to,user]);
  const visible = Boolean(user && businessUnitId) && state.key===key && !invalid;
  const rows = visible ? state.rows : [];
  const exportCsv = () => {
    const lines: unknown[][] = [["Data de encerramento","Mesa","Cliente","Telefone","Saldo no encerramento","Justificativa","Autorizado por"]];
    for(const row of rows) for(const client of (row.snapshot as unknown as CheckoutSnapshot).clients.filter(client=>client.remaining>0))
      lines.push([new Date(row.closed_at).toLocaleString("pt-BR"),row.table_number,client.name,client.phone,client.remaining.toFixed(2),row.justification,row.closed_by_name]);
    downloadBlob(new Blob([buildCsv(lines)],{type:"text/csv;charset=utf-8"}),`inadimplencia-${from}-${to}.csv`);
  };
  return <section className="space-y-4">
    <div><h2 className="text-xl font-semibold">Relatório de inadimplência</h2><p className="text-sm text-muted-foreground">Comandas encerradas com saldo pendente e justificativa. Os valores representam o saldo registrado no encerramento.</p></div>
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-sm">De<input aria-label="Inadimplência de" type="date" value={from} onChange={e=>{if(e.target.value)setFrom(e.target.value);}} className="ml-2 rounded border bg-background p-2" /></label>
      <label className="text-sm">Até<input aria-label="Inadimplência até" type="date" value={to} onChange={e=>{if(e.target.value)setTo(e.target.value);}} className="ml-2 rounded border bg-background p-2" /></label>
      <Button variant="outline" onClick={()=>setRevision(n=>n+1)}>Atualizar</Button><Button variant="outline" disabled={!rows.length} onClick={exportCsv}>Exportar registros exibidos (CSV)</Button>
    </div>
    {invalid && <p role="alert">A data inicial deve ser anterior ou igual à final.</p>}
    {!businessUnitId && <p>Selecione uma unidade.</p>}
    {!visible && !invalid && businessUnitId && <p role="status">Carregando inadimplência...</p>}
    {visible && state.error && <p role="alert">Não foi possível consultar a inadimplência. Tente atualizar.</p>}
    {visible && !state.error && <p className="rounded-lg border p-3">{rows.length} comanda(s) exibida(s) · Saldo registrado: <strong>{formatCurrency(rows.reduce((sum,row)=>sum+Number(row.unpaid_total),0))}</strong></p>}
    {rows.map(row=><article key={row.id} className="space-y-2 rounded-xl border border-amber-500/30 bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Mesa {String(row.table_number).padStart(2,"0")}</h3><span className="font-semibold text-amber-500">{formatCurrency(Number(row.unpaid_total))}</span></div>
      <p className="text-xs text-muted-foreground">{new Date(row.closed_at).toLocaleString("pt-BR")} · Autorizado por {row.closed_by_name}</p>
      {(row.snapshot as unknown as CheckoutSnapshot).clients.filter(client=>client.remaining>0).map(client=><p key={client.id} className="text-sm">{client.name}{client.phone ? ` · ${client.phone}` : ""}: {formatCurrency(client.remaining)}</p>)}
      <p className="whitespace-pre-wrap text-sm"><strong>Justificativa:</strong> {row.justification}</p>
    </article>)}
    {visible && !state.error && rows.length===0 && <p>Nenhuma inadimplência registrada neste período.</p>}
    {visible && state.more && <Button onClick={()=>setLimit(n=>n+100)}>Carregar mais registros</Button>}
  </section>;
}
