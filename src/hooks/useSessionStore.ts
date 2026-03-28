import { useState, useEffect, useCallback, useRef } from "react";
import { isKitchenItem } from "@/data/menu";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import type { ClientInfo, TableSession } from "@/components/TableSessionPanel";
import type { ClientOrder, PlacedOrder, OrderItem, IngredientMod } from "@/utils/orders";
import { buildKitchenReceipts, printReceipt } from "@/utils/thermal-print";

type Zone = string;

interface SessionData {
  session: TableSession & { dbId: string };
  orders: ClientOrder[];
}

export const useSessionStore = () => {
  const { user, loading: authLoading } = useAuth();
  const [sessions, setSessions] = useState<Record<number, SessionData>>({});
  const [loading, setLoading] = useState(true);
  const supportsOrderOriginRef = useRef<boolean | null>(null);

  const sessionsSelectBase =
    "id, table_number, started_at, session_clients(id, name, phone, added_at, email, cep, bairro, genero), orders(id, client_id, status, placed_at";
  const sessionsSelectSuffix =
    ", order_items(menu_item_id, name, price, quantity, observation, ingredient_mods))";

  const getSupabaseErrorMessage = useCallback((fallback: string, error?: { message?: string | null; code?: string | null }) => {
    const details = [error?.code, error?.message].filter(Boolean).join(" - ");
    return details ? `${fallback}: ${details}` : fallback;
  }, []);

  const isMissingOrderOriginError = useCallback((error?: { message?: string | null; code?: string | null }) => {
    if (!error) return false;
    if (error.code !== "42703") return false;
    const message = (error.message ?? "").toLowerCase();
    return message.includes("origin");
  }, []);

  // Load active sessions after auth is ready
  const loadSessions = useCallback(async () => {
    if (authLoading) return;
    if (!user) {
      setSessions({});
      setLoading(false);
      return;
    }

    setLoading(true);
    const tryWithOrigin = supportsOrderOriginRef.current !== false;
    const selectColumns = tryWithOrigin
      ? `${sessionsSelectBase}, origin${sessionsSelectSuffix}`
      : `${sessionsSelectBase}${sessionsSelectSuffix}`;

    let { data: dbSessions, error } = await supabase
      .from("sessions")
      .select(selectColumns)
      .eq("status", "active");

    if (error && tryWithOrigin && isMissingOrderOriginError(error)) {
      supportsOrderOriginRef.current = false;
      ({ data: dbSessions, error } = await supabase
        .from("sessions")
        .select(`${sessionsSelectBase}${sessionsSelectSuffix}`)
        .eq("status", "active"));
    } else if (!error && tryWithOrigin) {
      supportsOrderOriginRef.current = true;
    }

    if (error) {
      console.error("Error loading sessions:", error);
      toast.error(getSupabaseErrorMessage("Falha ao sincronizar mesas ativas", error));
      setLoading(false);
      return;
    }

    const map: Record<number, SessionData> = {};

    for (const s of dbSessions ?? []) {
      const clients: ClientInfo[] = ((s as any).session_clients ?? []).map((c: any) => ({
        id: c.id,
        name: c.name,
        phone: c.phone ?? undefined,
        addedAt: new Date(c.added_at),
        email: c.email ?? undefined,
        cep: c.cep ?? undefined,
        bairro: c.bairro ?? undefined,
        genero: c.genero ?? undefined,
      }));

      const clientOrders: ClientOrder[] = clients.map((c) => {
        const dbOrders = ((s as any).orders ?? []).filter((o: any) => o.client_id === c.id && o.status !== "cancelled");
        const placedOrders: PlacedOrder[] = dbOrders.map((o: any) => ({
          id: o.id,
          status: o.status,
          placedAt: new Date(o.placed_at),
          origin: o.origin === "pwa" ? "pwa" : "mesa",
          items: (o.order_items ?? []).map((oi: any) => ({
            menuItemId: oi.menu_item_id,
            name: oi.name,
            price: Number(oi.price),
            quantity: oi.quantity,
            observation: oi.observation ?? undefined,
            ingredientMods: (oi.ingredient_mods as IngredientMod[]) ?? undefined,
          })),
        }));
        return { clientId: c.id, cart: [], orders: placedOrders };
      });

      map[s.table_number] = {
        session: {
          dbId: s.id,
          startedAt: new Date(s.started_at),
          clients,
        },
        orders: clientOrders,
      };
    }

    setSessions(map);
    setLoading(false);
  }, [authLoading, getSupabaseErrorMessage, isMissingOrderOriginError, user]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Notification sound for ready orders
  const playReadySound = useCallback(() => {
    // Vibration
    if (navigator.vibrate) {
      navigator.vibrate([200, 100, 200]);
    }
    // Audio
    try {
      const ctx = new AudioContext();
      [0, 0.15].forEach((delay, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = i === 0 ? 880 : 1320;
        gain.gain.value = 0.3;
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + 0.15);
      });
    } catch { /* audio not available */ }
  }, []);

  // Use ref for sessions to avoid re-subscribing on every state change
  const sessionsRef = useRef<Record<number, SessionData>>({});
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  // Realtime subscription for sessions
  useEffect(() => {
    const channel = supabase
      .channel("sessions-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions" }, () => {
        loadSessions();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "session_clients" }, () => {
        loadSessions();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders" }, async (payload) => {
        const newRecord = payload.new as any;
        if (newRecord?.status === "ready") {
          // Find table number for this order
          const entry = Object.entries(sessionsRef.current).find(([_, sd]) =>
            sd.orders.some((o) => o.orders.some((po) => po.id === newRecord.id))
          );
          const tableNum = entry ? Number(entry[0]) : 0;
          const tableLabel = tableNum ? `Mesa ${String(tableNum).padStart(2, "0")}` : "Mesa";

          // Fetch full order items to show kitchen vs bar breakdown
          const { data: orderItems } = await supabase
            .from("order_items")
            .select("name, quantity, destination")
            .eq("order_id", newRecord.id);

          const kitchenItems = (orderItems ?? []).filter((i: any) => i.destination === "kitchen");
          const barItems = (orderItems ?? []).filter((i: any) => i.destination === "bar");

          // Find client name
          const clientName = entry
            ? (() => {
                const sd = entry[1];
                const co = sd.orders.find((o) => o.orders.some((po) => po.id === newRecord.id));
                const client = co ? sd.session.clients.find((c) => c.id === co.clientId) : null;
                return client?.name.split(" ")[0] ?? "Cliente";
              })()
            : "Cliente";

          const kitchenList = kitchenItems.map((i: any) => `${i.quantity}× ${i.name}`).join(", ");
          const barList = barItems.map((i: any) => `${i.quantity}× ${i.name}`).join(", ");

          playReadySound();

          const descParts: string[] = [];
          descParts.push(`✅ Cozinha: ${kitchenList || "—"}`);
          if (barItems.length > 0) {
            descParts.push(`🍹 Falta (bar): ${barList}`);
          } else {
            descParts.push(`✓ Pedido completo — só entregar!`);
          }

          toast.success(`🔔 Pedido pronto! ${tableLabel} — ${clientName}`, {
            description: descParts.join("\n"),
            duration: 20000,
          });
        }
        loadSessions();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, () => {
        loadSessions();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [loadSessions, playReadySound]);

  const startSession = async (
    tableNumber: number,
    zone: Zone,
    clientData: { name: string; phone?: string; email?: string; cep?: string; bairro?: string; genero?: string }
  ) => {
    if (authLoading) {
      toast.error("Aguarde a autenticação para iniciar a sessão");
      return false;
    }
    if (!user?.id) {
      toast.error("Usuário não autenticado. Faça login novamente.");
      return false;
    }

    const { data: session, error: sErr } = await supabase
      .from("sessions")
      .insert({ table_number: tableNumber, zone, created_by: user?.id })
      .select()
      .single();

    if (sErr || !session) {
      toast.error(getSupabaseErrorMessage("Erro ao criar sessão (verifique RLS/permissões)", sErr));
      console.error(sErr);
      return false;
    }

    const { data: client, error: cErr } = await supabase
      .from("session_clients")
      .insert({
        session_id: session.id,
        name: clientData.name,
        phone: clientData.phone,
        email: clientData.email,
        cep: clientData.cep,
        bairro: clientData.bairro,
        genero: clientData.genero,
      })
      .select()
      .single();

    if (cErr || !client) {
      toast.error(getSupabaseErrorMessage("Erro ao registrar cliente da sessão", cErr));
      console.error(cErr);
      return false;
    }

    setSessions((prev) => ({
      ...prev,
      [tableNumber]: {
        session: {
          dbId: session.id,
          startedAt: new Date(session.started_at),
          clients: [{
            id: client.id,
            name: client.name,
            phone: client.phone ?? undefined,
            addedAt: new Date(client.added_at),
            email: client.email ?? undefined,
            cep: client.cep ?? undefined,
            bairro: client.bairro ?? undefined,
            genero: client.genero ?? undefined,
          }],
        },
        orders: [{ clientId: client.id, cart: [], orders: [] }],
      },
    }));

    toast.success(`Sessão iniciada — Mesa ${String(tableNumber).padStart(2, "0")}`);
    return true;
  };

  const addClient = async (
    tableNumber: number,
    clientData: { name: string; phone?: string; email?: string; cep?: string; bairro?: string; genero?: string }
  ) => {
    if (authLoading || !user?.id) {
      toast.error("Usuário não autenticado. Faça login novamente.");
      return false;
    }

    const sessionData = sessions[tableNumber];
    if (!sessionData) return false;

    const { data: client, error } = await supabase
      .from("session_clients")
      .insert({
        session_id: sessionData.session.dbId,
        name: clientData.name,
        phone: clientData.phone,
        email: clientData.email,
        cep: clientData.cep,
        bairro: clientData.bairro,
        genero: clientData.genero,
      })
      .select()
      .single();

    if (error || !client) {
      toast.error(getSupabaseErrorMessage("Erro ao adicionar cliente na sessão", error));
      return false;
    }

    setSessions((prev) => {
      const curr = prev[tableNumber];
      if (!curr) return prev;
      return {
        ...prev,
        [tableNumber]: {
          ...curr,
          session: {
            ...curr.session,
            clients: [...curr.session.clients, {
              id: client.id,
              name: client.name,
              phone: client.phone ?? undefined,
              addedAt: new Date(client.added_at),
              email: client.email ?? undefined,
              cep: client.cep ?? undefined,
              bairro: client.bairro ?? undefined,
              genero: client.genero ?? undefined,
            }],
          },
          orders: [...curr.orders, { clientId: client.id, cart: [], orders: [] }],
        },
      };
    });

    toast.success(`${clientData.name} adicionado à Mesa ${String(tableNumber).padStart(2, "0")}`);
    return true;
  };

  const closeSession = async (tableNumber: number) => {
    const sessionData = sessions[tableNumber];
    if (!sessionData) return;

    const { error } = await supabase
      .from("sessions")
      .update({ status: "closed", ended_at: new Date().toISOString() })
      .eq("id", sessionData.session.dbId);

    if (error) {
      toast.error("Erro ao encerrar sessão");
      return;
    }

    setSessions((prev) => {
      const next = { ...prev };
      delete next[tableNumber];
      return next;
    });

    toast.success(`Sessão encerrada — Mesa ${String(tableNumber).padStart(2, "0")}`);
  };

  const placeOrder = async (tableNumber: number, clientId: string, cartItems: OrderItem[]) => {
    const sessionData = sessions[tableNumber];
    if (!sessionData || cartItems.length === 0) return;

    const { data: order, error: oErr } = await supabase
      .from("orders")
      .insert({ session_id: sessionData.session.dbId, client_id: clientId })
      .select("id, placed_at")
      .single();

    if (oErr || !order) {
      toast.error("Erro ao enviar pedido");
      return;
    }

    const itemsToInsert = cartItems.map((item) => ({
      order_id: order.id,
      menu_item_id: item.menuItemId,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      observation: item.observation ?? null,
      ingredient_mods: item.ingredientMods ? JSON.parse(JSON.stringify(item.ingredientMods)) : [],
      destination: isKitchenItem(item.menuItemId) ? "kitchen" : "bar",
    }));

    const { error: iErr } = await supabase.from("order_items").insert(itemsToInsert);

    if (iErr) {
      toast.error("Erro ao salvar itens do pedido");
      return;
    }

    const placed: PlacedOrder = {
      id: order.id,
      items: cartItems,
      status: "pending",
      placedAt: new Date(order.placed_at),
    };

    setSessions((prev) => {
      const curr = prev[tableNumber];
      if (!curr) return prev;
      return {
        ...prev,
        [tableNumber]: {
          ...curr,
          orders: curr.orders.map((o) =>
            o.clientId === clientId
              ? { ...o, cart: [], orders: [...o.orders, placed] }
              : o
          ),
        },
      };
    });

    // Gatilho único ao enviar pedido: KDS atualiza (realtime) + comandas imprimem ao mesmo tempo.
    // Comandas = só neste gatilho. Conta da mesa / conta individual = só por comando (botão Imprimir).
    const clientInfo = sessions[tableNumber]?.session.clients.find((c) => c.id === clientId);
    const clientName = clientInfo?.name ?? "Cliente";
    const kitchenReceipts = buildKitchenReceipts(tableNumber, clientName, cartItems, order.id);
    kitchenReceipts.forEach((html) => printReceipt(html));

    toast.success("Pedido enviado!");
  };

  // Update local cart (not persisted — cart is local until order is placed)
  const updateLocalCart = (tableNumber: number, clientId: string, cart: OrderItem[]) => {
    setSessions((prev) => {
      const curr = prev[tableNumber];
      if (!curr) return prev;
      return {
        ...prev,
        [tableNumber]: {
          ...curr,
          orders: curr.orders.map((o) =>
            o.clientId === clientId ? { ...o, cart } : o
          ),
        },
      };
    });
  };

  const markDelivered = async (orderId: string) => {
    const { error } = await supabase
      .from("orders")
      .update({ status: "delivered" })
      .eq("id", orderId);

    if (error) {
      toast.error("Erro ao marcar como entregue");
      return;
    }

    setSessions((prev) => {
      const next = { ...prev };
      for (const [tableNum, sd] of Object.entries(next)) {
        next[Number(tableNum)] = {
          ...sd,
          orders: sd.orders.map((co) => ({
            ...co,
            orders: co.orders.map((o) =>
              o.id === orderId ? { ...o, status: "delivered" as const } : o
            ),
          })),
        };
      }
      return next;
    });

    toast.success("Pedido marcado como entregue!");
  };

  return {
    sessions,
    loading,
    startSession,
    addClient,
    closeSession,
    placeOrder,
    updateLocalCart,
    markDelivered,
  };
};
