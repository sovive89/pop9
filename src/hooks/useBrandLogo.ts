import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// brand_settings ainda não está nos tipos gerados do Supabase.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as { from: (table: string) => any };

/** Logo da aba Marca para a unidade (null se não houver ou sem permissão). */
export function useBrandLogo(unitId: string | null | undefined) {
  const [logo, setLogo] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    setLogo(null);
    setLoaded(false);
    if (!unitId) { setLoaded(true); return; }
    void db.from("brand_settings").select("logo_url").eq("business_unit_id", unitId).maybeSingle()
      .then(({ data }: { data: { logo_url: string | null } | null }) => {
        if (!alive) return;
        setLogo(data?.logo_url ?? null);
        setLoaded(true);
      });
    return () => { alive = false; };
  }, [unitId]);
  return { logo, loaded };
}
