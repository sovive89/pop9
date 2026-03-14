import { useState } from "react";
import { motion } from "framer-motion";
import { Users, Coffee, UtensilsCrossed, Flame, Star, Palmtree } from "lucide-react";
import TableSessionPanel, { type TableSession, type ClientInfo } from "./TableSessionPanel";
import ClientOrderPanel from "./ClientOrderPanel";
import { type ClientOrder, type OrderItem } from "@/utils/orders";
import { useSessionStore } from "@/hooks/useSessionStore";
import { useTableZones } from "@/hooks/useTableZones";

type ClientInput = Omit<ClientInfo, "id" | "addedAt">;
type TableStatus = "free" | "occupied" | "reserved";

const ICON_MAP: Record<string, React.ComponentType<any>> = {
  UtensilsCrossed,
  Coffee,
  Users,
  Star,
  Palmtree,
};

const COLS_MAP: Record<number, string> = {
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
  6: "grid-cols-6",
};

const statusColors: Record<TableStatus, string> = {
  free: "border-muted-foreground/30 bg-secondary hover:bg-secondary/80 hover:border-primary/50",
  occupied: "border-primary bg-primary/15 hover:bg-primary/25",
  reserved: "border-warning bg-warning/10 hover:bg-warning/15",
};

const statusDot: Record<TableStatus, string> = {
  free: "bg-muted-foreground/40",
  occupied: "bg-primary",
  reserved: "bg-warning",
};

const statusLabel: Record<TableStatus, string> = {
  free: "Livre",
  occupied: "Ocupada",
  reserved: "Reservada",
};

interface TableOrderStats {
  pending: number;
  preparing: number;
  ready: number;
}

