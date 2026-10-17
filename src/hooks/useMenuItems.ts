import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentBusinessUnit } from "@/hooks/useCurrentBusinessUnit";
import {
  menuItems as staticMenuItems,
  type MenuItem,
  type MenuCategory,
  kitchenCategories as staticKitchenCategories,
  barCategories as staticBarCategories,
  categoryLabels as staticCategoryLabels,
} from "@/data/menu";
import { resolveMenuItemDestination } from "@/lib/menuDestination";
import { isMissingMenuItemOptionalColumn } from "@/lib/menuItemSchemaCompatibility";

interface DbCategory {
  key: string;
  label: string;
  destination: string;
  sort_order: number;
  icon_name: string | null;
  icon_color: string | null;
}

interface DbMenuItemRow {
  id: string;
  name: string;
  price: number;
  category: string;
  destination?: string | null;
  item_kind?: "regular" | "special" | "seasonal";
  combo_eligible?: boolean;
  description: string | null;
  image_url: string | null;
  sort_order: number;
}

async function loadPublishedMenuItems(unitId: string) {
  const scoped = (columns: "all" | "destination" | "classification" | "legacy") => {
    const base = supabase.from("menu_items");
    const filtered = (columns: string) => base.select(columns)
      .eq("active", true)
      .eq("status", "published")
      .eq("business_unit_id", unitId)
      .order("sort_order");
    switch (columns) {
      case "all": return filtered("id, name, price, category, destination, item_kind, combo_eligible, description, image_url, sort_order");
      case "destination": return filtered("id, name, price, category, destination, description, image_url, sort_order");
      case "classification": return filtered("id, name, price, category, item_kind, combo_eligible, description, image_url, sort_order");
      case "legacy": return filtered("id, name, price, category, description, image_url, sort_order");
    }
  };

  const currentSchema = await scoped("all");
  if (!currentSchema.error) {
    return { data: currentSchema.data as unknown as DbMenuItemRow[] | null, error: null, classificationSupported: true };
  }
  if (!isMissingMenuItemOptionalColumn(currentSchema.error, ["destination", "item_kind", "combo_eligible"])) {
    return { data: null, error: currentSchema.error, classificationSupported: false };
  }

  const destinationSchema = await scoped("destination");
  if (!destinationSchema.error) {
    return { data: destinationSchema.data as unknown as DbMenuItemRow[] | null, error: null, classificationSupported: false };
  }
  if (!isMissingMenuItemOptionalColumn(destinationSchema.error, ["destination", "item_kind", "combo_eligible"])) {
    return { data: null, error: destinationSchema.error, classificationSupported: false };
  }

  const classificationSchema = await scoped("classification");
  if (!classificationSchema.error) {
    return { data: classificationSchema.data as unknown as DbMenuItemRow[] | null, error: null, classificationSupported: true };
  }
  if (!isMissingMenuItemOptionalColumn(classificationSchema.error, ["destination", "item_kind", "combo_eligible"])) {
    return { data: null, error: classificationSchema.error, classificationSupported: false };
  }

  const legacySchema = await scoped("legacy");
  return { data: legacySchema.data as unknown as DbMenuItemRow[] | null, error: legacySchema.error, classificationSupported: false };
}

/**
 * Hook that fetches menu items and categories from the database.
 * Falls back to static data if DB fetch fails.
 */
