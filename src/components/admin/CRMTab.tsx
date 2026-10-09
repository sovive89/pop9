import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentBusinessUnit } from "@/hooks/useCurrentBusinessUnit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type Visit = { id: string; customer_id: string | null; name: string; phone: string | null; email: string | null; added_at: string };
type Order = { id: string; client_id: string | null; placed_at: string; total: number | null; status: string };
type Customer = { key: string; name: string; phone: string | null; email: string | null; visits: Set<string>; orders: number; total: number; last: string; first: string };
const money = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const date = (v: string) => new Date(v).toLocaleDateString("pt-BR");
const csvCell = (v: string | number) => '"' + String(v).replace(/"/g, '""') + '"';

export default function CRMTab() {
  const { businessUnitId } = useCurrentBusinessUnit();
  const [visits, setVisits] = useState<Visit[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState("all");
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true); setError("");
      if (!businessUnitId) { setLoading(false); return; }
      const [c, o] = await Promise.all([
        supabase.from("session_clients").select("id,customer_id,name,phone,email,added_at,session_id").eq("business_unit_id", businessUnitId).order("added_at", { ascending: false }).limit(5000),
        supabase.from("orders").select("id,client_id,placed_at,total,status").eq("business_unit_id", businessUnitId).neq("status", "cancelled").order("placed_at", { ascending: false }).limit(5000),
      ]);
      if (cancelled) return;
      if (c.error || o.error) { setError(c.error?.message || o.error?.message || "Erro ao carregar CRM"); toast.error("Não foi possível carregar os dados do CRM"); }
      else { setVisits((c.data || []) as Visit[]); setOrders((o.data || []) as Order[]); }
      setLoading(false);
    }
    void load();
    return () => { cancelled = true; };
  }, [businessUnitId]);

  const cutoff = useMemo(() => {
    if (period === "all") return 0;
    return Date.now() - Number(period) * 86400000;
  }, [period]);
  const report = useMemo(() => {
    const grouped = new Map<string, Customer>();
    const visitKeys = new Map<string, string>();
    for (const v of visits) {
      // Prefer stable customer ID; use normalized phone for repeat visits when ID is absent.
      const phone = v.phone?.replace(/\D/g, "") || "";
      const key = v.customer_id ? "id:" + v.customer_id : phone.length >= 10 ? "phone:" + phone : "visit:" + v.id;
      visitKeys.set(v.id, key);
      if (!grouped.has(key)) grouped.set(key, { key, name: v.name, phone: v.phone, email: v.email, visits: new Set(), orders: 0, total: 0, first: v.added_at, last: v.added_at });
      const customer = grouped.get(key)!;
      customer.visits.add(v.id);
      if (v.added_at > customer.last) { customer.last = v.added_at; customer.name = v.name; }
      if (v.added_at < customer.first) customer.first = v.added_at;
    }
    for (const o of orders) {
      const key = o.client_id ? visitKeys.get(o.client_id) : undefined;
      const c = key ? grouped.get(key) : undefined;
      if (!c || new Date(o.placed_at).getTime() < cutoff) continue;
      c.orders += 1;
      c.total += Number(o.total || 0);
    }
    return [...grouped.values()].filter(c => cutoff === 0 || new Date(c.last).getTime() >= cutoff || c.orders > 0).sort((a, b) => b.total - a.total);
  }, [visits, orders, cutoff]);
  const filtered = report.filter(c => (c.name + " " + (c.phone || "") + " " + (c.email || "")).toLowerCase().includes(search.toLowerCase()));
  const total = report.reduce((sum, c) => sum + c.total, 0);
  const orderCount = report.reduce((sum, c) => sum + c.orders, 0);
  const inactive = report.filter(c => Date.now() - new Date(c.last).getTime() >= 30 * 86400000).length;
  function exportCsv() {
    const rows = [["Cliente", "Telefone", "Email", "Visitas", "Pedidos", "Total (R$)", "Ticket medio (R$)", "Ultima visita"], ...filtered.map(c => [c.name, c.phone || "", c.email || "", c.visits.size, c.orders, c.total.toFixed(2), c.orders ? (c.total / c.orders).toFixed(2) : "0.00", date(c.last)])];
    const csv = "\uFEFF" + rows.map(row => row.map(csvCell).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "pop9-crm-" + new Date().toISOString().slice(0, 10) + ".csv"; a.click(); URL.revokeObjectURL(url);
  }
  if (loading) return <p className="text-sm text-muted-foreground py-8">Carregando CRM...</p>;
  return <div className="space-y-5">
    <div><h2 className="text-xl font-semibold">CRM — Relatórios por cliente</h2><p className="text-sm text-muted-foreground">Histórico individual de consumo e relacionamento. Valores baseados nos pedidos não cancelados, não nos pagamentos conciliados.</p></div>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {([["Clientes identificados", report.length], ["Pedidos vinculados", orderCount], ["Consumo vinculado", money(total)], ["Sem visita há 30 dias", inactive]] as const).map(([label, value]) => <div key={label} className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-semibold mt-1">{value}</p></div>)}
    </div>
    <div className="flex flex-wrap gap-2 items-center">
      <Input className="max-w-xs" placeholder="Buscar cliente ou telefone" value={search} onChange={e => setSearch(e.target.value)} />
      <select className="rounded-md border bg-background p-2 text-sm" value={period} onChange={e => setPeriod(e.target.value)} aria-label="Período do CRM"><option value="all">Todo o histórico</option><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option><option value="365">Últimos 12 meses</option></select>
      <Button variant="outline" onClick={exportCsv}>Exportar CSV</Button>
    </div>
    <div className="overflow-x-auto rounded-xl border"><table className="w-full text-sm text-left"><thead className="bg-muted/40"><tr>{["Cliente", "Telefone", "Visitas", "Pedidos", "Consumo", "Ticket médio", "Última visita"].map(x => <th key={x} className="p-3 whitespace-nowrap">{x}</th>)}</tr></thead><tbody>{filtered.map(c => <tr key={c.key} className="border-t"><td className="p-3">{c.name}</td><td className="p-3">{c.phone || "—"}</td><td className="p-3">{c.visits.size}</td><td className="p-3">{c.orders}</td><td className="p-3">{money(c.total)}</td><td className="p-3">{money(c.orders ? c.total / c.orders : 0)}</td><td className="p-3">{date(c.last)}</td></tr>)}</tbody></table>{filtered.length === 0 && <p className="p-6 text-center text-muted-foreground">Nenhum cliente encontrado. Os indicadores serão preenchidos conforme os atendimentos forem registrados.</p>}</div>
    <p className="text-xs text-muted-foreground">Identificação: cadastro de cliente ou telefone; sem ambos, cada atendimento é contado separadamente. Limite atual de consulta: 5.000 registros por fonte. Valores de pedidos sem cliente vinculado não entram neste relatório.</p>
  </div>;
}
