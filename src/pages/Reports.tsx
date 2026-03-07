import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Flame, ArrowLeft, TrendingUp, ShoppingBag, BarChart3, CalendarIcon, DollarSign, Package, Hash, CreditCard, Banknote, Smartphone, Wallet, Thermometer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line } from "recharts";

type PeriodPreset = "today" | "week" | "month" | "custom";

interface OrderItemData {
  name: string;
  price: number;
  quantity: number;
  destination: string;
  menu_item_id: string;
}

interface OrderData {
  id: string;
  placed_at: string;
  status: string;
  order_items: OrderItemData[];
}

interface PaymentData {
  id: string;
  amount: number;
  service_charge: number;
  method: string;
  paid_at: string;
}

const CHART_COLORS = [
  "hsl(32, 95%, 52%)",
  "hsl(16, 80%, 50%)",
  "hsl(142, 70%, 45%)",
  "hsl(200, 70%, 50%)",
  "hsl(280, 60%, 55%)",
  "hsl(50, 90%, 50%)",
  "hsl(340, 70%, 50%)",
  "hsl(170, 60%, 45%)",
];

const DAY_NAMES = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

const Reports = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [preset, setPreset] = useState<PeriodPreset>("today");
  const [dateFrom, setDateFrom] = useState<Date>(startOfDay(new Date()));
  const [dateTo, setDateTo] = useState<Date>(endOfDay(new Date()));
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [payments, setPayments] = useState<PaymentData[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle()
      .then(({ data }) => setIsAdmin(!!data));
  }, [user]);

  const applyPreset = useCallback((p: PeriodPreset) => {
    setPreset(p);
    const now = new Date();
    if (p === "today") {
      setDateFrom(startOfDay(now));
      setDateTo(endOfDay(now));
    } else if (p === "week") {
      setDateFrom(startOfWeek(now, { weekStartsOn: 1 }));
      setDateTo(endOfWeek(now, { weekStartsOn: 1 }));
    } else if (p === "month") {
      setDateFrom(startOfMonth(now));
      setDateTo(endOfMonth(now));
    }
  }, []);

  const fetchOrders = useCallback(async () => {
    setLoadingData(true);
    const { data, error } = await supabase
      .from("orders")
      .select("id, placed_at, status, order_items(name, price, quantity, destination, menu_item_id)")
      .gte("placed_at", dateFrom.toISOString())
      .lte("placed_at", dateTo.toISOString())
      .in("status", ["pending", "preparing", "ready", "delivered"])
      .order("placed_at", { ascending: true });

    if (!error && data) {
      setOrders(data as OrderData[]);
    }

    // Fetch payments
    const { data: payData } = await supabase
      .from("payments")
      .select("id, amount, service_charge, method, paid_at")
      .gte("paid_at", dateFrom.toISOString())
      .lte("paid_at", dateTo.toISOString())
      .order("paid_at", { ascending: true });

    if (payData) {
      setPayments(payData as PaymentData[]);
    }

    setLoadingData(false);
  }, [dateFrom, dateTo]);

  useEffect(() => {
    if (user && isAdmin) fetchOrders();
  }, [user, isAdmin, fetchOrders]);

  // ── Computed metrics ──
  const totalRevenue = useMemo(() => {
    return orders.reduce((sum, o) =>
      sum + o.order_items.reduce((s, i) => s + i.price * i.quantity, 0), 0);
  }, [orders]);

  const totalItems = useMemo(() => {
    return orders.reduce((sum, o) =>
      sum + o.order_items.reduce((s, i) => s + i.quantity, 0), 0);
  }, [orders]);

  const totalOrders = orders.length;

  const avgTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  // ── Top items ──
  const topItems = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const o of orders) {
      for (const i of o.order_items) {
        const existing = map.get(i.menu_item_id) || { name: i.name, qty: 0, revenue: 0 };
        existing.qty += i.quantity;
        existing.revenue += i.price * i.quantity;
        map.set(i.menu_item_id, existing);
      }
    }
    return Array.from(map.values()).sort((a, b) => b.qty - a.qty).slice(0, 10);
  }, [orders]);

  // ── By category (destination) ──
  const byCategory = useMemo(() => {
    const map = new Map<string, { name: string; revenue: number; qty: number }>();
    for (const o of orders) {
      for (const i of o.order_items) {
        const cat = i.destination || "outros";
        const existing = map.get(cat) || { name: cat, revenue: 0, qty: 0 };
        existing.revenue += i.price * i.quantity;
        existing.qty += i.quantity;
        map.set(cat, existing);
      }
    }
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [orders]);

  // ── Revenue over time ──
  const revenueOverTime = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of orders) {
      const dayKey = format(new Date(o.placed_at), "dd/MM");
      const rev = o.order_items.reduce((s, i) => s + i.price * i.quantity, 0);
      map.set(dayKey, (map.get(dayKey) || 0) + rev);
    }
    return Array.from(map.entries()).map(([date, revenue]) => ({ date, revenue }));
  }, [orders]);

  // ── Payments by method ──
  const METHOD_LABELS: Record<string, string> = { dinheiro: "Dinheiro", cartao: "Cartão", pix: "Pix" };
  const METHOD_ICONS: Record<string, React.ComponentType<any>> = { dinheiro: Banknote, cartao: CreditCard, pix: Smartphone };

  const paymentsByMethod = useMemo(() => {
    const map = new Map<string, { method: string; label: string; total: number; count: number; serviceCharge: number }>();
    for (const p of payments) {
      const existing = map.get(p.method) || { method: p.method, label: METHOD_LABELS[p.method] || p.method, total: 0, count: 0, serviceCharge: 0 };
      existing.total += Number(p.amount) + Number(p.service_charge);
      existing.serviceCharge += Number(p.service_charge);
      existing.count += 1;
      map.set(p.method, existing);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [payments]);

  const totalPayments = useMemo(() => payments.reduce((s, p) => s + Number(p.amount) + Number(p.service_charge), 0), [payments]);
  const totalServiceCharges = useMemo(() => payments.reduce((s, p) => s + Number(p.service_charge), 0), [payments]);

  // ── Mapa de calor: pedidos por dia da semana (0=Seg) e hora (0-23) ──
  const { heatMapGrid, heatMapMax } = useMemo(() => {
    const grid = new Map<string, { count: number; revenue: number }>();
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        grid.set(`${d}-${h}`, { count: 0, revenue: 0 });
      }
    }
    for (const o of orders) {
      const date = new Date(o.placed_at);
      const day = (date.getDay() + 6) % 7; // 0 = Segunda
      const hour = date.getHours();
      const key = `${day}-${hour}`;
      const rev = o.order_items.reduce((s, i) => s + i.price * i.quantity, 0);
      const cell = grid.get(key)!;
      cell.count += 1;
      cell.revenue += rev;
    }
    let max = 0;
    grid.forEach((v) => { if (v.count > max) max = v.count; });
    return { heatMapGrid: grid, heatMapMax: max || 1 };
  }, [orders]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Flame className="h-10 w-10 animate-pulse text-primary" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (isAdmin === false) return <Navigate to="/" replace />;
  if (isAdmin === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Flame className="h-10 w-10 animate-pulse text-primary" />
      </div>
    );
  }

  const formatCurrency = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-lg border border-border bg-card p-3 shadow-lg">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} className="text-sm text-muted-foreground">
            {p.name === "revenue" ? "Faturamento" : p.name}: {" "}
            <span className="font-semibold text-primary">
              {typeof p.value === "number" && p.name === "revenue"
                ? formatCurrency(p.value)
                : p.value}
            </span>
          </p>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="sticky top-0 z-10 border-b border-border bg-card/80 backdrop-blur-md px-4 py-3"
      >
        <div className="mx-auto flex max-w-7xl items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
              <BarChart3 className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl text-foreground leading-none font-bold">Relatórios</h1>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Vendas & Métricas</p>
            </div>
          </div>
        </div>
      </motion.header>

      <main className="mx-auto max-w-7xl p-4 space-y-6">
        {/* Period filters */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex flex-wrap items-center gap-2"
        >
          {([
            { key: "today" as const, label: "Hoje" },
            { key: "week" as const, label: "Semana" },
            { key: "month" as const, label: "Mês" },
          ]).map(({ key, label }) => (
            <Button
              key={key}
              variant={preset === key ? "default" : "outline"}
              size="sm"
              onClick={() => applyPreset(key)}
            >
              {label}
            </Button>
          ))}

          <div className="flex items-center gap-2 ml-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <CalendarIcon className="h-4 w-4" />
                  {format(dateFrom, "dd/MM/yyyy")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dateFrom}
                  onSelect={(d) => { if (d) { setDateFrom(startOfDay(d)); setPreset("custom"); } }}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
            <span className="text-muted-foreground text-sm">até</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <CalendarIcon className="h-4 w-4" />
                  {format(dateTo, "dd/MM/yyyy")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dateTo}
                  onSelect={(d) => { if (d) { setDateTo(endOfDay(d)); setPreset("custom"); } }}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>
        </motion.div>

        {loadingData ? (
          <div className="flex items-center justify-center py-20">
            <Flame className="h-8 w-8 animate-pulse text-primary" />
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="grid grid-cols-2 md:grid-cols-4 gap-4"
            >
              {[
                { label: "Faturamento", value: formatCurrency(totalRevenue), icon: DollarSign, color: "text-primary" },
                { label: "Pedidos", value: totalOrders.toString(), icon: ShoppingBag, color: "text-accent" },
                { label: "Itens vendidos", value: totalItems.toString(), icon: Package, color: "text-success" },
                { label: "Ticket médio", value: formatCurrency(avgTicket), icon: TrendingUp, color: "text-primary" },
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className={cn("h-4 w-4", color)} />
                    <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
                  </div>
                  <p className="text-2xl font-bold text-foreground">{value}</p>
                </div>
              ))}
            </motion.div>

            {/* Revenue over time */}
            {revenueOverTime.length > 1 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="rounded-xl border border-border bg-card p-4"
              >
                <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Faturamento por dia
                </h3>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={revenueOverTime}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(30, 8%, 20%)" />
                    <XAxis dataKey="date" tick={{ fill: "hsl(30, 10%, 55%)", fontSize: 12 }} />
                    <YAxis tick={{ fill: "hsl(30, 10%, 55%)", fontSize: 12 }} tickFormatter={(v) => `R$${v}`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Line type="monotone" dataKey="revenue" stroke="hsl(32, 95%, 52%)" strokeWidth={2} dot={{ fill: "hsl(32, 95%, 52%)" }} />
                  </LineChart>
                </ResponsiveContainer>
              </motion.div>
            )}

            {/* Mapa de calor: pedidos por dia da semana x hora */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.32 }}
              className="rounded-xl border border-border bg-card p-4"
            >
              <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                <Thermometer className="h-4 w-4 text-primary" />
                Mapa de calor — Pedidos por dia e hora
              </h3>
              <p className="text-xs text-muted-foreground mb-3">Quanto mais escuro, mais pedidos no período.</p>
              <div className="overflow-x-auto">
                <div className="inline-block min-w-[280px]">
                  {/* Header: horas */}
                  <div className="flex border-b border-border pb-1 mb-1">
                    <div className="w-10 shrink-0 text-[10px] text-muted-foreground font-medium" />
                    <div className="flex gap-0.5">
                      {Array.from({ length: 24 }, (_, h) => (
                        <div key={h} className="w-3.5 h-4 flex items-center justify-center text-[9px] text-muted-foreground" title={`${h}h`}>
                          {h % 3 === 0 ? h : ""}
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Rows: dia + células */}
                  {DAY_NAMES.map((dayName, d) => (
                    <div key={d} className="flex items-center gap-0.5 py-0.5">
                      <div className="w-10 shrink-0 text-[10px] text-muted-foreground font-medium">{dayName}</div>
                      <div className="flex gap-0.5">
                        {Array.from({ length: 24 }, (_, h) => {
                          const cell = heatMapGrid.get(`${d}-${h}`)!;
                          const intensity = heatMapMax > 0 ? cell.count / heatMapMax : 0;
                          const bg = intensity > 0
                            ? `rgba(249, 115, 22, ${0.15 + intensity * 0.85})`
                            : "hsl(30, 10%, 18%)";
                          return (
                            <div
                              key={h}
                              className="w-3.5 h-3.5 rounded-sm border border-white/5 transition-colors hover:ring-2 hover:ring-primary/50"
                              style={{ backgroundColor: bg }}
                              title={`${dayName} ${h}h–${h + 1}h: ${cell.count} pedido(s), ${formatCurrency(cell.revenue)}`}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground">
                <span>menos</span>
                <div className="flex gap-0.5">
                  {[0, 0.25, 0.5, 0.75, 1].map((i) => (
                    <div
                      key={i}
                      className="w-4 h-3 rounded-sm border border-white/5"
                      style={{ backgroundColor: `rgba(249, 115, 22, ${0.15 + i * 0.85})` }}
                    />
                  ))}
                </div>
                <span>mais</span>
              </div>
            </motion.div>

            {/* Two columns: Top items + Category */}
            <div className="grid md:grid-cols-2 gap-4">
              {/* Top items */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="rounded-xl border border-border bg-card p-4"
              >
                <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Hash className="h-4 w-4 text-primary" />
                  Itens mais vendidos
                </h3>
                {topItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">Nenhum dado no período</p>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={topItems} layout="vertical" margin={{ left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(30, 8%, 20%)" />
                      <XAxis type="number" tick={{ fill: "hsl(30, 10%, 55%)", fontSize: 12 }} />
                      <YAxis type="category" dataKey="name" tick={{ fill: "hsl(30, 10%, 55%)", fontSize: 11 }} width={120} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="qty" name="Quantidade" fill="hsl(32, 95%, 52%)" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </motion.div>

              {/* By category */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="rounded-xl border border-border bg-card p-4"
              >
                <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  Vendas por categoria
                </h3>
                {byCategory.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">Nenhum dado no período</p>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={byCategory}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        dataKey="revenue"
                        nameKey="name"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {byCategory.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => formatCurrency(v)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </motion.div>
            </div>

            {/* Table: top items detail */}
            {topItems.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="rounded-xl border border-border bg-card overflow-hidden"
              >
                <div className="p-4 border-b border-border">
                  <h3 className="text-sm font-semibold text-foreground">Detalhamento por item</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="text-left p-3 text-muted-foreground font-medium">#</th>
                        <th className="text-left p-3 text-muted-foreground font-medium">Item</th>
                        <th className="text-right p-3 text-muted-foreground font-medium">Qtd</th>
                        <th className="text-right p-3 text-muted-foreground font-medium">Receita</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topItems.map((item, i) => (
                        <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                          <td className="p-3 text-muted-foreground">{i + 1}</td>
                          <td className="p-3 text-foreground font-medium">{item.name}</td>
                          <td className="p-3 text-right text-foreground">{item.qty}</td>
                          <td className="p-3 text-right text-primary font-semibold">{formatCurrency(item.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}

            {/* Payments by method */}
            {payments.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 }}
                className="space-y-4"
              >
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Wallet className="h-5 w-5 text-primary" />
                  Pagamentos Registrados
                </h2>

                {/* Payment KPIs */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Wallet className="h-4 w-4 text-primary" />
                      <span className="text-xs text-muted-foreground uppercase tracking-wide">Total Recebido</span>
                    </div>
                    <p className="text-2xl font-bold text-foreground">{formatCurrency(totalPayments)}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Hash className="h-4 w-4 text-accent" />
                      <span className="text-xs text-muted-foreground uppercase tracking-wide">Nº Pagamentos</span>
                    </div>
                    <p className="text-2xl font-bold text-foreground">{payments.length}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="h-4 w-4 text-primary" />
                      <span className="text-xs text-muted-foreground uppercase tracking-wide">Taxa de Serviço</span>
                    </div>
                    <p className="text-2xl font-bold text-foreground">{formatCurrency(totalServiceCharges)}</p>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  {/* Pie chart */}
                  <div className="rounded-xl border border-border bg-card p-4">
                    <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                      <CreditCard className="h-4 w-4 text-primary" />
                      Distribuição por Forma de Pagamento
                    </h3>
                    <ResponsiveContainer width="100%" height={260}>
                      <PieChart>
                        <Pie
                          data={paymentsByMethod}
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={90}
                          dataKey="total"
                          nameKey="label"
                          label={({ label, percent }) => `${label} ${(percent * 100).toFixed(0)}%`}
                        >
                          {paymentsByMethod.map((_, i) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: number) => formatCurrency(v)} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Method detail cards */}
                  <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                    <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                      <Banknote className="h-4 w-4 text-primary" />
                      Detalhamento
                    </h3>
                    {paymentsByMethod.map((m, i) => {
                      const Icon = METHOD_ICONS[m.method] || Wallet;
                      const pct = totalPayments > 0 ? (m.total / totalPayments) * 100 : 0;
                      return (
                        <div key={m.method} className="rounded-lg border border-border bg-secondary/20 p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] + "22" }}>
                                <Icon className="h-4 w-4" style={{ color: CHART_COLORS[i % CHART_COLORS.length] }} />
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-foreground">{m.label}</p>
                                <p className="text-[10px] text-muted-foreground">{m.count} {m.count === 1 ? "pagamento" : "pagamentos"}</p>
                              </div>
                            </div>
                            <span className="text-sm font-bold text-primary">{formatCurrency(m.total)}</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-muted-foreground/20 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${pct}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default Reports;
