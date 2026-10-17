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

type SectorQuery = {
  select(columns: string): { eq(column: string, value: string): { order(column: string): Promise<{ data: PrintSector[] | null; error: { message: string } | null }> } };
};
// print_sectors ainda não está nos tipos gerados do Supabase.
const sectorsTable = () => (supabase as unknown as { from(table: "print_sectors"): SectorQuery }).from("print_sectors");

export const sectorName = (sectors: PrintSector[], slug: string | null | undefined) =>
  sectors.find((s) => s.slug === slug)?.name ?? DEFAULT_PRINT_SECTORS.find((s) => s.slug === slug)?.name ?? slug ?? "";

export function usePrintSectors() {
  const { businessUnitId } = useCurrentBusinessUnit();
  const [state, setState] = useState<{ unit: string | null; sectors: PrintSector[] }>({ unit: null, sectors: DEFAULT_PRINT_SECTORS });
  const load = useCallback(async () => {
    if (!businessUnitId) return;
    const unit = businessUnitId;
    try {
      const { data, error } = await sectorsTable().select("slug,name,active").eq("business_unit_id", unit).order("name");
      if (error) throw error;
      setState({ unit, sectors: data?.length ? data : DEFAULT_PRINT_SECTORS });
    } catch (error) {
      console.error("print sectors", error);
      setState({ unit, sectors: DEFAULT_PRINT_SECTORS });
    }
  }, [businessUnitId]);
  useEffect(() => { void load(); }, [load]);
  const sectors = state.unit === businessUnitId ? state.sectors : DEFAULT_PRINT_SECTORS;
  return { sectors, activeSectors: sectors.filter((s) => s.active), reload: load };
}
