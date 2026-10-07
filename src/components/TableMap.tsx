import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Users, Flame, Plus, Check, Pencil, Link2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import TableSessionPanel, { type TableSession, type ClientInfo } from "./TableSessionPanel";
import ClientOrderPanel from "./ClientOrderPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type ClientOrder, type OrderItem } from "@/utils/orders";
import { useSessionStore } from "@/hooks/useSessionStore";
import { useTables, DEFAULT_AREA_COLOR, NO_AREA_COLOR, type TableArea } from "@/hooks/useTables";

type ClientInput = Omit<ClientInfo, "id" | "addedAt">;
type TableStatus = "free" | "occupied" | "reserved";
type Mode = "normal" | "edit" | "merge";

const DEFAULT_ZONE = "salao";
const NONE = "__none__";

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

const pad = (n: number) => String(n).padStart(2, "0");

/** Linha de edição de uma área: cor, nome, quantas mesas tem e apagar. */
const AreaRow = ({
  area,
  count,
  onUpdate,
  onDelete,
}: {
  area: TableArea;
  count: number;
  onUpdate: (id: string, patch: { name?: string; color?: string }) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}) => {
  const [name, setName] = useState(area.name);
  const [color, setColor] = useState(area.color);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => setName(area.name), [area.name]);
  useEffect(() => setColor(area.color), [area.color]);

  // O seletor de cor dispara o tempo todo enquanto o dedo arrasta; só grava
  // no banco quando para de mexer por meio segundo.
  useEffect(() => {
    if (color === area.color) return;
    const t = setTimeout(() => onUpdate(area.id, { color }), 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color]);

  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={color}
        onChange={(e) => setColor(e.target.value)}
        aria-label={`Cor da área ${area.name}`}
        className="h-9 w-10 shrink-0 cursor-pointer rounded border border-border bg-transparent p-0.5"
      />
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          const trimmed = name.trim();
          if (trimmed && trimmed !== area.name) onUpdate(area.id, { name: trimmed });
          else setName(area.name);
        }}
        className="h-9"
        aria-label="Nome da área"
      />
      <span className="whitespace-nowrap text-xs text-muted-foreground">
        {count} {count === 1 ? "mesa" : "mesas"}
      </span>
      {confirming ? (
        <Button
          variant="destructive"
          size="sm"
          onClick={async () => {
            await onDelete(area.id);
            setConfirming(false);
          }}
        >
          Apagar?
        </Button>
      ) : (
        <Button variant="ghost" size="icon" onClick={() => setConfirming(true)} aria-label={`Apagar área ${area.name}`}>
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
};

const NewAreaForm = ({ onCreate }: { onCreate: (name: string, color: string) => Promise<boolean> }) => {
  const [name, setName] = useState("");
  const [color, setColor] = useState(DEFAULT_AREA_COLOR);

  const submit = async () => {
    if (!name.trim()) return;
    if (await onCreate(name, color)) setName("");
  };

  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={color}
        onChange={(e) => setColor(e.target.value)}
        aria-label="Cor da nova área"
        className="h-9 w-10 shrink-0 cursor-pointer rounded border border-border bg-transparent p-0.5"
      />
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="Nova área (ex: Varanda)"
        className="h-9"
      />
      <Button size="sm" onClick={submit} disabled={!name.trim()}>
        <Plus className="mr-1 h-4 w-4" /> Área
      </Button>
    </div>
  );
};

