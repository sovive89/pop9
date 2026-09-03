import { useState } from "react";
import { motion } from "framer-motion";
import { Users, Flame, Plus } from "lucide-react";
import TableSessionPanel, { type TableSession, type ClientInfo } from "./TableSessionPanel";
import ClientOrderPanel from "./ClientOrderPanel";
import { type ClientOrder, type OrderItem } from "@/utils/orders";
import { useSessionStore } from "@/hooks/useSessionStore";
import { useTableCount } from "@/hooks/useTableCount";

type ClientInput = Omit<ClientInfo, "id" | "addedAt">;
type TableStatus = "free" | "occupied" | "reserved";

const DEFAULT_ZONE = "salao";

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

const TableMap = () => {
  const { sessions, loading: sessionsLoading, startSession, addClient, closeSession, placeOrder, updateLocalCart } = useSessionStore();
  const { tableCount, loading: tableCountLoading, addTable } = useTableCount();
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
  const [selectedClient, setSelectedClient] = useState<ClientInfo | null>(null);

  const loading = sessionsLoading || tableCountLoading;
  const tableIds = Array.from({ length: tableCount }, (_, i) => i + 1);

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
    free: tableIds.filter((id) => getTableStatus(id) === "free").length,
    occupied: tableIds.filter((id) => getTableStatus(id) === "occupied").length,
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

      {/* Mesas — grade única, cards de tamanho fixo (não encolhem conforme
          o número de mesas cresce, novas mesas só quebram pra próxima
          linha). Cor por área fica pra depois — hoje toda mesa usa o
          mesmo esquema de cor por status (livre/ocupada). */}
      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-3 sm:gap-4">
          {tableIds.map((tableId, i) => {
            const status = getTableStatus(tableId);
            const session = getTableSession(tableId);
            const isReady = hasReadyOrders(tableId);
            return (
              <motion.button
                key={tableId}
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
                onClick={() => handleTableClick(tableId)}
                className={`relative flex flex-col items-center justify-center rounded-xl border-2 p-4 transition-colors ${statusColors[status]} ${isReady ? "border-primary ring-2 ring-primary/30" : ""}`}
              >
                {isReady && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[8px] font-bold text-primary-foreground animate-bounce">
                    ✓
                  </span>
                )}
                <span className="text-3xl font-bold text-foreground leading-none" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                  {String(tableId).padStart(2, "0")}
                </span>
                <span className={`mt-2 h-2 w-2 rounded-full ${statusDot[status]}`} />
                {session && (
                  <div className="mt-1 flex items-center gap-1">
                    <Users className="h-3 w-3 text-primary" />
                    <span className="text-[10px] text-primary font-medium">{session.clients.length}</span>
                  </div>
                )}
              </motion.button>
            );
          })}
          <button
            onClick={addTable}
            className="flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-muted-foreground/30 p-4 text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
          >
            <Plus className="h-6 w-6" />
            <span className="text-[10px] font-medium">Mesa</span>
          </button>
        </div>
      </motion.section>

      {/* Session Panel */}
      {selectedTableId !== null && (
        <TableSessionPanel
          tableId={selectedTableId}
          zoneName=""
          session={getTableSession(selectedTableId)}
          orders={getTableOrders(selectedTableId)}
          onStartSession={(input) => handleStartSession(selectedTableId, DEFAULT_ZONE, input)}
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
