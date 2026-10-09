import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Users, Flame, Plus, Check, Pencil, Link2, Unlink, Trash2, X, Armchair } from "lucide-react";
import { toast } from "sonner";
import TableSessionPanel, { type TableSession, type ClientInfo } from "./TableSessionPanel";
import ClientOrderPanel from "./ClientOrderPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type ClientOrder, type OrderItem } from "@/utils/orders";
import { useSessionStore } from "@/hooks/useSessionStore";
import {
  useTables,
  DEFAULT_AREA_COLOR,
  NO_AREA_COLOR,
  type TableArea,
  type DiningTable,
} from "@/hooks/useTables";

type ClientInput = Omit<ClientInfo, "id" | "addedAt">;
type TableStatus = "free" | "occupied" | "reserved";
type Mode = "normal" | "edit" | "join";

/** Um item da grade: uma mesa sozinha ou um grupo de mesas unidas. */
type GridItem =
  | { kind: "single"; table: DiningTable }
  | { kind: "group"; groupId: string; members: DiningTable[] };

const DEFAULT_ZONE = "salao";
const NONE = "__none__";

const statusColors: Record<TableStatus, string> = {
  free: "border-muted-foreground/30 bg-secondary hover:bg-secondary/80 hover:border-primary/50",
  occupied: "border-primary bg-primary/15 hover:bg-primary/25",
  reserved: "border-warning bg-warning/10 hover:bg-warning/15",
};

