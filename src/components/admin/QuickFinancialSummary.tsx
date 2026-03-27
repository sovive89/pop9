import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import {
  DollarSign,
  TrendingUp,
  ShoppingBag,
  Users,
  Clock,
  RefreshCw,
  CreditCard,
  Banknote,
  Smartphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { startOfDay, endOfDay, format } from "date-fns";

interface OrderItemData {
  price: number;
  quantity: number;
}

interface OrderData {
  id: string;
  placed_at: string;
  order_items: OrderItemData[];
}

interface PaymentData {
  amount: number;
  service_charge: number;
  method: string;
}

const formatCurrency = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const QuickFinancialSummary = () => {
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [payments, setPayments] = useState<PaymentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const loadData = async () => {
    setLoading(true);
    const today = new Date();
    const from = startOfDay(today).toISOString();
    const to = endOfDay(today).toISOString();

    const [ordersRes, paymentsRes] = await Promise.all([
      supabase
        .from("orders")
        .select("id, placed_at, order_items(price, quantity)")
        .gte("placed_at", from)
        .lte("placed_at", to)
        .in("status", ["pending", "preparing", "ready", "delivered"]),
      supabase
        .from("payments")
        .select("amount, service_charge, method")
        .gte("paid_at", from)
        .lte("paid_at", to),
    ]);

    if (ordersRes.data) setOrders(ordersRes.data as OrderData[]);
    if (paymentsRes.data) setPayments(paymentsRes.data as PaymentData[]);
    setLastUpdate(new Date());
    setLoading(false);
  };

  useEffect(() => {
    loadData();
    
    // Auto refresh every 60 seconds
    const interval = setInterval(loadData, 60000);
    return () => clearInterval(interval);
  }, []);

  const stats = useMemo(() => {
    const totalRevenue = orders.reduce(
      (sum, o) => sum + o.order_items.reduce((s, i) => s + Number(i.price) * i.quantity, 0),
      0
    );
    const totalOrders = orders.length;
    const totalItems = orders.reduce(
      (sum, o) => sum + o.order_items.reduce((s, i) => s + i.quantity, 0),
      0
    );
    const avgTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // Payments breakdown
    const totalPaid = payments.reduce((s, p) => s + Number(p.amount) + Number(p.service_charge), 0);
    const totalServiceCharge = payments.reduce((s, p) => s + Number(p.service_charge), 0);
    
    const paymentsByMethod = {
      dinheiro: payments.filter(p => p.method === "dinheiro").reduce((s, p) => s + Number(p.amount) + Number(p.service_charge), 0),
      cartao: payments.filter(p => p.method === "cartao").reduce((s, p) => s + Number(p.amount) + Number(p.service_charge), 0),
      pix: payments.filter(p => p.method === "pix").reduce((s, p) => s + Number(p.amount) + Number(p.service_charge), 0),
    };

    return {
      totalRevenue,
      totalOrders,
      totalItems,
      avgTicket,
      totalPaid,
      totalServiceCharge,
      paymentsByMethod,
      pendingPayment: totalRevenue - totalPaid,
    };
  }, [orders, payments]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border bg-card p-4 space-y-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15">
            <DollarSign className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Resumo do Dia</h3>
            <p className="text-[10px] text-muted-foreground">
              {format(new Date(), "dd/MM/yyyy")} - Atualizado {format(lastUpdate, "HH:mm")}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={loadData}
          disabled={loading}
          className="h-8 w-8"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Main KPIs */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-secondary/50 p-3">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-3.5 w-3.5 text-success" />
            <span className="text-[10px] text-muted-foreground uppercase">Faturamento</span>
          </div>
          <p className="text-lg font-bold text-foreground">{formatCurrency(stats.totalRevenue)}</p>
        </div>
        <div className="rounded-lg bg-secondary/50 p-3">
          <div className="flex items-center gap-2 mb-1">
            <ShoppingBag className="h-3.5 w-3.5 text-primary" />
            <span className="text-[10px] text-muted-foreground uppercase">Pedidos</span>
          </div>
          <p className="text-lg font-bold text-foreground">{stats.totalOrders}</p>
        </div>
        <div className="rounded-lg bg-secondary/50 p-3">
          <div className="flex items-center gap-2 mb-1">
            <Users className="h-3.5 w-3.5 text-accent" />
            <span className="text-[10px] text-muted-foreground uppercase">Ticket Medio</span>
          </div>
          <p className="text-lg font-bold text-foreground">{formatCurrency(stats.avgTicket)}</p>
        </div>
        <div className="rounded-lg bg-secondary/50 p-3">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="h-3.5 w-3.5 text-warning" />
            <span className="text-[10px] text-muted-foreground uppercase">A Receber</span>
          </div>
          <p className={`text-lg font-bold ${stats.pendingPayment > 0 ? "text-warning" : "text-foreground"}`}>
            {formatCurrency(stats.pendingPayment > 0 ? stats.pendingPayment : 0)}
          </p>
        </div>
      </div>

      {/* Payment Methods */}
      {stats.totalPaid > 0 && (
        <div className="border-t border-border pt-3">
          <p className="text-[10px] text-muted-foreground uppercase mb-2">Recebimentos por Forma</p>
          <div className="flex flex-wrap gap-2">
            {stats.paymentsByMethod.dinheiro > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-success/10 border border-success/20">
                <Banknote className="h-3.5 w-3.5 text-success" />
                <span className="text-xs font-medium text-success">
                  {formatCurrency(stats.paymentsByMethod.dinheiro)}
                </span>
              </div>
            )}
            {stats.paymentsByMethod.cartao > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary/10 border border-primary/20">
                <CreditCard className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-medium text-primary">
                  {formatCurrency(stats.paymentsByMethod.cartao)}
                </span>
              </div>
            )}
            {stats.paymentsByMethod.pix > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-accent/10 border border-accent/20">
                <Smartphone className="h-3.5 w-3.5 text-accent" />
                <span className="text-xs font-medium text-accent">
                  {formatCurrency(stats.paymentsByMethod.pix)}
                </span>
              </div>
            )}
          </div>
          {stats.totalServiceCharge > 0 && (
            <p className="text-[10px] text-muted-foreground mt-2">
              Taxa de servico inclusa: {formatCurrency(stats.totalServiceCharge)}
            </p>
          )}
        </div>
      )}
    </motion.div>
  );
};

export default QuickFinancialSummary;
