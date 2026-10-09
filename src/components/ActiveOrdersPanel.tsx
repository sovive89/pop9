import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, CheckCircle2, ChefHat, AlertTriangle, Bell, Package, HandPlatter, Truck } from "lucide-react";
import { useDeliveredOrders } from "@/hooks/useDeliveredOrders";
import { Button } from "@/components/ui/button";
import { useSessionStore } from "@/hooks/useSessionStore";
import {
  type PlacedOrder,
  type OrderStatus,
  statusLabels,
  formatCurrency,
  getItemUnitPrice,
} from "@/utils/orders";

interface FlatOrder {
  order: PlacedOrder;
  tableNumber: number;
  clientName: string;
  clientId: string;
  isDelivery?: boolean;
}

const statusIcon: Record<OrderStatus, React.ReactNode> = {
  pending: <Clock className="h-4 w-4" />,
  preparing: <ChefHat className="h-4 w-4 animate-pulse" />,
  ready: <CheckCircle2 className="h-4 w-4" />,
  delivered: <Package className="h-4 w-4" />,
};

const statusBadge: Record<OrderStatus, string> = {
  pending: "bg-warning/20 text-warning border-warning/40",
  preparing: "bg-primary/15 text-primary border-primary/40",
  ready: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40 animate-pulse",
  delivered: "bg-muted text-muted-foreground border-border",
};