const TableMap = () => {
  const { sessions, loading: sessionsLoading, startSession, addClient, closeSession, placeOrder, updateLocalCart } = useSessionStore();
  const { zones, allTables, loading: zonesLoading, getZoneForTable } = useTableZones();
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
  const [selectedClient, setSelectedClient] = useState<ClientInfo | null>(null);

  const loading = sessionsLoading || zonesLoading;

  const getTableStatus = (tableId: number): TableStatus =>
    sessions[tableId] ? "occupied" : "free";

  const hasReadyOrders = (tableId: number): boolean => {
    const tableOrders = sessions[tableId]?.orders ?? [];
    return tableOrders.some((co) => co.orders.some((po) => po.status === "ready"));
  };

  const getTableSession = (tableId: number): (TableSession & { dbId: string }) | null =>
    sessions[tableId]?.session ?? null;

  const getTableOrders = (tableId: number): ClientOrder[] =>
    sessions[tableId]?.orders ?? [];

  const getTableOrderStats = (tableId: number): TableOrderStats => {
    const stats: TableOrderStats = { pending: 0, preparing: 0, ready: 0 };
    const tableOrders = sessions[tableId]?.orders ?? [];
    for (const clientOrder of tableOrders) {
      for (const order of clientOrder.orders) {
        if (order.status === "pending") stats.pending += 1;
        if (order.status === "preparing") stats.preparing += 1;
        if (order.status === "ready") stats.ready += 1;
      }
    }
    return stats;
  };

  const handleTableClick = (tableId: number) => {
    setSelectedTableId(tableId);
    setSelectedClient(null);
  };

  const handleStartSession = async (tableId: number, zone: string, input: ClientInput) => {
    await startSession(tableId, zone, input);
  };

  const handleAddClient = async (tableId: number, input: ClientInput) => {
    await addClient(tableId, input);
  };

  const handleCloseSession = async (tableId: number) => {
    await closeSession(tableId);
    setSelectedTableId(null);
    setSelectedClient(null);
  };

  const handleUpdateOrder = (tableId: number, updated: ClientOrder) => {
    updateLocalCart(tableId, updated.clientId, updated.cart);
  };

  const handlePlaceOrder = async (tableId: number, clientId: string, cart: OrderItem[]) => {
    await placeOrder(tableId, clientId, cart);
  };

  const counts = {
    free: allTables.filter((t) => getTableStatus(t.id) === "free").length,
    occupied: allTables.filter((t) => getTableStatus(t.id) === "occupied").length,
    reserved: 0,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Flame className="h-10 w-10 animate-pulse text-primary" />
      </div>
    );
  }

  // Client order fullscreen
  if (selectedClient && selectedTableId) {
    const tableOrders = getTableOrders(selectedTableId);
    const clientOrder: ClientOrder = tableOrders.find((o) => o.clientId === selectedClient.id) ?? {
      clientId: selectedClient.id,
      cart: [],
      orders: [],
    };
    return (
      <ClientOrderPanel
        client={selectedClient}
        tableId={selectedTableId}
        order={clientOrder}
        onUpdateOrder={(updated) => handleUpdateOrder(selectedTableId, updated)}
        onPlaceOrder={(cart) => handlePlaceOrder(selectedTableId, selectedClient.id, cart)}
        onBack={() => setSelectedClient(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Status Summary */}
      <div className="flex flex-wrap gap-4">
        {(["free", "occupied", "reserved"] as TableStatus[]).map((s) => (
          <div key={s} className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2">
            <span className={`h-2.5 w-2.5 rounded-full ${statusDot[s]}`} />
            <span className="text-sm text-muted-foreground">
              {statusLabel[s]}: <span className="font-semibold text-foreground">{counts[s]}</span>
            </span>
          </div>
        ))}
      </div>

      {/* Zones */}
      {zones.map((zone, zoneIdx) => {
        const Icon = ICON_MAP[zone.icon] || UtensilsCrossed;
        const zoneTables = allTables.filter((t) => t.zone === zone.key);
        const colsClass = COLS_MAP[zone.cols] || "grid-cols-4";

        return (
          <motion.section
            key={zone.key}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: zoneIdx * 0.1 }}
          >
            <div className="flex items-center gap-2 mb-3">
              <Icon className="h-5 w-5 text-primary" />
              <h2 className="text-2xl text-foreground">{zone.label}</h2>
              <span className="text-xs text-muted-foreground ml-1">
                ({zoneTables.filter((t) => getTableStatus(t.id) === "free").length} livres)
              </span>
            </div>

            <div className={`grid ${colsClass} gap-3 sm:gap-4`}>
              {zoneTables.map((table, i) => {
                const status = getTableStatus(table.id);
                const session = getTableSession(table.id);
                const isReady = hasReadyOrders(table.id);
                const orderStats = getTableOrderStats(table.id);
                return (
                    <motion.button
                      key={table.id}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{
                        opacity: 1,
                        scale: isReady ? [1, 1.06, 1] : 1,
                        boxShadow: isReady
                          ? ["0 0 0px hsl(var(--primary)/0)", "0 0 18px hsl(var(--primary)/0.5)", "0 0 0px hsl(var(--primary)/0)"]
                          : "none",
                      }}
                      transition={isReady ? { delay: i * 0.02, repeat: Infinity, duration: 1.5, ease: "easeInOut" } : { delay: i * 0.02 }}
                      whileHover={{ scale: 1.04 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => handleTableClick(table.id)}
                      className={`relative flex flex-col items-center justify-center rounded-xl border-2 p-4 transition-colors ${statusColors[status]} ${isReady ? "border-primary ring-2 ring-primary/30" : ""}`}
                    >
                      {isReady && (
                        <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[8px] font-bold text-primary-foreground animate-bounce">
                          ✓
                        </span>
                      )}
                      <span className="text-3xl font-bold text-foreground leading-none" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                        {String(table.id).padStart(2, "0")}
                      </span>
                      <span className={`mt-2 h-2 w-2 rounded-full ${statusDot[status]}`} />
                      {session && (
                        <div className="mt-1 flex items-center gap-1">
                          <Users className="h-3 w-3 text-primary" />
                          <span className="text-[10px] text-primary font-medium">{session.clients.length}</span>
                        </div>
                      )}
                      {session && (
                        <div className="mt-1.5 flex flex-wrap items-center justify-center gap-1">
                          {orderStats.pending > 0 && (
                            <span className="rounded-full border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[9px] font-medium text-warning">
                              P {orderStats.pending}
                            </span>
                          )}
                          {orderStats.preparing > 0 && (
                            <span className="rounded-full border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary">
                              Prep {orderStats.preparing}
                            </span>
                          )}
                          {orderStats.ready > 0 && (
                            <span className="rounded-full border border-success/40 bg-success/10 px-1.5 py-0.5 text-[9px] font-medium text-success-foreground">
                              R {orderStats.ready}
                            </span>
                          )}
                        </div>
                      )}
                    </motion.button>
                );
              })}
            </div>
          </motion.section>
        );
      })}

      {/* Session Panel */}
      {selectedTableId !== null && (
        <TableSessionPanel
          tableId={selectedTableId}
          zoneName={getZoneForTable(selectedTableId)?.label ?? ""}
          session={getTableSession(selectedTableId)}
          orders={getTableOrders(selectedTableId)}
          onStartSession={(input) => {
            const zone = getZoneForTable(selectedTableId);
            handleStartSession(selectedTableId, zone?.key ?? "salao", input);
          }}
          onAddClient={(input) => handleAddClient(selectedTableId, input)}
          onCloseSession={() => handleCloseSession(selectedTableId)}
          onClose={() => setSelectedTableId(null)}
          onSelectClient={(client) => setSelectedClient(client)}
        />
      )}
    </div>
  );
};

export default TableMap;