const TableMap = () => {
  const {
    sessions,
    loading: sessionsLoading,
    startSession,
    addClient,
    closeSession,
    placeOrder,
    updateLocalCart,
    reload: reloadSessions,
  } = useSessionStore();
  const {
    tables,
    areas,
    loading: tablesLoading,
    editable,
    isAdmin,
    addTable,
    archiveTables,
    moveTablesToArea,
    createArea,
    updateArea,
    deleteArea,
    mergeSessions,
  } = useTables();

  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
  const [selectedClient, setSelectedClient] = useState<ClientInfo | null>(null);
  const [mode, setMode] = useState<Mode>("normal");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [mergeSource, setMergeSource] = useState<number | null>(null);
  const [mergeTarget, setMergeTarget] = useState<number | null>(null);
  const [merging, setMerging] = useState(false);

  const loading = sessionsLoading || tablesLoading;

  const areaById = useMemo(() => new Map(areas.map((a) => [a.id, a])), [areas]);
  const tableCountByArea = useMemo(() => {
    const m = new Map<string | null, number>();
    for (const t of tables) m.set(t.area_id, (m.get(t.area_id) ?? 0) + 1);
    return m;
  }, [tables]);

  const getTableStatus = (tableId: number): TableStatus => (sessions[tableId] ? "occupied" : "free");

  const hasReadyOrders = (tableId: number): boolean => {
    const tableOrders = sessions[tableId]?.orders ?? [];
    return tableOrders.some((co) => co.orders.some((po) => po.status === "ready"));
  };

  const getTableSession = (tableId: number): (TableSession & { dbId: string }) | null =>
    sessions[tableId]?.session ?? null;

  const getTableOrders = (tableId: number): ClientOrder[] => sessions[tableId]?.orders ?? [];

  const changeMode = (next: Mode) => {
    setMode(next);
    setSelectedIds([]);
    setConfirmArchive(false);
    setMergeSource(null);
    setMergeTarget(null);
    setSelectedTableId(null);
    setSelectedClient(null);
  };

  const handleTableClick = (tableId: number, dbTableId: string) => {
    if (mode === "edit") {
      setConfirmArchive(false);
      setSelectedIds((prev) => (prev.includes(dbTableId) ? prev.filter((id) => id !== dbTableId) : [...prev, dbTableId]));
      return;
    }
    if (mode === "merge") {
      if (!sessions[tableId]) return; // só mesas com conta aberta
      if (mergeSource === null) {
        setMergeSource(tableId);
      } else if (tableId === mergeSource) {
        setMergeSource(null);
        setMergeTarget(null);
      } else {
        setMergeTarget(tableId);
      }
      return;
    }
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

  const handleMerge = async () => {
    if (mergeSource === null || mergeTarget === null) return;
    const sourceId = sessions[mergeSource]?.session.dbId;
    const targetId = sessions[mergeTarget]?.session.dbId;
    if (!sourceId || !targetId) return;
    setMerging(true);
    const ok = await mergeSessions(sourceId, targetId);
    setMerging(false);
    if (ok) {
      toast.success(`Mesa ${pad(mergeSource)} unida à Mesa ${pad(mergeTarget)}`);
      changeMode("normal");
      await reloadSessions();
    }
  };

  const handleMoveSelected = async (value: string) => {
    if (!value) return;
    const ok = await moveTablesToArea(selectedIds, value === NONE ? null : value);
    if (ok) setSelectedIds([]);
  };

  const handleArchiveSelected = async () => {
    if (!confirmArchive) {
      setConfirmArchive(true);
      return;
    }
    const ok = await archiveTables(selectedIds);
    if (ok) {
      setSelectedIds([]);
      setConfirmArchive(false);
    }
  };

  const tableIds = tables.map((t) => t.number);
  const counts = {
    free: tableIds.filter((id) => getTableStatus(id) === "free").length,
    occupied: tableIds.filter((id) => getTableStatus(id) === "occupied").length,
    reserved: 0,
  };

  const selectedTables = tables.filter((t) => selectedIds.includes(t.id));
  const selectedOccupied = selectedTables.filter((t) => sessions[t.number]);
  const occupiedCount = counts.occupied;
  const showAddTile = mode === "edit" || !editable; // sem a migration, mantém o "+ Mesa" antigo
  const hasUnassigned = (tableCountByArea.get(null) ?? 0) > 0;

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
      {/* Status Summary + ações do mapa */}
      <div className="flex flex-wrap items-center gap-4">
        {(["free", "occupied", "reserved"] as TableStatus[]).map((s) => (
          <div key={s} className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2">
            <span className={`h-2.5 w-2.5 rounded-full ${statusDot[s]}`} />
            <span className="text-sm text-muted-foreground">
              {statusLabel[s]}: <span className="font-semibold text-foreground">{counts[s]}</span>
            </span>
          </div>
        ))}

        <div className="ml-auto flex items-center gap-2">
          {mode === "normal" && (
            <>
              <Button variant="outline" size="sm" onClick={() => changeMode("merge")} disabled={occupiedCount < 2}>
                <Link2 className="mr-1.5 h-4 w-4" /> Unir mesas
              </Button>
              {isAdmin && editable && (
                <Button variant="outline" size="sm" onClick={() => changeMode("edit")}>
                  <Pencil className="mr-1.5 h-4 w-4" /> Editar mesas
                </Button>
              )}
            </>
          )}
          {mode === "edit" && (
            <Button size="sm" onClick={() => changeMode("normal")}>
              <Check className="mr-1.5 h-4 w-4" /> Concluir
            </Button>
          )}
          {mode === "merge" && (
            <Button variant="outline" size="sm" onClick={() => changeMode("normal")}>
              <X className="mr-1.5 h-4 w-4" /> Cancelar
            </Button>
          )}
        </div>
      </div>

      {/* Legenda das áreas (modo normal / unir) */}
      {mode !== "edit" && areas.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2" aria-label="Legenda das áreas">
          {areas.map((a) => (
            <div key={a.id} className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: a.color }} />
              {a.name}
              <span className="text-xs">({tableCountByArea.get(a.id) ?? 0})</span>
            </div>
          ))}
          {hasUnassigned && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: NO_AREA_COLOR }} />
              Sem área
              <span className="text-xs">({tableCountByArea.get(null) ?? 0})</span>
            </div>
          )}
        </div>
      )}

      {/* Edição: áreas (nome + cor) */}
      {mode === "edit" && (
        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Áreas</h2>
            <p className="text-xs text-muted-foreground">
              Cada área tem uma cor. Toque nas mesas abaixo para selecionar e mover para uma área ou arquivar.
            </p>
          </div>
          {areas.map((a) => (
            <AreaRow key={a.id} area={a} count={tableCountByArea.get(a.id) ?? 0} onUpdate={updateArea} onDelete={deleteArea} />
          ))}
          <NewAreaForm onCreate={createArea} />
        </section>
      )}

      {/* Edição: ações sobre as mesas selecionadas */}
      {mode === "edit" && selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/40 bg-primary/10 px-4 py-3">
          <span className="text-sm font-medium text-foreground">
            {selectedIds.length} {selectedIds.length === 1 ? "mesa selecionada" : "mesas selecionadas"}
          </span>
          <select
            value=""
            onChange={(e) => handleMoveSelected(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
            aria-label="Mover para área"
          >
            <option value="">Mover para…</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
            <option value={NONE}>Sem área</option>
          </select>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleArchiveSelected}
            disabled={selectedOccupied.length > 0}
          >
            <Trash2 className="mr-1.5 h-4 w-4" />
            {confirmArchive ? "Confirmar arquivar?" : "Arquivar"}
          </Button>
          {selectedOccupied.length > 0 ? (
            <span className="text-xs text-warning">
              Mesa {selectedOccupied.map((t) => pad(t.number)).join(", ")} com conta aberta: feche a conta antes de arquivar.
            </span>
          ) : (
            confirmArchive && (
              <span className="text-xs text-muted-foreground">
                A mesa some do mapa; o histórico de vendas continua nos relatórios.
              </span>
            )
          )}
        </div>
      )}

      {/* União: instruções e confirmação */}
      {mode === "merge" && (
        <div className="space-y-2 rounded-xl border border-primary/40 bg-primary/10 px-4 py-3">
          {mergeSource === null && (
            <p className="text-sm text-foreground">
              Toque na mesa que será <strong>unida</strong> (ela vai ficar livre). Só mesas com conta aberta.
            </p>
          )}
          {mergeSource !== null && mergeTarget === null && (
            <p className="text-sm text-foreground">
              Mesa {pad(mergeSource)} escolhida. Agora toque na mesa que <strong>continua com a conta</strong>.
            </p>
          )}
          {mergeSource !== null && mergeTarget !== null && (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-foreground">
                Unir <strong>Mesa {pad(mergeSource)}</strong> na <strong>Mesa {pad(mergeTarget)}</strong>? Clientes, pedidos e
                pagamentos da {pad(mergeSource)} vão para a {pad(mergeTarget)}, e a {pad(mergeSource)} fica livre.
              </p>
              <Button size="sm" onClick={handleMerge} disabled={merging}>
                {merging ? "Unindo…" : "Confirmar união"}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Mesas — grade única, cards de tamanho fixo (não encolhem conforme
          o número de mesas cresce, novas mesas só quebram pra próxima
          linha). A cor da borda vem da área da mesa; o fundo e o ponto
          continuam mostrando o status (livre/ocupada). */}
      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-3 sm:gap-4">
          {tables.map((table, i) => {
            const tableId = table.number;
            const status = getTableStatus(tableId);
            const session = getTableSession(tableId);
            const isReady = hasReadyOrders(tableId);
            const area = table.area_id ? areaById.get(table.area_id) : undefined;
            const isSelected = mode === "edit" && selectedIds.includes(table.id);
            const isMergeSource = mode === "merge" && mergeSource === tableId;
            const isMergeTarget = mode === "merge" && mergeTarget === tableId;
            const dimmed = mode === "merge" && status !== "occupied";
            return (
              <motion.button
                key={table.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{
                  opacity: dimmed ? 0.35 : 1,
                  scale: isReady ? [1, 1.06, 1] : 1,
                  boxShadow: isReady
                    ? ["0 0 0px hsl(var(--primary)/0)", "0 0 18px hsl(var(--primary)/0.5)", "0 0 0px hsl(var(--primary)/0)"]
                    : "none",
                }}
                transition={isReady ? { delay: i * 0.02, repeat: Infinity, duration: 1.5, ease: "easeInOut" } : { delay: i * 0.02 }}
                whileHover={{ scale: dimmed ? 1 : 1.04 }}
                whileTap={{ scale: dimmed ? 1 : 0.97 }}
                onClick={() => handleTableClick(tableId, table.id)}
                disabled={dimmed}
                title={area?.name}
                style={area && !isReady ? { borderColor: area.color } : undefined}
                className={`relative flex flex-col items-center justify-center rounded-xl border-2 p-4 transition-colors ${statusColors[status]} ${isReady ? "border-primary ring-2 ring-primary/30" : ""} ${isSelected || isMergeTarget ? "ring-4 ring-primary" : ""} ${isMergeSource ? "ring-4 ring-warning" : ""}`}
              >
                {isReady && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[8px] font-bold text-primary-foreground animate-bounce">
                    ✓
                  </span>
                )}
                {isSelected && (
                  <span className="absolute -top-1.5 -left-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="h-3 w-3" />
                  </span>
                )}
                <span className="text-3xl font-bold text-foreground leading-none" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                  {pad(tableId)}
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
          {showAddTile && (
            <button
              onClick={() => addTable()}
              className="flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-muted-foreground/30 p-4 text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
            >
              <Plus className="h-6 w-6" />
              <span className="text-[10px] font-medium">Mesa</span>
            </button>
          )}
        </div>
      </motion.section>

      {/* Session Panel */}
      {mode === "normal" && selectedTableId !== null && (
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
