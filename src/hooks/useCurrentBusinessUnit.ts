import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * business_unit_id agora é NOT NULL em toda tabela raiz do schema, mas o
 * app ainda não tem seletor de unidade (só existe 1 business_unit ativa
 * hoje). Este hook resolve essa única unidade — quando existir mais de
 * uma, é aqui que entra a lógica de seleção/contexto de unidade.
 */
export const useCurrentBusinessUnit = () => {
  const [businessUnitId, setBusinessUnitId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("business_units")
      .select("id")
      .eq("active", true)
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setBusinessUnitId(data?.id ?? null);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { businessUnitId, loading };
};
