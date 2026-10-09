import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Unit = { id: string; name: string };
const STORAGE_KEY = "pop9:selected-business-unit";
const CHANGE_EVENT = "pop9:business-unit-changed";

let currentUnit: string | null = null;
let currentUnits: Unit[] = [];
let pending: Promise<void> | null = null;
const listeners = new Set<() => void>();
let loaded = false;
let loadError: string | null = null;

const notify = () => listeners.forEach((listener) => listener());

const loadUnits = async () => {
  if (pending) return pending;
  pending = (async () => {
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    if (!auth.user) {
      currentUnits = [];
      currentUnit = null;
      return;
    }
    const { data: roles, error: roleError } = await supabase
      .from("user_roles")
      .select("business_unit_id")
      .eq("user_id", auth.user.id)
      .not("business_unit_id", "is", null);
    if (roleError) throw roleError;
    const ids = [...new Set((roles ?? []).map((r) => r.business_unit_id).filter((id): id is string => Boolean(id)))];
    if (!ids.length) {
      currentUnits = [];
      currentUnit = null;
      return;
    }
    const { data: units, error } = await supabase.from("business_units")
      .select("id, name").eq("active", true).in("id", ids).order("name");
    if (error) throw error;
    currentUnits = units ?? [];
    const stored = window.localStorage.getItem(STORAGE_KEY);
    currentUnit = currentUnits.length === 1
      ? currentUnits[0].id
      : currentUnits.some((unit) => unit.id === stored) ? stored : null;
  })().catch((error: unknown) => {
    currentUnits = [];
    currentUnit = null;
    loadError = error instanceof Error ? error.message : "Erro ao carregar unidades";
  }).finally(() => {
    loaded = true;
    pending = null;
    notify();
  });
  return pending;
};

export const selectBusinessUnit = (id: string) => {
  if (!currentUnits.some((unit) => unit.id === id)) return false;
  window.localStorage.setItem(STORAGE_KEY, id);
  currentUnit = id;
  notify();
  window.dispatchEvent(new Event(CHANGE_EVENT));
  return true;
};

export const useCurrentBusinessUnit = () => {
  const [, rerender] = useState(0);
  useEffect(() => {
    const listener = () => rerender((n) => n + 1);
    listeners.add(listener);
    void loadUnits();
    const subscription = supabase.auth.onAuthStateChange(() => {
      loaded = false;
      currentUnit = null;
      currentUnits = [];
      notify();
      void loadUnits();
    });
    return () => {
      listeners.delete(listener);
      subscription.data.subscription.unsubscribe();
    };
  }, []);
  return {
    businessUnitId: currentUnit,
    units: currentUnits,
    requiresSelection: currentUnits.length > 1 && !currentUnit,
    selectBusinessUnit,
    loading: !loaded,
    error: loadError,
  };
};
