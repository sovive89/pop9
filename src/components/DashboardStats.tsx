import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  Users,
  ShoppingBag,
  DollarSign,
  TrendingUp,
  Clock,
  ChefHat,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { useSessionStore } from "@/hooks/useSessionStore";
import { getTableTotal, formatCurrency } from "@/utils/orders";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  trend?: string;
  pulse?: boolean;
}

const StatCard = ({ label, value, icon: Icon, color, bgColor, trend, pulse }: StatCardProps) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    className={`rounded-xl border border-border bg-card p-4 ${pulse ? "animate-pulse" : ""}`}
  >
    <div className="flex items-center gap-3">
      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${bgColor}`}>
        <Icon className={`h-5 w-5 ${color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground uppercase tracking-wide truncate">{label}</p>
        <p className="text-xl font-bold text-foreground">{value}</p>
        {trend && <p className="text-[10px] text-muted-foreground">{trend}</p>}
      </div>
    </div>
  </motion.div>
);

const DashboardStats = () => {
  const { sessions } = useSessionStore();

  const stats = useMemo(() => {
    const tableNumbers = Object.keys(sessions).map(Number);
    const occupiedTables = tableNumbers.length;
    
    let totalClients = 0;
    let totalRevenue = 0;
    let pendingOrders = 0;
    let preparingOrders = 0;
    let readyOrders = 0;
    let lateOrders = 0;
    
    for (const tableNum of tableNumbers) {
      const sd = sessions[tableNum];
      totalClients += sd.session.clients.length;
      totalRevenue += getTableTotal(sd.orders);
      
      for (const co of sd.orders) {
        for (const order of co.orders) {
          if (order.status === "pending") pendingOrders++;
          if (order.status === "preparing") preparingOrders++;
          if (order.status === "ready") readyOrders++;
          
          // Late = more than 15 minutes and not ready/delivered
          if (
            order.status !== "ready" &&
            order.status !== "delivered" &&
            Date.now() - order.placedAt.getTime() > 15 * 60 * 1000
          ) {
            lateOrders++;
          }
        }
      }
    }
    
    const avgTicket = totalClients > 0 ? totalRevenue / totalClients : 0;
    
    return {
      occupiedTables,
      totalClients,
      totalRevenue,
      avgTicket,
      pendingOrders,
      preparingOrders,
      readyOrders,
      lateOrders,
    };
  }, [sessions]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      <StatCard
        label="Mesas Ocupadas"
        value={stats.occupiedTables}
        icon={ShoppingBag}
        color="text-primary"
        bgColor="bg-primary/15"
      />
      <StatCard
        label="Clientes"
        value={stats.totalClients}
        icon={Users}
        color="text-accent"
        bgColor="bg-accent/15"
      />
      <StatCard
        label="Faturamento"
        value={formatCurrency(stats.totalRevenue)}
        icon={DollarSign}
        color="text-success"
        bgColor="bg-success/15"
      />
      <StatCard
        label="Ticket Medio"
        value={formatCurrency(stats.avgTicket)}
        icon={TrendingUp}
        color="text-primary"
        bgColor="bg-primary/15"
      />
      
      {/* Order status row */}
      {(stats.pendingOrders > 0 || stats.preparingOrders > 0 || stats.readyOrders > 0) && (
        <>
          {stats.pendingOrders > 0 && (
            <StatCard
              label="Pendentes"
              value={stats.pendingOrders}
              icon={Clock}
              color="text-warning"
              bgColor="bg-warning/15"
            />
          )}
          {stats.preparingOrders > 0 && (
            <StatCard
              label="Preparando"
              value={stats.preparingOrders}
              icon={ChefHat}
              color="text-primary"
              bgColor="bg-primary/15"
              pulse
            />
          )}
          {stats.readyOrders > 0 && (
            <StatCard
              label="Prontos"
              value={stats.readyOrders}
              icon={CheckCircle2}
              color="text-success"
              bgColor="bg-success/15"
              pulse
            />
          )}
          {stats.lateOrders > 0 && (
            <StatCard
              label="Atrasados"
              value={stats.lateOrders}
              icon={AlertTriangle}
              color="text-destructive"
              bgColor="bg-destructive/15"
              pulse
            />
          )}
        </>
      )}
    </div>
  );
};

export default DashboardStats;