// Mesas unidas usam fundo translúcido: onde uma mesa se sobrepõe à outra,
// as duas aparecem por transparência — é a "leve interseção" da união.
const groupedStatusColors: Record<TableStatus, string> = {
  free: "border-muted-foreground/30 bg-secondary/60 hover:bg-secondary/80 hover:border-primary/50",
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

  // Última cor escolhida e a que já está salva, para gravar ao desmontar.
  const latest = useRef({ color, saved: area.color, id: area.id, onUpdate });
  latest.current = { color, saved: area.color, id: area.id, onUpdate };

  // O seletor de cor dispara o tempo todo enquanto o dedo arrasta; só grava
  // no banco quando para de mexer por meio segundo.
  useEffect(() => {
    if (color === area.color) return;
    const t = setTimeout(() => onUpdate(area.id, { color }), 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color]);

  // "Concluir" desmonta a linha: se ainda havia cor pendente (< 500 ms), grava agora.
  useEffect(
    () => () => {
      const { color: c, saved, id, onUpdate: update } = latest.current;
      if (c !== saved) void update(id, { color: c });
    },
    [],
  );

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
  const { sessions, loading: sessionsLoading, startSession, addClient, closeSession, placeOrder, updateLocalCart } =
    useSessionStore();
  const {
    tables,
    areas,
    loading: tablesLoading,
    editable,
    isAdmin,
    addTable,
    archiveTables,
    moveTablesToArea,
    setSeats,
    createArea,
    updateArea,
    deleteArea,
    joinTables,
    splitGroup,
  } = useTables();

  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
  const [selectedClient, setSelectedClient] = useState<ClientInfo | null>(null);
  const [mode, setMode] = useState<Mode>("normal");
  const [selectedIds, setSelectedIds] = useState<string[]>([]); // edição e união
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [seatsInput, setSeatsInput] = useState("");
  const [confirmSplit, setConfirmSplit] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Arrastar-e-soltar (modo unir): mesa sendo arrastada e mesa sob o dedo.
  const [dragging, setDragging] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const justDragged = useRef(false);

  const loading = sessionsLoading || tablesLoading;

  const areaById = useMemo(() => new Map(areas.map((a) => [a.id, a])), [areas]);
  const tableCountByArea = useMemo(() => {
    const m = new Map<string | null, number>();
    for (const t of tables) m.set(t.area_id, (m.get(t.area_id) ?? 0) + 1);
    return m;
  }, [tables]);

  // Mesas de cada grupo, em ordem de número. Grupo com uma mesa só (a outra
  // foi arquivada) é tratado como mesa avulsa.
  const membersByGroup = useMemo(() => {
    const m = new Map<string, DiningTable[]>();
    for (const t of tables) {
      if (!t.group_id) continue;
      const list = m.get(t.group_id) ?? [];
      list.push(t);
      m.set(t.group_id, list);
    }
    for (const [k, v] of m) if (v.length < 2) m.delete(k);
    return m;
  }, [tables]);

  const gridItems = useMemo<GridItem[]>(() => {
    const items: GridItem[] = [];
    const placed = new Set<string>();
    for (const t of tables) {
      const members = t.group_id ? membersByGroup.get(t.group_id) : undefined;
      if (!members) {
        items.push({ kind: "single", table: t });
      } else if (!placed.has(t.group_id!)) {
        // o grupo aparece na posição da mesa de menor número
        placed.add(t.group_id!);
        items.push({ kind: "group", groupId: t.group_id!, members });
      }
    }
    return items;
  }, [tables, membersByGroup]);

  const groupOf = (table: DiningTable): DiningTable[] | undefined =>
    table.group_id ? membersByGroup.get(table.group_id) : undefined;

  /**
   * Comanda que uma mesa mostra/abre. Comandas nunca são juntadas — cada uma é
   * da sua mesa (e do QR Code dela). Mas numa mesa unida sem comanda própria,
   * quando só UMA mesa do grupo tem comanda (todos escanearam o mesmo QR),
   * a mesa "empresta" a comanda do grupo: aparece ocupada e o toque abre a
   * comanda certa.
   */
  const sessionNumberFor = (table: DiningTable): number => {
    if (sessions[table.number]) return table.number;
    const members = groupOf(table);
    if (!members) return table.number;
    const withSession = members.filter((m) => sessions[m.number]);
    return withSession.length === 1 ? withSession[0].number : table.number;
  };

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
    setSeatsInput("");
    setConfirmSplit(null);
    setSelectedTableId(null);
    setSelectedClient(null);
  };

  const toggleSelected = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const handleTableClick = (table: DiningTable) => {
    if (mode === "edit") {
      setConfirmArchive(false);
      toggleSelected(table.id);
      return;
    }
    if (mode === "join") {
      if (justDragged.current) return; // o "click" que vem logo depois de soltar
      if (groupOf(table)) return; // já unida: separa antes
      toggleSelected(table.id);
      return;
    }
    setConfirmSplit(null);
    setSelectedTableId(sessionNumberFor(table));
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

  const handleJoin = async () => {
    if (selectedIds.length < 2) return;
    const numbers = tables
      .filter((t) => selectedIds.includes(t.id))
      .map((t) => pad(t.number))
      .join(" + ");
    setBusy(true);
    const ok = await joinTables(selectedIds);
    setBusy(false);
    if (ok) {
      toast.success(`Mesas ${numbers} unidas`);
      changeMode("normal");
    }
  };

  // Mesa (card) sob o ponteiro, ignorando a que está sendo arrastada.
  const tableUnderPointer = (x: number, y: number, exclude: number): number | null => {
    for (const el of document.elementsFromPoint(x, y)) {
      const n = (el as HTMLElement).closest?.("[data-table-number]")?.getAttribute("data-table-number");
      if (n && Number(n) !== exclude) return Number(n);
    }
    return null;
  };

  const pointerXY = (e: MouseEvent | TouchEvent | PointerEvent) => {
    if ("changedTouches" in e && e.changedTouches.length) {
      return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    }
    const p = e as MouseEvent;
    return { x: p.clientX, y: p.clientY };
  };

  /** Soltou a mesa `source` em cima da mesa `targetNumber`: seleciona as duas para unir. */
  const handleDrop = (source: DiningTable, targetNumber: number | null) => {
    const target = targetNumber === null ? undefined : tables.find((t) => t.number === targetNumber);
    if (!target || groupOf(target)) return;
    setSelectedIds((prev) => [...new Set([...prev, source.id, target.id])]);
  };

  const handleSplit = async (groupId: string) => {
    if (confirmSplit !== groupId) {
      setConfirmSplit(groupId);
      return;
    }
    setBusy(true);
    const ok = await splitGroup(groupId);
    setBusy(false);
    setConfirmSplit(null);
    if (ok) toast.success("Mesas separadas");
  };

  const handleMoveSelected = async (value: string) => {
    if (!value) return;
    const ok = await moveTablesToArea(selectedIds, value === NONE ? null : value);
    if (ok) setSelectedIds([]);
  };

  const handleApplySeats = async () => {
    const n = Number(seatsInput);
    const ok = await setSeats(selectedIds, n);
    if (ok) {
      setSeatsInput("");
      setSelectedIds([]);
    }
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

  // Contagem: mesa sem comanda própria, mas unida a uma mesa ocupada, conta como ocupada.
  const tableStatus = (t: DiningTable): TableStatus => getTableStatus(sessionNumberFor(t));
  const counts = {
    free: tables.filter((t) => tableStatus(t) === "free").length,
    occupied: tables.filter((t) => tableStatus(t) === "occupied").length,
    reserved: 0,
  };
  const totalSeats = tables.reduce((sum, t) => sum + t.seats, 0);

  const selectedTables = tables.filter((t) => selectedIds.includes(t.id));
  const selectedOccupied = selectedTables.filter((t) => sessions[t.number]);
  const selectedGrouped = selectedTables.filter((t) => groupOf(t));
  const selectedSeats = selectedTables.reduce((sum, t) => sum + t.seats, 0);
  const ungroupedCount = tables.filter((t) => !groupOf(t)).length;
  const showAddTile = mode === "edit" || !editable; // sem a migration, mantém o "+ Mesa" antigo
  const hasUnassigned = (tableCountByArea.get(null) ?? 0) > 0;
  const seatsValid = /^\d{1,2}$/.test(seatsInput) && Number(seatsInput) >= 1;

  const renderTable = (table: DiningTable, index: number, grouped: boolean, firstInGroup: boolean) => {
    const sessionNumber = sessionNumberFor(table);
    const status = getTableStatus(sessionNumber);
    const session = getTableSession(sessionNumber);
    const ownsSession = sessionNumber === table.number && !!session;
    const readyCount = ownsSession ? (sessions[table.number]?.orders ?? []).reduce((count, clientOrder) => count + clientOrder.orders.filter((order) => order.status === "ready").length, 0) : 0;
    const isReady = readyCount > 0;
    const area = table.area_id ? areaById.get(table.area_id) : undefined;
    const isSelected = (mode === "edit" || mode === "join") && selectedIds.includes(table.id);
    const dimmed = mode === "join" && grouped;
    const colors = grouped ? groupedStatusColors : statusColors;
    const canDrag = mode === "join" && !grouped;
    const isDragging = dragging === table.number;
    const isDropTarget = mode === "join" && dropTarget === table.number && !grouped;

    return (
      <motion.button
        key={table.id}
        data-table-number={table.number}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{
          opacity: dimmed ? 0.35 : 1,
          scale: isReady && !isDragging ? [1, 1.06, 1] : 1,
          boxShadow: isReady
            ? ["0 0 0px hsl(var(--primary)/0)", "0 0 18px hsl(var(--primary)/0.5)", "0 0 0px hsl(var(--primary)/0)"]
            : "none",
        }}
        transition={isReady ? { delay: index * 0.02, repeat: Infinity, duration: 1.5, ease: "easeInOut" } : { delay: index * 0.02 }}
        whileHover={{ scale: dimmed ? 1 : 1.04, zIndex: 10 }}
        whileTap={{ scale: dimmed ? 1 : 0.97 }}
        drag={canDrag}
        dragSnapToOrigin
        dragElastic={1}
        dragMomentum={false}
        whileDrag={{ scale: 1.08, zIndex: 50, cursor: "grabbing" }}
        onDragStart={() => setDragging(table.number)}
        onDrag={(e) => {
          const { x, y } = pointerXY(e);
          setDropTarget(tableUnderPointer(x, y, table.number));
        }}
        onDragEnd={(e) => {
          const { x, y } = pointerXY(e);
          const target = tableUnderPointer(x, y, table.number);
          setDragging(null);
          setDropTarget(null);
          justDragged.current = true;
          setTimeout(() => (justDragged.current = false), 250);
          handleDrop(table, target);
        }}
        onClick={() => handleTableClick(table)}
        disabled={dimmed}
        title={isReady ? `Mesa ${table.number}: ${readyCount} pedido(s) pronto(s) para retirada` : area?.name}
        aria-label={`Mesa ${table.number}${isReady ? `, ${readyCount} pedido(s) pronto(s) para retirada` : ""}`}
        style={{
          ...(area && !isReady ? { borderColor: area.color } : {}),
          ...(canDrag ? { cursor: "grab", touchAction: "none" } : {}),
        }}
        className={`relative flex flex-col items-center justify-center rounded-xl border-2 p-4 transition-colors ${colors[status]} ${
          grouped ? `min-w-0 flex-1 ${firstInGroup ? "" : "-ml-3"}` : ""
        } ${isReady ? "border-primary ring-2 ring-primary/30" : ""} ${isSelected || isDropTarget ? "ring-4 ring-primary" : ""}`}
      >
        {isReady && (
          <span className="absolute -top-1.5 -right-1.5 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground animate-bounce">
            {readyCount}
          </span>
        )}
        {isSelected && (
          <span className="absolute -top-1.5 -left-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Check className="h-3 w-3" />
          </span>
        )}
        <span className="text-3xl font-bold text-foreground leading-none" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
          {pad(table.number)}
        </span>
        <span className={`mt-2 h-2 w-2 rounded-full ${statusDot[status]}`} />
        {ownsSession ? (
          <div className="mt-1 flex items-center gap-1">
            <Users className="h-3 w-3 text-primary" />
            <span className="text-[10px] text-primary font-medium">
              {session!.clients.length}/{table.seats}
            </span>
          </div>
        ) : (
          <div className="mt-1 flex items-center gap-1 text-muted-foreground">
            <Armchair className="h-3 w-3" />
            <span className="text-[10px] font-medium">{table.seats}</span>
          </div>
        )}
      </motion.button>
    );
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
        {editable && (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2">
            <Armchair className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              Lugares: <span className="font-semibold text-foreground">{totalSeats}</span>
            </span>
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          {mode === "normal" && editable && (
            <>
              <Button variant="outline" size="sm" onClick={() => changeMode("join")} disabled={ungroupedCount < 2}>
                <Link2 className="mr-1.5 h-4 w-4" /> Unir mesas
              </Button>
              {isAdmin && (
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
          {mode === "join" && (
            <Button variant="outline" size="sm" onClick={() => changeMode("normal")}>
              <X className="mr-1.5 h-4 w-4" /> Cancelar
            </Button>
          )}
        </div>
      </div>

      {/* Legenda das áreas (fora da edição) */}
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
              Cada área tem uma cor. Toque nas mesas abaixo para selecionar e definir lugares, mover de área ou arquivar.
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
          <div className="flex items-center gap-1.5">
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={99}
              value={seatsInput}
              onChange={(e) => setSeatsInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && seatsValid && handleApplySeats()}
              placeholder="Lugares"
              className="h-9 w-24"
              aria-label="Lugares por mesa"
            />
            <Button size="sm" variant="outline" onClick={handleApplySeats} disabled={!seatsValid}>
              <Armchair className="mr-1.5 h-4 w-4" /> Aplicar
            </Button>
          </div>
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
            disabled={selectedOccupied.length > 0 || selectedGrouped.length > 0}
          >
            <Trash2 className="mr-1.5 h-4 w-4" />
            {confirmArchive ? "Confirmar arquivar?" : "Arquivar"}
          </Button>
          {selectedOccupied.length > 0 ? (
            <span className="text-xs text-warning">
              Mesa {selectedOccupied.map((t) => pad(t.number)).join(", ")} com conta aberta: feche a conta antes de arquivar.
            </span>
          ) : selectedGrouped.length > 0 ? (
            <span className="text-xs text-warning">
              Mesa {selectedGrouped.map((t) => pad(t.number)).join(", ")} está unida a outras: separe antes de arquivar.
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
      {mode === "join" && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/40 bg-primary/10 px-4 py-3">
          {selectedIds.length < 2 ? (
            <p className="text-sm text-foreground">
              <strong>Arraste</strong> uma mesa e solte em cima da outra, ou toque nas mesas que vão ficar juntas (pelo
              menos 2). Cada mesa continua com a sua comanda e o seu QR Code.
            </p>
          ) : (
            <>
              <p className="text-sm text-foreground">
                Unir <strong>Mesas {selectedTables.map((t) => pad(t.number)).join(" + ")}</strong> —{" "}
                <strong>{selectedSeats} lugares</strong>.
              </p>
              <Button size="sm" onClick={handleJoin} disabled={busy}>
                <Link2 className="mr-1.5 h-4 w-4" />
                {busy ? "Unindo…" : "Unir"}
              </Button>
            </>
          )}
        </div>
      )}

      {/* Mesas — grade única, cards de tamanho fixo. A cor da borda vem da área
          da mesa; o fundo e o ponto mostram o status (livre/ocupada). Mesas
          unidas ocupam várias colunas, sobrepostas com transparência. */}
      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-3 sm:gap-4">
          {gridItems.map((item, i) => {
            if (item.kind === "single") return renderTable(item.table, i, false, false);

            const groupSeats = item.members.reduce((sum, t) => sum + t.seats, 0);
            return (
              <div
                key={item.groupId}
                className="relative flex"
                style={{ gridColumn: `span ${Math.min(item.members.length, 4)}` }}
              >
                {item.members.map((t, j) => renderTable(t, i, true, j === 0))}
                <div className="absolute -top-2.5 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-card px-2 py-0.5 text-[10px] text-muted-foreground shadow-sm">
                  <Armchair className="h-3 w-3" />
                  {groupSeats} lugares
                  {mode === "normal" && (
                    <button
                      onClick={() => handleSplit(item.groupId)}
                      disabled={busy}
                      className="ml-0.5 flex items-center gap-0.5 font-medium text-primary hover:underline"
                    >
                      <Unlink className="h-3 w-3" />
                      {confirmSplit === item.groupId ? "Confirmar?" : "Separar"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {showAddTile && isAdmin && (
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
          canCloseAccount={isAdmin}
          onCloseSession={() => handleCloseSession(selectedTableId)}
          onClose={() => setSelectedTableId(null)}
          onSelectClient={(client) => setSelectedClient(client)}
        />
      )}
    </div>
  );
};

export default TableMap;
