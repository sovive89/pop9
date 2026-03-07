import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface TableZone {
  id: string;
  key: string;
  label: string;
  icon: string;
  cols: number;
  table_start: number;
  table_end: number;
  sort_order: number;
}

export interface TableDef {
  id: number;
  zone: string;
}

// Fallback hardcoded config
const fallbackZones: TableZone[] = [
  { id: "1", key: "salao", label: "Salão Principal", icon: "UtensilsCrossed", cols: 4, table_start: 1, table_end: 12, sort_order: 0 },
  { id: "2", key: "varanda", label: "Varanda", icon: "Coffee", cols: 5, table_start: 13, table_end: 22, sort_order: 1 },
  { id: "3", key: "vip", label: "Área VIP", icon: "Users", cols: 4, table_start: 23, table_end: 30, sort_order: 2 },
];

export const useTableZones = () => {
  const [zones, setZones] = useState<TableZone[]>(fallbackZones);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("table_zones")
        .select("*")
        .order("sort_order");

      if (!error && data && data.length > 0) {
        setZones(data);
      }
    } catch {
      // fallback
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Derive flat table list from zones
  const allTables: TableDef[] = zones.flatMap((z) =>
    Array.from({ length: z.table_end - z.table_start + 1 }, (_, i) => ({
      id: z.table_start + i,
      zone: z.key,
    }))
  );

  const getZoneForTable = (tableId: number): TableZone | undefined =>
    zones.find((z) => tableId >= z.table_start && tableId <= z.table_end);

  return { zones, allTables, loading, getZoneForTable, reload: load };
};
