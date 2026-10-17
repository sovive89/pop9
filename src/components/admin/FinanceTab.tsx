import { useState } from "react";
import { Link } from "react-router-dom";
import { Banknote } from "lucide-react";
import { Button } from "@/components/ui/button";
import WasteSection from "@/components/admin/WasteSection";
import { useOperationalReportData } from "@/hooks/useOperationalReportData";
import { useCurrentBusinessUnit } from "@/hooks/useCurrentBusinessUnit";
import { formatCurrency } from "@/utils/orders";

/** Only confirmed receipts from the active unit; no seeded financial figures. */
export default function FinanceTab() {
  const { businessUnitId, units } = useCurrentBusinessUnit();
  const [period, setPeriod] = useState(() => {
    const end = new Date();
    return { start: new Date(end.getFullYear(), end.getMonth(), 1), end };
  });
  const { payments, orders, loading, error, reload } = useOperationalReportData(period.start, period.end);
  const received = payments.reduce((total, payment) => total + Number(payment.amount), 0);
  const service = payments.reduce((total, payment) => total + Number(payment.service_charge), 0);
  return <section className="space-y-6">
    <div><h2 className="flex items-center gap-2 text-lg font-semibold"><Banknote className="h-5 w-5 text-primary" />Financeiro</h2>
      <p className="text-sm text-muted-foreground">{units.find(unit => unit.id === businessUnitId)?.name} · Mês atual até {period.end.toLocaleString("pt-BR")}</p></div>
    <Button variant="outline" onClick={() => { setPeriod(current => ({ ...current, end: new Date() })); reload(); }}>Atualizar financeiro</Button>
    {loading ? <p role="status">Carregando financeiro...</p> : error ? <p role="alert">Não foi possível carregar os dados financeiros. Tente atualizar.</p> : <>
      <div className="grid gap-3 sm:grid-cols-3">{[
        { label: "Recebimentos confirmados", value: formatCurrency(received) },
        { label: "Serviço recebido", value: formatCurrency(service) },
        { label: "Pedidos no período", value: String(orders.length) },
      ].map(kpi => <div key={kpi.label} className="rounded-lg border bg-card p-4"><p className="text-xs text-muted-foreground">{kpi.label}</p><p className="text-xl font-semibold">{kpi.value}</p></div>)}</div>
      {!payments.length && <p>Nenhum pagamento confirmado nesta unidade no período.</p>}
      <Button variant="outline" asChild><Link to="/relatorios">Consultar vendas e pagamentos</Link></Button>
    </>}
    <WasteSection />
  </section>;
}
