import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, X, CheckCircle2, Clock, ChefHat, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSessionStore } from "@/hooks/useSessionStore";
import { formatCurrency, getItemUnitPrice } from "@/utils/orders";

interface Notification {
  id: string;
  type: "ready" | "late" | "new";
  title: string;
  message: string;
  timestamp: Date;
  tableNumber?: number;
  orderId?: string;
}

const NotificationBell = () => {
  const { sessions } = useSessionStore();
  const [isOpen, setIsOpen] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  // Generate notifications from session data
  const notifications = useMemo<Notification[]>(() => {
    const notifs: Notification[] = [];
    
    for (const [tableNum, sd] of Object.entries(sessions)) {
      for (const co of sd.orders) {
        const client = sd.session.clients.find(c => c.id === co.clientId);
        
        for (const order of co.orders) {
          // Ready orders
          if (order.status === "ready" && !dismissedIds.has(`ready-${order.id}`)) {
            notifs.push({
              id: `ready-${order.id}`,
              type: "ready",
              title: `Pedido Pronto - Mesa ${String(tableNum).padStart(2, "0")}`,
              message: `${client?.name.split(" ")[0] ?? "Cliente"} - ${order.items.length} item(s)`,
              timestamp: order.placedAt,
              tableNumber: Number(tableNum),
              orderId: order.id,
            });
          }
          
          // Late orders (>15min and not ready/delivered)
          if (
            order.status !== "ready" &&
            order.status !== "delivered" &&
            Date.now() - order.placedAt.getTime() > 15 * 60 * 1000 &&
            !dismissedIds.has(`late-${order.id}`)
          ) {
            const mins = Math.floor((Date.now() - order.placedAt.getTime()) / 60000);
            notifs.push({
              id: `late-${order.id}`,
              type: "late",
              title: `Pedido Atrasado - Mesa ${String(tableNum).padStart(2, "0")}`,
              message: `${mins} minutos - ${client?.name.split(" ")[0] ?? "Cliente"}`,
              timestamp: order.placedAt,
              tableNumber: Number(tableNum),
              orderId: order.id,
            });
          }
        }
      }
    }
    
    return notifs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [sessions, dismissedIds]);

  const unreadCount = notifications.length;

  const dismissNotification = (id: string) => {
    setDismissedIds(prev => new Set([...prev, id]));
  };

  const dismissAll = () => {
    setDismissedIds(new Set(notifications.map(n => n.id)));
    setIsOpen(false);
  };

  const getIcon = (type: Notification["type"]) => {
    switch (type) {
      case "ready":
        return <CheckCircle2 className="h-4 w-4 text-success" />;
      case "late":
        return <AlertTriangle className="h-4 w-4 text-destructive" />;
      case "new":
        return <ChefHat className="h-4 w-4 text-primary" />;
    }
  };

  const getColors = (type: Notification["type"]) => {
    switch (type) {
      case "ready":
        return "border-success/30 bg-success/5";
      case "late":
        return "border-destructive/30 bg-destructive/5";
      case "new":
        return "border-primary/30 bg-primary/5";
    }
  };

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="relative gap-1.5"
      >
        <Bell className={`h-4 w-4 ${unreadCount > 0 ? "animate-pulse" : ""}`} />
        {unreadCount > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </motion.span>
        )}
      </Button>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />
            
            {/* Dropdown */}
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              className="absolute right-0 top-full mt-2 w-80 max-h-96 overflow-hidden rounded-xl border border-border bg-card shadow-xl z-50"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <h4 className="text-sm font-semibold text-foreground">Notificacoes</h4>
                {notifications.length > 0 && (
                  <button
                    onClick={dismissAll}
                    className="text-[10px] text-muted-foreground hover:text-foreground"
                  >
                    Limpar todas
                  </button>
                )}
              </div>

              {/* Content */}
              <div className="max-h-72 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <Bell className="h-8 w-8 opacity-30 mb-2" />
                    <p className="text-sm">Nenhuma notificacao</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {notifications.map((notif) => (
                      <motion.div
                        key={notif.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 10 }}
                        className={`flex items-start gap-3 p-3 ${getColors(notif.type)}`}
                      >
                        <div className="mt-0.5">{getIcon(notif.type)}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {notif.title}
                          </p>
                          <p className="text-xs text-muted-foreground">{notif.message}</p>
                        </div>
                        <button
                          onClick={() => dismissNotification(notif.id)}
                          className="text-muted-foreground hover:text-foreground shrink-0"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default NotificationBell;
