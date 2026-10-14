import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Banknote, Camera, Lightbulb, Trash2, TrendingUp } from "lucide-react";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Input } from "@/components/ui/input";
import { PAGE_HELP } from "@/lib/page-help";
import { breakEven, fixedCostPerUnit, monthlyFixedCosts, suggestPrice, type FixedCost } from "@/lib/finance";
import { MENU_CLASS_LABEL, buildInsights, classifyMenu, forecastDaily, itemEconomics, sampleData, type MenuClass } from "@/lib/insights";
import { formatCurrency } from "@/utils/orders";

const SAMPLE_FIXED: FixedCost[] = [
  { name: "Aluguel", amount: 6500, period: "monthly", category: "aluguel" },
  { name: "Folha fixa", amount: 14000, period: "monthly", category: "folha" },
  { name: "Energia e água", amount: 2600, period: "monthly", category: "energia" },
  { name: "Contabilidade", amount: 3600, period: "yearly", category: "contabilidade" },
  { name: "Sistemas", amount: 900, period: "quarterly", category: "sistemas" },
];
const LEVEL_STYLE = { alerta: "border-destructive/50 bg-destructive/10", atencao: "border-amber-500/50 bg-amber-500/10", oportunidade: "border-emerald-500/50 bg-emerald-500/10", info: "border-border bg-secondary/40" } as const;
const pct = (n: number | null) => (n == null ? "—" : `${(n * 100).toFixed(1)}%`);


const CLASS_STYLE: Record<MenuClass, string> = {
  estrela: "bg-emerald-500/15 text-emerald-600", cavalo: "bg-amber-500/15 text-amber-600",
  "quebra-cabeca": "bg-sky-500/15 text-sky-600", abacaxi: "bg-destructive/15 text-destructive",
};
const NEXT_STEP: Record<MenuClass, string> = {
  estrela: "Proteja: mantenha a ficha e o destaque no cardápio.",
  cavalo: "Revise a ficha ou reajuste o preço: vende muito, mas deixa pouco.",
  "quebra-cabeca": "Divulgue: foto melhor, posição de destaque e sugestão no pedido.",
  abacaxi: "Reveja preço e receita, ou considere retirar do cardápio.",
};

