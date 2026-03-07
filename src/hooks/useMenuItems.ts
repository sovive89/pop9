import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  menuItems as staticMenuItems,
  type MenuItem,
  type MenuCategory,
  kitchenCategories as staticKitchenCategories,
  barCategories as staticBarCategories,
  categoryLabels as staticCategoryLabels,
} from "@/data/menu";

interface DbCategory {
  key: string;
  label: string;
  destination: string;
  sort_order: number;
}

/**
 * Hook that fetches menu items and categories from the database.
 * Falls back to static data if DB fetch fails.
 */
export const useMenuItems = () => {
  const [items, setItems] = useState<MenuItem[]>(staticMenuItems);
  const [dbCategories, setDbCategories] = useState<DbCategory[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      // Load categories
      const { data: cats } = await supabase
        .from("menu_categories")
        .select("key, label, destination, sort_order")
        .order("sort_order");

      if (cats && cats.length > 0) {
        setDbCategories(cats);
      }

      const [itemsRes, ingredientsRes, variantsRes] = await Promise.all([
        supabase.from("menu_items").select("id, name, price, category, description, sort_order").eq("active", true).order("sort_order"),
        supabase.from("menu_item_ingredients").select("menu_item_id, name, removable, extra_price, sort_order").order("sort_order"),
        supabase.from("menu_item_variants").select("menu_item_id, name, sort_order").order("sort_order"),
      ]);

      const { data: dbItems, error: iErr } = itemsRes;

      if (iErr || !dbItems || dbItems.length === 0) {
        setItems(staticMenuItems);
        setLoading(false);
        return;
      }

      const dbIngredients = ingredientsRes.data ?? [];
      const dbVariants = variantsRes.data ?? [];

      const mapped: MenuItem[] = dbItems.map((item) => ({
        id: item.id,
        name: item.name,
        price: Number(item.price),
        category: item.category as MenuCategory,
        description: item.description ?? undefined,
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
    } catch {
      setItems(staticMenuItems);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
      return item ? kitchenCategories.includes(item.category) : true;
    },
    [items, kitchenCategories]
  );

  const isBarItem = useCallback(
    (menuItemId: string): boolean => {
      const item = items.find((m) => m.id === menuItemId);
      return item ? barCategories.includes(item.category) : false;
    },
    [items, barCategories]
  );

  return { menuItems: items, loading, isKitchenItem, isBarItem, categoryLabels };
};
