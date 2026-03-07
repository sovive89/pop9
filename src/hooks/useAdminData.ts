import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
  description: string | null;
  image_url: string | null;
  sort_order: number;
  active: boolean;
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
}

export const useAdminData = () => {
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [menuItems, setMenuItems] = useState<DbMenuItem[]>([]);
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
    setLoadingMenu(true);
    const { data: items, error: iErr } = await supabase
      .from("menu_items")
      .select("*")
      .order("category")
      .order("sort_order");

    if (iErr) {
      toast.error("Erro ao carregar cardápio");
      setLoadingMenu(false);
      return;
    }

    const { data: ingredients } = await supabase
      .from("menu_item_ingredients")
      .select("*")
      .order("sort_order");

    const { data: variants } = await supabase
      .from("menu_item_variants")
      .select("*")
      .order("sort_order");

    const mapped: DbMenuItem[] = (items ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      price: Number(item.price),
      category: item.category,
      description: item.description,
      image_url: item.image_url ?? null,
      sort_order: item.sort_order,
      active: item.active,
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
  }, []);

  const loadCategories = useCallback(async () => {
    setLoadingCategories(true);
    const { data, error } = await supabase
      .from("menu_categories")
      .select("*")
      .order("sort_order");
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
  }, []);

  useEffect(() => {
    loadUsers();
    loadMenu();
    loadCategories();
  }, [loadUsers, loadMenu, loadCategories]);

  // ── Role management ──
  const addRole = async (userId: string, role: string) => {
    const { error } = await supabase
      .from("user_roles")
      .insert({ user_id: userId, role: role as any });
    if (error) {
      toast.error("Erro ao adicionar role");
      return false;
    }
    toast.success("Role adicionada");
    await loadUsers();
    return true;
  };

  const removeRole = async (userId: string, role: string) => {
    const { error } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", userId)
      .eq("role", role as any);
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
  const saveMenuItem = async (item: Omit<DbMenuItem, "ingredients" | "variants"> & { ingredients: Omit<DbIngredient, "id">[]; variants: Omit<DbVariant, "id">[] }, isNew: boolean) => {
    const { ingredients, variants, ...itemData } = item;

    if (isNew) {
      const { error } = await supabase.from("menu_items").insert(itemData);
      if (error) { toast.error("Erro ao criar item: " + error.message); return false; }
    } else {
      const { error } = await supabase.from("menu_items").update({
        name: itemData.name,
        price: itemData.price,
        category: itemData.category,
        description: itemData.description,
        image_url: itemData.image_url,
        sort_order: itemData.sort_order,
        active: itemData.active,
      }).eq("id", itemData.id);
      if (error) { toast.error("Erro ao atualizar item: " + error.message); return false; }
    }

    // Replace ingredients
    await supabase.from("menu_item_ingredients").delete().eq("menu_item_id", item.id);
    if (ingredients.length > 0) {
      const { error } = await supabase.from("menu_item_ingredients").insert(
        ingredients.map((ing, idx) => ({
          menu_item_id: item.id,
          name: ing.name,
          removable: ing.removable,
          extra_price: ing.extra_price,
          sort_order: idx,
        }))
      );
      if (error) { toast.error("Erro ao salvar ingredientes"); return false; }
    }

    // Replace variants
    await supabase.from("menu_item_variants").delete().eq("menu_item_id", item.id);
    if (variants.length > 0) {
      const { error } = await supabase.from("menu_item_variants").insert(
        variants.map((v, idx) => ({
          menu_item_id: item.id,
          name: v.name,
          sort_order: idx,
        }))
      );
      if (error) { toast.error("Erro ao salvar variantes"); return false; }
    }

    toast.success(isNew ? "Item criado" : "Item atualizado");
    await loadMenu();
    return true;
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
      const { error } = await supabase.from("menu_categories").insert({
        key: cat.key,
        label: cat.label,
        destination: cat.destination,
        sort_order: cat.sort_order,
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
    menuItems,
    categories,
    loadingUsers,
    loadingMenu,
    loadingCategories,
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
