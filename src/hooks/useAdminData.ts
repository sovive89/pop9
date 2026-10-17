import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { MenuRecipeDraft } from "@/lib/recipeDraft";
import type { Database } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { useCurrentBusinessUnit } from "@/hooks/useCurrentBusinessUnit";

export interface UserWithRole {
  userId: string;
  fullName: string;
  cpf: string;
  roles: string[];
}

export interface DbMenuItem {
  id: string;
  name: string;
  price: number;
  category: string;
  item_kind: "regular" | "special" | "seasonal";
  combo_eligible: boolean;
  destination: string | null;
  description: string | null;
  image_url: string | null;
  sort_order: number;
  active: boolean;
  sku: string | null;
  status: "draft" | "published";
  ingredients: DbIngredient[];
  variants: DbVariant[];
}

export interface DbIngredient {
  id: string;
  name: string;
  removable: boolean;
  extra_price: number | null;
  sort_order: number;
}

export interface DbVariant {
  id: string;
  name: string;
  sort_order: number;
}

export interface DbMenuCategory {
  id: string;
  key: string;
  label: string;
  destination: string;
  sort_order: number;
  icon_name?: string | null;
  icon_color?: string | null;
}

type Role = Database["public"]["Enums"]["app_role"];

export const useAdminData = () => {
  const { businessUnitId } = useCurrentBusinessUnit();
  const unitEpoch = useRef({ unit: businessUnitId, version: 0 });
  if (unitEpoch.current.unit !== businessUnitId) unitEpoch.current = { unit: businessUnitId, version: unitEpoch.current.version + 1 };
  const unitScope = `${businessUnitId ?? ''}:${unitEpoch.current.version}`;
  const currentScope = useRef(unitScope);
  currentScope.current = unitScope;
  const menuRequest = useRef(0), categoryRequest = useRef(0);
  const [menuScope, setMenuScope] = useState('');
  const [categoriesScope, setCategoriesScope] = useState('');
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [menuItems, setMenuItems] = useState<DbMenuItem[]>([]);
  const [classificationSchemaSupported, setClassificationSchemaSupported] = useState(false);
  const [categories, setCategories] = useState<DbMenuCategory[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingMenu, setLoadingMenu] = useState(true);
  const [loadingCategories, setLoadingCategories] = useState(true);

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    const { data: profiles, error: pErr } = await supabase
      .from("profiles")
      .select("user_id, full_name, cpf")
      .order("full_name");

    if (pErr) {
      toast.error("Erro ao carregar usuários");
      setLoadingUsers(false);
      return;
    }

    const { data: allRoles, error: rErr } = await supabase
      .from("user_roles")
      .select("user_id, role");

    if (rErr) {
      toast.error("Erro ao carregar roles");
      setLoadingUsers(false);
      return;
    }

    const mapped: UserWithRole[] = (profiles ?? []).map((p) => ({
      userId: p.user_id,
      fullName: p.full_name,
      cpf: p.cpf,
      roles: (allRoles ?? []).filter((r) => r.user_id === p.user_id).map((r) => r.role),
    }));

    setUsers(mapped);
    setLoadingUsers(false);
  }, []);

  const loadMenu = useCallback(async () => {
    const request = ++menuRequest.current;
    const isCurrent = () => currentScope.current === unitScope && menuRequest.current === request;
    setMenuScope(unitScope); setMenuItems([]);
    setClassificationSchemaSupported(false);
    if (!businessUnitId) { setLoadingMenu(false); return; }
    setLoadingMenu(true);
    const { error: classificationError } = await supabase
      .from("menu_items")
      .select("item_kind,combo_eligible")
      .eq("business_unit_id", businessUnitId);
    if (!isCurrent()) return;
    const supportsClassification = !classificationError;
    setClassificationSchemaSupported(supportsClassification);
    const { data: items, error: iErr } = await supabase
      .from("menu_items")
      .select("*")
      .eq("business_unit_id", businessUnitId)
      .order("category")
      .order("sort_order");

    if (!isCurrent()) return;
    if (iErr) {
      toast.error("Erro ao carregar cardápio");
      setLoadingMenu(false);
      return;
    }

    const itemIds = (items ?? []).map(item => item.id);
    const [ingredientResult, variantResult] = itemIds.length ? await Promise.all([
      supabase.from("menu_item_ingredients").select("*").in("menu_item_id", itemIds).order("sort_order"),
      supabase.from("menu_item_variants").select("*").in("menu_item_id", itemIds).order("sort_order"),
    ]) : [{ data: [], error: null }, { data: [], error: null }];
    if (!isCurrent()) return;
    if (ingredientResult.error || variantResult.error) {
      toast.error("Erro ao carregar ingredientes ou variantes do cardápio");
      setLoadingMenu(false); return;
    }
    const ingredients = ingredientResult.data, variants = variantResult.data;

    const mapped: DbMenuItem[] = (items ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      price: Number(item.price),
      category: item.category,
      item_kind: (item.item_kind ?? "regular") as DbMenuItem["item_kind"],
      combo_eligible: item.combo_eligible ?? true,
      destination: item.destination ?? null,
      description: item.description,
      image_url: item.image_url ?? null,
      sort_order: item.sort_order,
      active: item.active,
      sku: item.sku ?? null,
      status: (item.status as "draft" | "published") ?? "published",
      ingredients: (ingredients ?? [])
        .filter((ing) => ing.menu_item_id === item.id)
        .map((ing) => ({
          id: ing.id,
          name: ing.name,
          removable: ing.removable,
          extra_price: ing.extra_price ? Number(ing.extra_price) : null,
          sort_order: ing.sort_order,
        })),
      variants: (variants ?? [])
        .filter((v) => v.menu_item_id === item.id)
        .map((v) => ({
          id: v.id,
          name: v.name,
          sort_order: v.sort_order,
        })),
    }));

    setMenuItems(mapped);
    setLoadingMenu(false);
  }, [businessUnitId, unitScope]);

  const loadCategories = useCallback(async () => {
    const request = ++categoryRequest.current;
    setCategoriesScope(unitScope); setCategories([]);
    if (!businessUnitId) { setLoadingCategories(false); return; }
    setLoadingCategories(true);
    const { data, error } = await supabase
      .from("menu_categories")
      .select("*")
      .eq("business_unit_id", businessUnitId)
      .order("sort_order");
    if (currentScope.current !== unitScope || categoryRequest.current !== request) return;
    if (error) {
      toast.error("Erro ao carregar categorias");
    } else {
      setCategories((data ?? []).map((c) => ({
        id: c.id,
        key: c.key,
        label: c.label,
        destination: c.destination,
        sort_order: c.sort_order,
      })));
    }
    setLoadingCategories(false);
  }, [businessUnitId, unitScope]);

  useEffect(() => {
    loadUsers();
    loadMenu();
    loadCategories();
  }, [loadUsers, loadMenu, loadCategories]);

  // ── Role management ──
  const addRole = async (userId: string, role: Role) => {
    if (!businessUnitId) { toast.error("Selecione uma unidade para atribuir permissões"); return false; }
    const { error } = await supabase
      .from("user_roles")
      .insert({ user_id: userId, role, business_unit_id: businessUnitId });
    if (error) {
      toast.error("Erro ao adicionar role");
      return false;
    }
    toast.success("Role adicionada");
    await loadUsers();
    return true;
  };

  const removeRole = async (userId: string, role: Role) => {
    const { error } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", userId)
      .eq("role", role);
    if (error) {
      toast.error("Erro ao remover role");
      return false;
    }
    toast.success("Role removida");
    await loadUsers();
    return true;
  };

  // ── Password reset ──
  const resetPassword = async (cpf: string, newPassword: string) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      toast.error("Sessão expirada");
      return false;
    }

    const { data, error } = await supabase.functions.invoke("reset-password", {
      body: { cpf, new_password: newPassword },
    });

    if (error) {
      toast.error(error.message || "Erro ao redefinir senha");
      return false;
    }
    if (data?.error) {
      toast.error(data.error);
      return false;
    }
    toast.success("Senha redefinida com sucesso");
    return true;
  };

  // ── Menu CRUD ──
  // Retorna o ID salvo ou false. Item, opções, insumos e ficha são atômicos.
  type MenuItemSaveResult = string | false;
  type MenuItemInput = Omit<DbMenuItem, "id" | "sku" | "sort_order" | "ingredients" | "variants"> & {
    id?: string;
    sort_order?: number;
    ingredients: Omit<DbIngredient, "id">[];
    variants: Omit<DbVariant, "id">[];
    recipe: MenuRecipeDraft[];
  };
  const saveMenuItem = async (input: MenuItemInput, isNew: boolean): Promise<MenuItemSaveResult> => {
    if (!businessUnitId || currentScope.current !== unitScope) return false;
    const requestScope = unitScope;
    const { id, ...data } = input;
    const args = { p_unit: businessUnitId, p_item_id: id ?? crypto.randomUUID(), p_data: data };
    const { data: savedId, error } = classificationSchemaSupported
      ? await supabase.rpc("save_menu_item_with_recipe_and_class", args)
      : await supabase.rpc("save_menu_item_with_recipe", args);
    if (currentScope.current !== requestScope) return false;
    if (error || !savedId) { toast.error("Erro ao salvar item e ficha técnica: " + (error?.message ?? "sem retorno")); return false; }
    toast.success(isNew ? "Item e ficha técnica criados" : "Item e ficha técnica atualizados");
    await loadMenu();
    return savedId;
  };

  const deleteMenuItem = async (id: string) => {
    const { error } = await supabase.from("menu_items").delete().eq("id", id);
    if (error) { toast.error("Erro ao excluir item"); return false; }
    toast.success("Item excluído");
    await loadMenu();
    return true;
  };

  // ── Category CRUD ──
  const saveCategory = async (cat: Omit<DbMenuCategory, "id"> & { id?: string }, isNew: boolean) => {
    if (isNew) {
      if (!businessUnitId) { toast.error("Nenhuma unidade ativa encontrada"); return false; }
      const { error } = await supabase.from("menu_categories").insert({
        key: cat.key,
        label: cat.label,
        icon_name: cat.icon_name ?? null,
        icon_color: cat.icon_color ?? null,
        destination: cat.destination,
        sort_order: cat.sort_order,
        business_unit_id: businessUnitId,
      });
      if (error) { toast.error("Erro ao criar categoria: " + error.message); return false; }
    } else {
      const { error } = await supabase.from("menu_categories").update({
        key: cat.key,
        label: cat.label,
        destination: cat.destination,
        sort_order: cat.sort_order,
      }).eq("id", cat.id!);
      if (error) { toast.error("Erro ao atualizar categoria: " + error.message); return false; }
    }
    toast.success(isNew ? "Categoria criada" : "Categoria atualizada");
    await loadCategories();
    return true;
  };

  const deleteCategory = async (id: string) => {
    const { error } = await supabase.from("menu_categories").delete().eq("id", id);
    if (error) { toast.error("Erro ao excluir categoria"); return false; }
    toast.success("Categoria excluída");
    await loadCategories();
    return true;
  };

  return {
    users,
    menuItems: menuScope === unitScope ? menuItems : [],
    classificationSchemaSupported: menuScope === unitScope && classificationSchemaSupported,
    categories: categoriesScope === unitScope ? categories : [],
    loadingUsers,
    loadingMenu: loadingMenu || (Boolean(businessUnitId) && menuScope !== unitScope),
    loadingCategories: loadingCategories || (Boolean(businessUnitId) && categoriesScope !== unitScope),
    addRole,
    removeRole,
    resetPassword,
    saveMenuItem,
    deleteMenuItem,
    saveCategory,
    deleteCategory,
    refreshMenu: loadMenu,
    refreshUsers: loadUsers,
    refreshCategories: loadCategories,
  };
};
