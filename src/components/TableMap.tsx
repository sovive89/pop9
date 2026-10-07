import { useEffect, useMemo, useRef, useState } from "react";
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
    joins,
    loadJoins,
    joinTable,
  } = useTables();

  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
  const [selectedClient, setSelectedClient] = useState<ClientInfo | null>(null);
  const [mode, setMode] = useState<Mode>("normal");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [mergeSource, setMergeSource] = useState<number | null>(null);
  const [mergeTarget, setMergeTarget] = useState<number | null>(null);
  const [merging, setMerging] = useState(false);
  // Arrastar-e-soltar (modo unir): mesa sendo arrastada e mesa sob o dedo.
  const [dragging, setDragging] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const justDragged = useRef(false);

  const loading = sessionsLoading || tablesLoading;

  // Grupos (joined_tables) mudam junto com as comandas: recarrega a cada sync.
  useEffect(() => {
    loadJoins();
  }, [sessions, loadJoins]);

  // mesa unida → mesa que tem a conta do grupo
  const ownerOf = useMemo(() => {
    const m = new Map<number, number>();
    for (const [owner, members] of Object.entries(joins)) {
      if (!sessions[Number(owner)]) continue; // conta já fechada, ainda não recarregou
      for (const n of members) m.set(n, Number(owner));
    }
    return m;
  }, [joins, sessions]);
  const groupOwner = (n: number) => ownerOf.get(n) ?? n;
  const groupMembers = (owner: number) => [owner, ...(sessions[owner] ? joins[owner] ?? [] : [])].sort((a, b) => a - b);

  const areaById = useMemo(() => new Map(areas.map((a) => [a.id, a])), [areas]);
  const tableCountByArea = useMemo(() => {
    const m = new Map<string | null, number>();
    for (const t of tables) m.set(t.area_id, (m.get(t.area_id) ?? 0) + 1);
    return m;
  }, [tables]);

  const getTableStatus = (tableId: number): TableStatus =>
    sessions[tableId] || ownerOf.has(tableId) ? "occupied" : "free";

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
      if (justDragged.current) return; // o "click" que vem logo depois de soltar
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

  /**
   * Quem fica com a conta: a mesa onde soltou, se tiver conta aberta; senão a
   * arrastada (ex.: arrastou uma mesa ocupada para uma livre ao lado).
   * Devolve null quando nenhuma das duas tem conta.
   */
  const resolveJoin = (source: number, target: number) => {
    const s = groupOwner(source);
    const t = groupOwner(target);
    if (s === t) return null;
    if (sessions[t]) return { owner: t, joined: s };
    if (sessions[s]) return { owner: s, joined: t };
    return null;
  };
  const pendingJoin = mergeSource !== null && mergeTarget !== null ? resolveJoin(mergeSource, mergeTarget) : null;
  const pendingLabel = pendingJoin
    ? [...new Set([...groupMembers(pendingJoin.owner), ...groupMembers(pendingJoin.joined)])]
        .sort((a, b) => a - b)
        .map(pad)
        .join(" + ")
    : "";

  const handleMerge = async () => {
    if (!pendingJoin) return;
    const ownerSession = sessions[pendingJoin.owner]?.session.dbId;
    if (!ownerSession) return;
    setMerging(true);
    const ok = await joinTable(ownerSession, pendingJoin.joined);
    setMerging(false);
    if (ok) {
      toast.success(`Mesas ${pendingLabel} unidas`);
      changeMode("normal");
      await reloadSessions();
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
  const selectedOccupied = selectedTables.filter((t) => getTableStatus(t.number) === "occupied");
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
              <Button variant="outline" size="sm" onClick={() => changeMode("merge")} disabled={occupiedCount < 1 || tables.length < 2}>
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
              <strong>Arraste</strong> uma mesa e solte em cima da outra (ou toque numa e depois na outra). Pelo menos uma
              precisa ter conta aberta. As mesas ficam juntas até a conta ser fechada.
            </p>
          )}
          {mergeSource !== null && mergeTarget === null && (
            <p className="text-sm text-foreground">
              Mesa {pad(mergeSource)} escolhida. Agora toque na mesa que vai ficar <strong>junto</strong> com ela.
            </p>
          )}
          {mergeSource !== null && mergeTarget !== null && !pendingJoin && (
            <p className="text-sm text-warning">
              Pelo menos uma das mesas precisa ter conta aberta. Escolha de novo.
            </p>
          )}
          {pendingJoin && (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-foreground">
                Juntar{" "}
                <strong>Mesas {pendingLabel}</strong>
                ? A conta fica na Mesa {pad(pendingJoin.owner)}
                {sessions[pendingJoin.joined] ? ` (clientes, pedidos e pagamentos da ${pad(pendingJoin.joined)} vão para ela)` : ""}.
                Ao fechar a conta, todas ficam livres.
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
            // Fora da edição, mesa unida a outra não aparece sozinha: entra no
            // card do grupo, na posição da mesa que tem a conta.
            const grouped = mode !== "edit";
            if (grouped && ownerOf.has(tableId) && tables.some((t) => t.number === ownerOf.get(tableId))) return null;
            const members = grouped ? groupMembers(tableId) : [tableId];
            const isGroup = members.length > 1;
            const status = getTableStatus(tableId);
            const session = getTableSession(tableId);
            const isReady = hasReadyOrders(tableId);
            const area = table.area_id ? areaById.get(table.area_id) : undefined;
            const isSelected = mode === "edit" && selectedIds.includes(table.id);
            const isMergeSource = mode === "merge" && mergeSource === tableId;
            const isMergeTarget = mode === "merge" && (mergeTarget === tableId || dropTarget === tableId);
            const isDragging = dragging === tableId;
            // Escolhida uma mesa livre, as outras livres não servem (alguém precisa ter conta).
            const dimmed =
              mode === "merge" && mergeSource !== null && status === "free" && getTableStatus(groupOwner(mergeSource)) === "free";
            const canDrag = mode === "merge" && !dimmed;
            return (
              <motion.button
                key={table.id}
                data-table-number={tableId}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{
                  opacity: dimmed ? 0.35 : 1,
                  scale: isReady && !isDragging ? [1, 1.06, 1] : 1,
                  boxShadow: isReady
                    ? ["0 0 0px hsl(var(--primary)/0)", "0 0 18px hsl(var(--primary)/0.5)", "0 0 0px hsl(var(--primary)/0)"]
                    : "none",
                }}
                transition={isReady ? { delay: i * 0.02, repeat: Infinity, duration: 1.5, ease: "easeInOut" } : { delay: i * 0.02 }}
                whileHover={{ scale: dimmed ? 1 : 1.04 }}
                whileTap={{ scale: dimmed ? 1 : 0.97 }}
                drag={canDrag}
                dragSnapToOrigin
                dragElastic={1}
                dragMomentum={false}
                whileDrag={{ scale: 1.08, zIndex: 50, cursor: "grabbing" }}
                onDragStart={() => {
                  setDragging(tableId);
                  setMergeSource(null);
                  setMergeTarget(null);
                }}
                onDrag={(e) => {
                  const { x, y } = pointerXY(e);
                  setDropTarget(tableUnderPointer(x, y, tableId));
                }}
                onDragEnd={(e) => {
                  const { x, y } = pointerXY(e);
                  const target = tableUnderPointer(x, y, tableId);
                  setDragging(null);
                  setDropTarget(null);
                  justDragged.current = true;
                  setTimeout(() => (justDragged.current = false), 250);
                  if (target !== null) {
                    setMergeSource(tableId);
                    setMergeTarget(target);
                  }
                }}
                onClick={() => handleTableClick(tableId, table.id)}
                disabled={dimmed}
                title={isGroup ? `Mesas ${members.map(pad).join(" + ")}` : area?.name}
                style={{
                  ...(area && !isReady ? { borderColor: area.color } : {}),
                  ...(isGroup ? { gridColumn: `span ${Math.min(members.length, 3)}` } : {}),
                  ...(canDrag ? { cursor: "grab", touchAction: "none" } : {}),
                }}
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
                {isGroup ? (
                  // Interseção: círculos translúcidos sobrepostos — a área em
                  // comum fica mais escura, como num diagrama de Venn.
                  <span className="flex items-center" aria-label={`Mesas ${members.map(pad).join(" + ")} unidas`}>
                    {members.map((n, idx) => (
                      <span
                        key={n}
                        className={`flex h-12 w-12 items-center justify-center rounded-full border-2 border-primary bg-primary/25 text-2xl font-bold leading-none text-foreground ${idx > 0 ? "-ml-4" : ""}`}
                        style={{ fontFamily: "'Bebas Neue', sans-serif" }}
                      >
                        {pad(n)}
                      </span>
                    ))}
                  </span>
                ) : (
                  <span className="text-3xl font-bold text-foreground leading-none" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                    {pad(tableId)}
                  </span>
                )}
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
