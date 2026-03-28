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

interface LoadSessionsOptions {
  silent?: boolean;
}

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim().length > 0) {
      return message;
    }
  }
  return fallback;
};

export const useSessionStore = () => {
  const { user, loading: authLoading } = useAuth();
  const [sessions, setSessions] = useState<Record<number, SessionData>>({});
  const [loading, setLoading] = useState(true);

  // Load active sessions only after auth is ready.
  const loadSessions = useCallback(async ({ silent = false }: LoadSessionsOptions = {}): Promise<Record<number, SessionData> | null> => {
    if (authLoading) {
      return null;
    }

    if (!user) {
      setSessions({});
      setLoading(false);
      return {};
    }

    setLoading(true);
    try {
      const { data: dbSessions, error } = await supabase
        .from("sessions")
        .select("id, table_number, started_at, session_clients(id, name, phone, added_at, email, cep, bairro, genero), orders(id, client_id, status, placed_at, origin, order_items(menu_item_id, name, price, quantity, observation, ingredient_mods))")
        .eq("status", "active")
        .order("started_at", { ascending: true });

      if (error) {
        throw error;
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
      return map;
    } catch (error) {
      console.error("Error loading sessions:", error);
      if (!silent) {
        toast.error(`Erro ao carregar sessões ativas: ${getErrorMessage(error, "verifique autenticação e políticas RLS")}`);
      }
      return null;
    } finally {
      setLoading(false);
    }
  }, [authLoading, user]);

  useEffect(() => {
    void loadSessions();
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
        void loadSessions({ silent: true });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "session_clients" }, () => {
        void loadSessions({ silent: true });
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
        void loadSessions({ silent: true });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, () => {
        void loadSessions({ silent: true });
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
      toast.error("Aguarde a autenticação concluir antes de iniciar a sessão.");
      return false;
    }

    if (!user?.id) {
      toast.error("Usuário não autenticado. Faça login novamente.");
      return false;
    }

    try {
      const { data: session, error: sErr } = await supabase
        .from("sessions")
        .insert({ table_number: tableNumber, zone, created_by: user.id })
        .select()
        .single();

      if (sErr || !session) {
        throw sErr ?? new Error("Falha ao criar sessão");
      }

      const { error: cErr } = await supabase
        .from("session_clients")
        .insert({
          session_id: session.id,
          name: clientData.name,
          phone: clientData.phone,
          email: clientData.email,
          cep: clientData.cep,
          bairro: clientData.bairro,
          genero: clientData.genero,
        });

      if (cErr) {
        console.error("Erro ao registrar cliente inicial. Encerrando sessão órfã:", cErr);
        await supabase
          .from("sessions")
          .update({ status: "closed", ended_at: new Date().toISOString() })
          .eq("id", session.id);
        throw cErr;
      }

      const refreshed = await loadSessions({ silent: true });
      if (!refreshed?.[tableNumber]) {
        toast.error("Sessão criada, mas não pôde ser recarregada. Verifique política SELECT (RLS) da tabela sessions.");
        return false;
      }

      toast.success(`Sessão iniciada — Mesa ${String(tableNumber).padStart(2, "0")}`);
      return true;
    } catch (error) {
      console.error("Erro ao iniciar sessão:", error);
      toast.error(`Erro ao criar sessão no banco: ${getErrorMessage(error, "verifique autenticação e RLS")}`);
      return false;
    }
  };

  const addClient = async (
    tableNumber: number,
    clientData: { name: string; phone?: string; email?: string; cep?: string; bairro?: string; genero?: string }
  ) => {
    const sessionData = sessions[tableNumber];
    if (!sessionData) return false;

    const { error } = await supabase
      .from("session_clients")
      .insert({
        session_id: sessionData.session.dbId,
        name: clientData.name,
        phone: clientData.phone,
        email: clientData.email,
        cep: clientData.cep,
        bairro: clientData.bairro,
        genero: clientData.genero,
      });

    if (error) {
      toast.error(`Erro ao adicionar cliente: ${getErrorMessage(error, "falha de gravação no Supabase")}`);
      return false;
    }

    const refreshed = await loadSessions({ silent: true });
    if (!refreshed?.[tableNumber]) {
      toast.error("Cliente adicionado, mas a sessão ativa não pôde ser recarregada.");
      return false;
    }

    toast.success(`${clientData.name} adicionado à Mesa ${String(tableNumber).padStart(2, "0")}`);
    return true;
  };

  const closeSession = async (tableNumber: number) => {
    const sessionData = sessions[tableNumber];
    if (!sessionData) return false;

    const { error } = await supabase
      .from("sessions")
      .update({ status: "closed", ended_at: new Date().toISOString() })
      .eq("id", sessionData.session.dbId);

    if (error) {
      toast.error("Erro ao encerrar sessão");
      return false;
    }

    await loadSessions({ silent: true });

    toast.success(`Sessão encerrada — Mesa ${String(tableNumber).padStart(2, "0")}`);
    return true;
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