/** Item como card: cardápio (foto/preço) ↔ ficha (custo) ↔ desperdício, com atalhos para cada módulo. */
function ItemCard({ row, targetCmv, suggested }: { row: ReturnType<typeof classifyMenu>[number]; targetCmv: number; suggested: number | null }) {
  const { item, cls } = row;
  const e = itemEconomics(item);
  const realCmv = e.realCmv ?? 0;
  const over = realCmv > targetCmv / 100;
  const bar = Math.min(100, realCmv * 100);
  return (
    <article className="overflow-hidden rounded-xl border border-border bg-card" aria-label={item.name}>
      <div className="relative flex h-28 items-center justify-center bg-secondary/40">
        {item.imageUrl
          ? <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" loading="lazy" />
          : <span className="text-5xl" aria-hidden>{item.emoji ?? "🍽️"}</span>}
        <span className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-xs font-medium ${CLASS_STYLE[cls]}`} title={MENU_CLASS_LABEL[cls]}>{MENU_CLASS_LABEL[cls].split(" (")[0]}</span>
        {!item.imageUrl && (
          <Link to="/admin?sec=menu" className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-background/90 px-2 py-1 text-xs hover:bg-background" title="Item sem foto: adicione uma no cardápio (a IA pode sugerir)">
            <Camera className="h-3 w-3" aria-hidden /> Sugerir foto
          </Link>
        )}
      </div>
      <div className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <div><h4 className="font-semibold leading-tight">{item.name}</h4><p className="text-xs text-muted-foreground">{item.category ?? "Sem categoria"} · {item.units} vendidos</p></div>
          <div className="text-right"><div className="font-semibold">{formatCurrency(item.price)}</div><div className="text-xs text-muted-foreground">custo {formatCurrency(item.cost)}</div></div>
        </div>
        <div>
          <div className="mb-1 flex justify-between text-xs"><span>CMV real</span><span className={over ? "font-medium text-destructive" : ""}>{pct(e.realCmv)} <span className="text-muted-foreground">(meta {targetCmv}%)</span></span></div>
          <div className="h-2 rounded-full bg-secondary" role="img" aria-label={`CMV real ${pct(e.realCmv)}`}>
            <div className={`h-2 rounded-full ${over ? "bg-destructive" : "bg-emerald-500"}`} style={{ width: `${bar}%` }} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-md bg-secondary/40 p-2"><div className="text-muted-foreground">Lucro/un. após perdas</div><div className="font-medium">{formatCurrency(e.realMargin)}</div></div>
          <div className={`rounded-md p-2 ${e.wasteRate >= 0.08 ? "bg-destructive/10" : "bg-secondary/40"}`}>
            <div className="flex items-center gap-1 text-muted-foreground"><Trash2 className="h-3 w-3" aria-hidden /> Desperdício</div>
            <div className="font-medium">{(e.wasteRate * 100).toFixed(0)}% · {formatCurrency(e.wasteCost)}</div>
          </div>
        </div>
        {item.wasteReason && <p className="text-xs text-muted-foreground">Causa informada: {item.wasteReason}</p>}
        <p className="text-xs">{suggested != null && suggested > item.price ? <>Preço sugerido <strong>{formatCurrency(suggested)}</strong> para o lucro desejado. </> : null}{NEXT_STEP[cls]}</p>
        <div className="flex gap-3 border-t border-border pt-2 text-xs">
          <Link className="text-primary hover:underline" to="/admin?sec=menu">Ver no cardápio</Link>
          <Link className="text-primary hover:underline" to="/admin?sec=stock">Ficha e insumos</Link>
        </div>
      </div>
    </article>
  );
}

/** Painel financeiro. Por enquanto roda com dados de AMOSTRA (nada vem do banco e nada é gravado). */
export default function FinanceTab() {
  const { history, items } = useMemo(sampleData, []);
  const [targetCmv, setTargetCmv] = useState(30);
  const [profit, setProfit] = useState(15);
  const fixed = useMemo(() => monthlyFixedCosts(SAMPLE_FIXED), []);
  const forecast = useMemo(() => forecastDaily(history, 14), [history]);
  const rows = useMemo(() => classifyMenu(items), [items]);
  const revenue = rows.reduce((s, r) => s + r.item.price * r.item.units, 0);
  const cost = rows.reduce((s, r) => s + r.item.cost * r.item.units, 0);
  const units = rows.reduce((s, r) => s + r.item.units, 0);
  const avgPrice = units ? revenue / units : 0;
  const perUnitFixed = fixedCostPerUnit(fixed.total, units) ?? 0;
  const be = breakEven({ fixedCosts: fixed.total, price: avgPrice, variableCost: units ? cost / units : 0, deductions: [0.04, 0.02] });
  const insights = useMemo(() => buildInsights({ items, targetCmv: targetCmv / 100, monthlyFixed: fixed.total, forecast, history, breakEvenRevenue: be?.revenue ?? null }), [items, targetCmv, fixed.total, forecast, history, be?.revenue]);
  const chart = [
    ...history.slice(-21).map((v, i) => ({ label: `D-${21 - i}`, real: v })),
    ...(forecast ?? []).map((p) => ({ label: `+${p.day}`, previsto: p.value, faixa: [p.low, p.high] as [number, number] })),
  ];
  const kpis = [
    { label: "Faturamento (amostra)", value: formatCurrency(revenue) },
    { label: "CMV geral", value: pct(revenue ? cost / revenue : null) },
    { label: "Custos fixos/mês", value: formatCurrency(fixed.total) },
    { label: "Desperdício (R$)", value: formatCurrency(items.reduce((a, i) => a + itemEconomics(i).wasteCost, 0)) },
    { label: "Equilíbrio/mês", value: be ? formatCurrency(be.revenue) : "—" },
  ];

  return (
    <section className="space-y-6">
      <div>
        <h2 tabIndex={0} data-tooltip={PAGE_HELP["finance"]} className="flex items-center gap-2 text-lg font-semibold"><Banknote className="h-5 w-5 text-primary" aria-hidden /> Financeiro</h2>
        <p role="status" className="mt-1 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm">Dados de amostra para demonstração. Nada aqui vem do seu banco nem altera preços ou estoque.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-lg border border-border bg-card p-3">
            <div className="text-xs text-muted-foreground">{k.label}</div>
            <div className="text-lg font-semibold">{k.value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-border bg-card p-3">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><TrendingUp className="h-4 w-4" aria-hidden /> Faturamento diário: últimos 21 dias e previsão de 14</h3>
        {forecast ? (
          <div className="h-64" role="img" aria-label="Gráfico de faturamento diário real e previsto">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={3} />
                <YAxis tick={{ fontSize: 10 }} width={48} />
                <Tooltip formatter={(v) => (Array.isArray(v) ? `${formatCurrency(Number(v[0]))} a ${formatCurrency(Number(v[1]))}` : formatCurrency(Number(v)))} />
                <Area dataKey="faixa" name="Faixa (80%)" stroke="none" fill="hsl(var(--primary))" fillOpacity={0.15} />
                <Line dataKey="real" name="Real" stroke="hsl(var(--foreground))" dot={false} strokeWidth={2} />
                <Line dataKey="previsto" name="Previsto" stroke="hsl(var(--primary))" strokeDasharray="5 3" dot={false} strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : <p className="text-sm text-muted-foreground">São necessárias pelo menos 3 semanas de vendas para prever.</p>}
        <p className="mt-2 text-xs text-muted-foreground">Previsão estatística (padrão semanal + tendência): orienta, não garante.</p>
      </div>

      <div className="rounded-lg border border-border bg-card p-3">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Lightbulb className="h-4 w-4" aria-hidden /> Insights</h3>
        <label className="mb-3 flex items-center gap-2 text-sm">Meta de CMV (%)
          <Input type="number" min={5} max={80} value={targetCmv} onChange={(e) => setTargetCmv(Math.min(80, Math.max(5, Number(e.target.value) || 30)))} className="h-8 w-20" aria-label="Meta de CMV em porcentagem" />
        </label>
        <ul className="space-y-2">
          {insights.map((i, n) => (
            <li key={n} className={`rounded-md border px-3 py-2 text-sm ${LEVEL_STYLE[i.level]}`}>
              <div className="flex items-center gap-2 font-medium">{i.level === "alerta" && <AlertTriangle className="h-4 w-4" aria-hidden />}{i.title}</div>
              <div className="text-muted-foreground">{i.detail}</div>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Itens do cardápio: preço, ficha e desperdício</h3>
          <label className="flex items-center gap-2 text-sm">Lucro desejado (%)
            <Input type="number" min={0} max={60} value={profit} onChange={(e) => setProfit(Math.min(60, Math.max(0, Number(e.target.value) || 0)))} className="h-8 w-20" aria-label="Lucro desejado em porcentagem" />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[...rows].sort((x, y) => itemEconomics(y.item).wasteCost - itemEconomics(x.item).wasteCost).map((r) => (
            <ItemCard key={r.item.name} row={r} targetCmv={targetCmv}
              suggested={suggestPrice({ cost: r.item.cost, fixedPerUnit: perUnitFixed, deductions: [0.06], targetProfit: profit / 100 })?.price ?? null} />
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Preço sugerido cobre custo, custos fixos rateados ({formatCurrency(perUnitFixed)} por unidade), 6% de impostos/taxas e o lucro desejado. Ordenado por maior perda financeira.</p>
      </div>
    </section>
  );
}