const ActiveOrdersPanel = () => {
  const { sessions, markDelivered } = useSessionStore();
  const [view, setView] = useState<"active" | "delivered">("active");
  const [date, setDate] = useState(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  });
  const history = useDeliveredOrders(view === "delivered", date);
  const [deliveringId, setDeliveringId] = useState<string | null>(null);

  const flatOrders = useMemo<FlatOrder[]>(() => {
    const result: FlatOrder[] = [];
    for (const [tableNum, sd] of Object.entries(sessions)) {
      for (const co of sd.orders) {
        const client = sd.session.clients.find((c) => c.id === co.clientId);
          for (const order of co.orders) {
          result.push({
            order,
            tableNumber: Number(tableNum),
            clientName: client?.name ?? "Cliente",
            clientId: co.clientId,
            isDelivery: order.origin === "pwa",
          });
        }
      }
    }
    // Most recent first, ready orders on top
    result.sort((a, b) => {
      if (a.order.status === "ready" && b.order.status !== "ready") return -1;
      if (b.order.status === "ready" && a.order.status !== "ready") return 1;
      return b.order.placedAt.getTime() - a.order.placedAt.getTime();
    });
    return result;
  }, [sessions]);

  const activeOrders = flatOrders.filter((o) => o.order.status !== "delivered" && (o.order.status as string) !== "cancelled");
  const readyOrders = activeOrders.filter((o) => o.order.status === "ready");
  const readyCount = readyOrders.length;
  const readyDeliveryCount = readyOrders.filter((o) => o.isDelivery).length;
  const readyMesaCount = readyCount - readyDeliveryCount;
  const pendingCount = activeOrders.filter((o) => o.order.status === "pending").length;
  const preparingCount = activeOrders.filter((o) => o.order.status === "preparing").length;

  const elapsed = (date: Date) => {
    const mins = Math.floor((Date.now() - date.getTime()) / 60000);
    if (mins < 1) return "agora";
    if (mins < 60) return `${mins}min`;
    return `${Math.floor(mins / 60)}h${mins % 60}min`;
  };

  const orderTotal = (order: PlacedOrder) =>
    order.items.reduce((s, i) => s + getItemUnitPrice(i) * i.quantity, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar pedidos">
        <Button variant={view === "active" ? "default" : "outline"} aria-pressed={view === "active"} onClick={() => setView("active")}>Em andamento ({activeOrders.length})</Button>
        <Button variant={view === "delivered" ? "default" : "outline"} aria-pressed={view === "delivered"} onClick={() => setView("delivered")}>Entregues</Button>
        {view === "delivered" && <label className="text-sm">Data do pedido <input aria-label="Data do pedido" type="date" value={date} onChange={event => { if (event.target.value) setDate(event.target.value); }} className="ml-2 rounded-md border border-border bg-background p-2" /></label>}
      </div>
      {view === "delivered" && history.loading && <p role="status">Carregando pedidos entregues...</p>}
      {view === "delivered" && history.error && <div role="alert">Não foi possível carregar os pedidos entregues. <Button variant="outline" onClick={history.retry}>Tentar novamente</Button></div>}
      {((view === "active" && activeOrders.length === 0) || (view === "delivered" && !history.loading && !history.error && history.orders.length === 0)) && <p className="py-12 text-center text-muted-foreground">{view === "active" ? "Nenhum pedido ativo no momento" : "Nenhum pedido entregue nesta data"}</p>}
      {/* Summary counters */}
      <div className="flex flex-wrap gap-3">
        {view === "active" && readyMesaCount > 0 && (
          <motion.div
            initial={{ scale: 0.9 }}
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2"
          >
            <Bell className="h-4 w-4 text-emerald-400" />
            <span className="text-sm font-semibold text-emerald-400">{readyMesaCount} pronto{readyMesaCount > 1 ? "s" : ""}</span>
          </motion.div>
        )}
        {view === "active" && readyDeliveryCount > 0 && (
          <motion.div
            initial={{ scale: 0.9 }}
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="flex items-center gap-2 rounded-lg border border-primary/50 bg-primary/15 px-4 py-2"
          >
            <Truck className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-primary">{readyDeliveryCount} delivery pronto{readyDeliveryCount > 1 ? "s" : ""}</span>
          </motion.div>
        )}
        {view === "active" && pendingCount > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-4 py-2">
            <Clock className="h-4 w-4 text-warning" />
            <span className="text-sm text-warning">{pendingCount} pendente{pendingCount > 1 ? "s" : ""}</span>
          </div>
        )}
        {view === "active" && preparingCount > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-4 py-2">
            <ChefHat className="h-4 w-4 text-primary" />
            <span className="text-sm text-primary">{preparingCount} preparando</span>
          </div>
        )}
      </div>

      {/* Orders list */}
      <div className="space-y-3">
        <AnimatePresence mode="popLayout">
          {(view === "active" ? activeOrders : history.orders).map((fo) => {
            const isReady = fo.order.status === "ready";
            const isLate = fo.order.status !== "ready" && fo.order.status !== "delivered" &&
              (Date.now() - fo.order.placedAt.getTime()) > 15 * 60000;

            return (
              <motion.div
                key={fo.order.id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -40 }}
                className={`rounded-xl border-2 p-4 transition-colors ${
                  isReady
                    ? "border-emerald-500/50 bg-emerald-500/5"
                    : isLate
                    ? "border-destructive/40 bg-destructive/5"
                    : "border-border bg-card"
                }`}
              >
                {/* Order header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    {fo.isDelivery ? (
                      <span className="flex items-center gap-1.5 text-xl font-bold text-primary leading-none" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                        <Truck className="h-5 w-5" />
                        Delivery
                      </span>
                    ) : (
                      <span className="text-2xl font-bold text-foreground leading-none" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                        Mesa {String(fo.tableNumber).padStart(2, "0")}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {fo.clientName.split(" ")[0]}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {isLate && (
                      <AlertTriangle className="h-4 w-4 text-destructive animate-pulse" />
                    )}
                    {isReady && fo.isDelivery && (
                      <Truck className="h-4 w-4 text-primary shrink-0" aria-label="Pedido delivery pronto" />
                    )}
                    <div className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${statusBadge[fo.order.status]}`}>
                      {statusIcon[fo.order.status]}
                      {statusLabels[fo.order.status]}
                    </div>
                  </div>
                </div>

                {/* Items */}
                <div className="space-y-1.5 mb-3">
                  {fo.order.items.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm">
                      <span className="text-foreground">
                        <span className="font-medium text-primary">{item.quantity}×</span>{" "}
                        {item.name}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {formatCurrency(getItemUnitPrice(item) * item.quantity)}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {view === "delivered" ? fo.order.placedAt.toLocaleString("pt-BR") : elapsed(fo.order.placedAt)}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-foreground">
                      {formatCurrency(orderTotal(fo.order))}
                    </span>
                    {isReady && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={deliveringId === fo.order.id}
                        className="gap-1.5 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/15 hover:text-emerald-300"
                        onClick={async () => {
                          setDeliveringId(fo.order.id);
                          try { await markDelivered(fo.order.id); } finally { setDeliveringId(null); }
                        }}
                      >
                        <HandPlatter className="h-3.5 w-3.5" />
                        {deliveringId === fo.order.id ? "..." : "Entregue"}
                      </Button>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
        {view === "delivered" && history.more && <Button variant="outline" onClick={history.loadMore}>Carregar mais pedidos</Button>}
      </div>
    </div>
  );
};

export default ActiveOrdersPanel;