export const useMenuItems = () => {
  const { businessUnitId, loading: unitLoading } = useCurrentBusinessUnit();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [dbCategories, setDbCategories] = useState<DbCategory[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [classificationSchemaSupported, setClassificationSchemaSupported] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      setClassificationSchemaSupported(false);
      const unitId = businessUnitId;
      if (!unitId) {
        setItems([]);
        setDbCategories([]);
        setError("Nenhuma unidade ativa disponível para carregar o cardápio.");
        setLoading(false);
        return;
      }
      // Load categories
      const { data: cats } = await supabase
        .from("menu_categories")
        .select("key, label, destination, sort_order, icon_name, icon_color")
        .eq("business_unit_id", unitId)
        .order("sort_order");

      setDbCategories(cats ?? []);

      const [itemsRes, ingredientsRes, variantsRes] = await Promise.all([
        loadPublishedMenuItems(unitId),
        supabase.from("menu_item_ingredients").select("menu_item_id, name, removable, extra_price, sort_order").order("sort_order"),
        supabase.from("menu_item_variants").select("menu_item_id, name, sort_order").order("sort_order"),
      ]);

      const { data: dbItems, error: iErr } = itemsRes;
      setClassificationSchemaSupported(itemsRes.classificationSupported);

      // Fallback estático só em erro; lista vazia (ex.: tudo em rascunho) é
      // cardápio vazio de verdade, não motivo pra mostrar itens fictícios.
      if (iErr || !dbItems) {
        throw iErr ?? new Error('Falha ao consultar cardápio');
      }

      const dbIngredients = ingredientsRes.data ?? [];
      const dbVariants = variantsRes.data ?? [];

      const mapped: MenuItem[] = dbItems.map((item) => ({
        id: item.id,
        name: item.name,
        price: Number(item.price),
        category: item.category as MenuCategory,
        destination: item.destination ?? null,
        itemKind: item.item_kind ?? "regular",
        comboEligible: item.combo_eligible ?? true,
        description: item.description ?? undefined,
        imageUrl: item.image_url ?? undefined,
        ingredients: (dbIngredients ?? [])
          .filter((ing) => ing.menu_item_id === item.id)
          .map((ing) => ({
            name: ing.name,
            removable: ing.removable,
            extraPrice: ing.extra_price ? Number(ing.extra_price) : undefined,
          })),
        variants: (dbVariants ?? [])
          .filter((v) => v.menu_item_id === item.id)
          .map((v) => v.name),
      }));

      setItems(mapped);
    } catch (e) {
      setItems([]);
      setError(e instanceof Error ? e.message : 'Erro ao carregar cardápio');
    }
    setLoading(false);
  }, [businessUnitId]);

  useEffect(() => {
    if (unitLoading) return;
    setLoading(true);
    setClassificationSchemaSupported(false);
    load();
  }, [load, unitLoading]);

  const kitchenCategories = useMemo(() => {
    if (dbCategories) return dbCategories.filter((c) => c.destination === "kitchen").map((c) => c.key);
    return staticKitchenCategories as string[];
  }, [dbCategories]);

  const barCategories = useMemo(() => {
    if (dbCategories) return dbCategories.filter((c) => c.destination === "bar").map((c) => c.key);
    return staticBarCategories as string[];
  }, [dbCategories]);

  const categoryLabels = useMemo(() => {
    if (dbCategories) return Object.fromEntries(dbCategories.map((c) => [c.key, c.label]));
    return staticCategoryLabels as Record<string, string>;
  }, [dbCategories]);

  const isKitchenItem = useCallback(
    (menuItemId: string): boolean => {
      const item = items.find((m) => m.id === menuItemId);
      if (!item) return true;
      const destination = resolveMenuItemDestination(item.destination, dbCategories?.find((c) => c.key === item.category)?.destination);
      return destination ? destination === "kitchen" : kitchenCategories.includes(item.category);
    },
    [items, dbCategories, kitchenCategories]
  );

  const isBarItem = useCallback(
    (menuItemId: string): boolean => {
      const item = items.find((m) => m.id === menuItemId);
      if (!item) return false;
      const destination = resolveMenuItemDestination(item.destination, dbCategories?.find((c) => c.key === item.category)?.destination);
      return destination ? destination === "bar" : barCategories.includes(item.category);
    },
    [items, dbCategories, barCategories]
  );

  return { menuItems: items, loading, error, categories: dbCategories ?? [], isKitchenItem, isBarItem, categoryLabels, classificationSchemaSupported };
};
