import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentBusinessUnit } from "@/hooks/useCurrentBusinessUnit";

const DEFAULT_TABLE_COUNT = 3;

/**
 * Número de mesas do mapa vem de business_units.table_count (persistido,
 * por unidade) em vez do antigo esquema de zonas fixas por range
 * (table_zones — tabela que nem existia de verdade no banco, o app rodava
 * inteiro em cima de um fallback hardcoded). Começa em 3 quando a unidade
 * ainda não tem table_count definido.
 */
export const useTableCount = () => {
  const { businessUnitId } = useCurrentBusinessUnit();
  const [tableCount, setTableCount] = useState(DEFAULT_TABLE_COUNT);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!businessUnitId) return;
    const { data } = await supabase
      .from("business_units")
      .select("table_count")
      .eq("id", businessUnitId)
      .maybeSingle();
    setTableCount(data?.table_count ?? DEFAULT_TABLE_COUNT);
    setLoading(false);
  }, [businessUnitId]);

  useEffect(() => {
    load();
  }, [load]);

  const addTable = useCallback(async () => {
    if (!businessUnitId) return;
    const next = tableCount + 1;
    setTableCount(next); // otimista
    const { error } = await supabase
      .from("business_units")
      .update({ table_count: next })
      .eq("id", businessUnitId);
    if (error) {
      setTableCount(tableCount); // reverte se falhar
    }
  }, [businessUnitId, tableCount]);

  return { tableCount, loading: loading && !!businessUnitId, addTable };
};
