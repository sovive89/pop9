import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentBusinessUnit } from "@/hooks/useCurrentBusinessUnit";

/** Setor de produção/impressão (tabela print_sectors): Cozinha, Bar, Caixa e os criados pelo admin. */
export type PrintSector = { slug: string; name: string; active: boolean };

/** Padrões usados enquanto a tabela não carregou (ou não existe nesta instalação). */
export const DEFAULT_PRINT_SECTORS: PrintSector[] = [
  { slug: "kitchen", name: "Cozinha", active: true },
  { slug: "bar", name: "Bar", active: true },
  { slug: "cashier", name: "Caixa", active: true },
];

type Query = PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }> & {
  select: (cols: string) => Query; eq: (col: string, v: unknown) => Query; order: (col: string) => Query;
};
/** print_sectors ainda não está nos tipos gerados do Supabase: acesso tipado à mão, sem "any". */
export const printSectorsTable = () =>
  (supabase as unknown as { from: (t: string) => { select: (c: string) => Query; insert: (v: Record<string, unknown>) => Query } }).from("print_sectors");

export const sectorName = (sectors: PrintSector[], slug: string | null | undefined) =>
  sectors.find((s) => s.slug === slug)?.name ?? DEFAULT_PRINT_SECTORS.find((s) => s.slug === slug)?.name ?? slug ?? "";

export function usePrintSectors() {
  const { businessUnitId } = useCurrentBusinessUnit();
  const [state, setState] = useState<{ unit: string | null; sectors: PrintSector[] }>({ unit: null, sectors: DEFAULT_PRINT_SECTORS });
  const load = useCallback(async () => {
    if (!businessUnitId) return;
    const unit = businessUnitId;
    const { data, error } = await printSectorsTable().select("slug,name,active").eq("business_unit_id", unit).order("name");
    if (error) { console.error("print sectors", error); setState({ unit, sectors: DEFAULT_PRINT_SECTORS }); return; }
    const rows = (data as PrintSector[] | null) ?? [];
    setState({ unit, sectors: rows.length ? rows : DEFAULT_PRINT_SECTORS });
  }, [businessUnitId]);
  useEffect(() => { void load(); }, [load]);
  const sectors = state.unit === businessUnitId ? state.sectors : DEFAULT_PRINT_SECTORS;
  return { sectors, activeSectors: sectors.filter((s) => s.active), reload: load };
}
