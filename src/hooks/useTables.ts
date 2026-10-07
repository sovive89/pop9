import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCurrentBusinessUnit } from "@/hooks/useCurrentBusinessUnit";

export interface TableArea {
  id: string;
  name: string;
  color: string; // "#rrggbb"
  sort_order: number;
}

export interface DiningTable {
  id: string;
  /** Número que o garçom vê. É o mesmo valor guardado em sessions.table_number. */
  number: number;
  area_id: string | null;
}

const DEFAULT_TABLE_COUNT = 3;

export const NO_AREA_COLOR = "#71717a";
export const DEFAULT_AREA_COLOR = "#f97316";

/**
 * Mesas e áreas do mapa (tabelas dining_tables / table_areas).
 *
 * Substitui o useTableCount, que só guardava "quantas mesas existem". Aqui
 * cada mesa é um registro, então dá para ter cor/legenda por área e arquivar
 * (= "deletar") uma mesa sem apagar o histórico.
 *
 * Se a migration 20261006220000 ainda não foi aplicada no banco, o hook cai
 * no modo legado: monta as mesas 1..table_count como antes e `editable` fica
 * false (o mapa funciona, só não oferece edição). Mesmo comportamento do
 * resto do app com migrations pendentes.
 */
export const useTables = () => {
  const { user } = useAuth();
  const { businessUnitId } = useCurrentBusinessUnit();
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [areas, setAreas] = useState<TableArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [editable, setEditable] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  // Só admin configura (RLS também impede os outros de gravar).
  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      return;
    }
    let cancelled = false;
    supabase.rpc("has_role", { _user_id: user.id, _role: "admin" }).then(({ data }) => {
      if (!cancelled) setIsAdmin(data === true);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const load = useCallback(async () => {
    if (!businessUnitId) return;

    const [tablesRes, areasRes] = await Promise.all([
      supabase
        .from("dining_tables")
        .select("id, number, area_id")
        .eq("business_unit_id", businessUnitId)
        .is("archived_at", null)
        .order("number"),
      supabase
        .from("table_areas")
        .select("id, name, color, sort_order")
        .eq("business_unit_id", businessUnitId)
        .order("sort_order")
        .order("name"),
    ]);

    if (tablesRes.error || areasRes.error) {
      console.warn("dining_tables/table_areas indisponíveis, usando table_count:", tablesRes.error ?? areasRes.error);
      const { data } = await supabase
        .from("business_units")
        .select("table_count")
        .eq("id", businessUnitId)
        .maybeSingle();
      const count = data?.table_count ?? DEFAULT_TABLE_COUNT;
      setTables(Array.from({ length: count }, (_, i) => ({ id: `legacy-${i + 1}`, number: i + 1, area_id: null })));
      setAreas([]);
      setEditable(false);
    } else {
      setTables(tablesRes.data ?? []);
      setAreas(areasRes.data ?? []);
      setEditable(true);
    }
    setLoading(false);
  }, [businessUnitId]);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * business_units.table_count continua sendo lido pelo QrCodesTab. Mantemos
   * ele igual ao maior número de mesa ativa para os QR Codes não divergirem.
   */
  const syncTableCount = useCallback(async () => {
    if (!businessUnitId) return;
    const { data, error: readError } = await supabase
      .from("dining_tables")
      .select("number")
      .eq("business_unit_id", businessUnitId)
      .is("archived_at", null)
      .order("number", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (readError) {
      toast.error("Mesas salvas, mas não deu para atualizar a contagem usada nos QR Codes");
      return;
    }
    // Sem mesas ativas, 0 é intencional: o QrCodesTab mostra "nenhuma mesa configurada".
    const { error } = await supabase
      .from("business_units")
      .update({ table_count: data?.number ?? 0 })
      .eq("id", businessUnitId);
    if (error) toast.error("Mesas salvas, mas não deu para atualizar a contagem usada nos QR Codes");
  }, [businessUnitId]);

  const addTable = useCallback(async (): Promise<boolean> => {
    if (!businessUnitId) return false;

    // Modo legado (migration não aplicada): comportamento antigo, só incrementa table_count.
    if (!editable) {
      const { error: legacyError } = await supabase
        .from("business_units")
        .update({ table_count: tables.length + 1 })
        .eq("id", businessUnitId);
      if (legacyError) {
        toast.error("Não foi possível criar a mesa");
        return false;
      }
      await load();
      return true;
    }

    // máximo entre TODAS (inclusive arquivadas): número arquivado não é reutilizado
    const { data: last } = await supabase
      .from("dining_tables")
      .select("number")
      .eq("business_unit_id", businessUnitId)
      .order("number", { ascending: false })
      .limit(1)
      .maybeSingle();
    const next = (last?.number ?? 0) + 1;
    const { error } = await supabase
      .from("dining_tables")
      .insert({ business_unit_id: businessUnitId, number: next });
    if (error) {
      toast.error("Não foi possível criar a mesa");
      return false;
    }
    await syncTableCount();
    await load();
    return true;
  }, [businessUnitId, editable, tables.length, load, syncTableCount]);

  /** "Deletar" = arquivar. O histórico (sessions.table_number) fica intacto. */
  const archiveTables = useCallback(
    async (ids: string[]): Promise<boolean> => {
      if (ids.length === 0) return true;
      const { error } = await supabase
        .from("dining_tables")
        .update({ archived_at: new Date().toISOString() })
        .in("id", ids);
      if (error) {
        toast.error("Não foi possível arquivar as mesas");
        return false;
      }
      await syncTableCount();
      await load();
      return true;
    },
    [load, syncTableCount],
  );

  const moveTablesToArea = useCallback(
    async (ids: string[], areaId: string | null): Promise<boolean> => {
      if (ids.length === 0) return true;
      const { error } = await supabase.from("dining_tables").update({ area_id: areaId }).in("id", ids);
      if (error) {
        toast.error("Não foi possível mover as mesas de área");
        return false;
      }
      await load();
      return true;
    },
    [load],
  );

  const createArea = useCallback(
    async (name: string, color: string): Promise<boolean> => {
      const trimmed = name.trim();
      if (!businessUnitId || !trimmed) return false;
      const nextOrder = areas.reduce((max, a) => Math.max(max, a.sort_order), -1) + 1;
      const { error } = await supabase
        .from("table_areas")
        .insert({ business_unit_id: businessUnitId, name: trimmed, color, sort_order: nextOrder });
      if (error) {
        toast.error(error.code === "23505" ? "Já existe uma área com esse nome" : "Não foi possível criar a área");
        return false;
      }
      await load();
      return true;
    },
    [areas, businessUnitId, load],
  );

  const updateArea = useCallback(
    async (id: string, patch: { name?: string; color?: string }): Promise<boolean> => {
      const next = { ...patch };
      if (next.name !== undefined) {
        next.name = next.name.trim();
        if (!next.name) return false;
      }
      const { error } = await supabase.from("table_areas").update(next).eq("id", id);
      if (error) {
        toast.error(error.code === "23505" ? "Já existe uma área com esse nome" : "Não foi possível salvar a área");
        return false;
      }
      await load();
      return true;
    },
    [load],
  );

  /** Apagar uma área não apaga as mesas: elas voltam a ficar "sem área". */
  const deleteArea = useCallback(
    async (id: string): Promise<boolean> => {
      const { error } = await supabase.from("table_areas").delete().eq("id", id);
      if (error) {
        toast.error("Não foi possível apagar a área");
        return false;
      }
      await load();
      return true;
    },
    [load],
  );

  /** Une as contas: tudo de `sourceSessionId` vai para `targetSessionId` (uma transação no banco). */
  const mergeSessions = useCallback(async (sourceSessionId: string, targetSessionId: string): Promise<boolean> => {
    const { error } = await supabase.rpc("merge_sessions", {
      p_source: sourceSessionId,
      p_target: targetSessionId,
    });
    if (error) {
      toast.error(error.message || "Não foi possível unir as mesas");
      return false;
    }
    return true;
  }, []);

  /**
   * Grupos de mesas unidas: número da mesa que tem a conta → outras mesas do
   * grupo (sessions.joined_tables). Sem a migration 20261007090000 fica vazio.
   */
  const [joins, setJoins] = useState<Record<number, number[]>>({});

  const loadJoins = useCallback(async () => {
    if (!businessUnitId) return;
    const { data, error } = await supabase
      .from("sessions")
      .select("table_number, joined_tables")
      .eq("business_unit_id", businessUnitId)
      .eq("status", "active");
    if (error) {
      setJoins({});
      return;
    }
    const next: Record<number, number[]> = {};
    for (const s of data ?? []) {
      if (s.joined_tables?.length) next[s.table_number] = s.joined_tables;
    }
    setJoins(next);
  }, [businessUnitId]);

  useEffect(() => {
    loadJoins();
  }, [loadJoins]);

  /**
   * Junta a mesa `tableNumber` (livre ou ocupada) ao grupo da comanda
   * `targetSessionId`. Se ela tinha conta, a conta é absorvida (merge_sessions).
   */
  const joinTable = useCallback(
    async (targetSessionId: string, tableNumber: number): Promise<boolean> => {
      const { error } = await supabase.rpc("join_tables", {
        p_target: targetSessionId,
        p_table_number: tableNumber,
      });
      if (error) {
        toast.error(error.message || "Não foi possível unir as mesas");
        return false;
      }
      await loadJoins();
      return true;
    },
    [loadJoins],
  );

  return {
    tables,
    areas,
    loading: loading && !!businessUnitId,
    editable,
    isAdmin,
    addTable,
    archiveTables,
    moveTablesToArea,
    createArea,
    updateArea,
    deleteArea,
    mergeSessions,
    joins,
    loadJoins,
    joinTable,
  };
};
