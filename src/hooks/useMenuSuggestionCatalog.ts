import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { catalogWords, type MenuSuggestion } from '@/lib/menu-suggestions';

type Category = { id: string; key: string; label: string; business_unit_id: string };
type Material = { id: string; name: string; unit: string; business_unit_id: string };
type Product = { id: string; name: string; description: string | null; business_unit_id: string };
type Catalog = { categories: Category[]; materials: Material[]; products: Product[] };
const EMPTY: Catalog = { categories: [], materials: [], products: [] };
const LIMIT = 500;

export function useMenuSuggestionCatalog(unitId: string | null, actorId: string | undefined, enabled: boolean) {
  const key = `${actorId ?? ''}:${unitId ?? ''}:${enabled}`;
  const epoch = useRef({ key, version: 0 });
  if (epoch.current.key !== key) epoch.current = { key, version: epoch.current.version + 1 };
  const scope = `${key}:${epoch.current.version}`;
  const [state, setState] = useState<{ scope: string; catalog: Catalog; loading: boolean; error: boolean; limited: boolean }>({ scope: '', catalog: EMPTY, loading: false, error: false, limited: false });
  useEffect(() => {
    if (!enabled || !actorId || !unitId) return;
    let disposed = false;
    const controller = new AbortController();
    setState({ scope, catalog: EMPTY, loading: true, error: false, limited: false });
    void Promise.all([
      supabase.from('menu_categories').select('id,key,label,business_unit_id').eq('business_unit_id', unitId).order('label').limit(LIMIT + 1).abortSignal(controller.signal),
      supabase.from('raw_materials').select('id,name,unit,business_unit_id').eq('business_unit_id', unitId).eq('active', true).order('name').limit(LIMIT + 1).abortSignal(controller.signal),
      supabase.from('menu_items').select('id,name,description,business_unit_id').eq('business_unit_id', unitId).eq('active', true).order('name').limit(LIMIT + 1).abortSignal(controller.signal),
    ]).then(([categories, materials, products]) => {
      if (disposed) return;
      if (categories.error || materials.error || products.error) throw Error('Catálogo indisponível');
      const onlyUnit = <T extends { business_unit_id: string }>(rows: T[] | null) => (rows ?? []).filter(row => row.business_unit_id === unitId).slice(0, LIMIT);
      setState({ scope, catalog: { categories: onlyUnit(categories.data), materials: onlyUnit(materials.data), products: onlyUnit(products.data) }, loading: false, error: false, limited: [categories, materials, products].some(result => (result.data?.length ?? 0) > LIMIT) });
    }).catch(() => { if (!disposed) setState({ scope, catalog: EMPTY, loading: false, error: true, limited: false }); });
    return () => { disposed = true; controller.abort(); };
  }, [actorId, enabled, scope, unitId]);
  const active = enabled && actorId && unitId && state.scope === scope;
  const catalog = active ? state.catalog : EMPTY;
  const suggestions = useMemo(() => ({
    categories: catalog.categories.map(row => ({ id: row.id, label: row.label, value: row.label, kind: 'category' as const })),
    materials: catalog.materials.map(row => ({ id: row.id, label: row.name, value: `${row.name} (${row.unit})`, kind: 'material' as const, unit: row.unit })),
    products: catalog.products.map(row => ({ id: row.id, label: row.name, value: row.name, kind: 'product' as const })),
    words: catalogWords([...catalog.products.flatMap(row => [row.name, row.description ?? '']), ...catalog.materials.map(row => row.name), ...catalog.categories.map(row => row.label)]),
  }), [catalog]);
  return { ...catalog, suggestions: suggestions as { categories: MenuSuggestion[]; materials: MenuSuggestion[]; products: MenuSuggestion[]; words: MenuSuggestion[] }, loading: Boolean(enabled && (!active || state.loading)), error: Boolean(active && state.error), limited: Boolean(active && state.limited) };
}
