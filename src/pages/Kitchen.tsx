import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import type { IngredientMod } from "@/utils/orders";
import { useAuth } from "@/hooks/useAuth";

// ── Types ──
interface KitchenItem {
  id: string;
  menuItemId: string;
  name: string;
  quantity: number;
  readyQuantity: number;
  observation?: string;
  ingredientMods?: IngredientMod[];
  claimedBy?: string;
  claimedAt?: Date;
}

interface KitchenOrder {
  id: string;
  status: string;
  placedAt: Date;
  startedAt?: Date;
  tableNumber: number;
  clientName: string;
  items: KitchenItem[];
}

// ── Sound Effects ──
const playNewOrderSound = () => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const playTone = (freq: number, start: number, dur: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.15, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + dur);
    };
    playTone(880, 0, 0.15);
    playTone(1100, 0.18, 0.15);
    playTone(1320, 0.36, 0.25);
  } catch { /* silent fail */ }
};

const playReadySound = () => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 660;
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  } catch { /* silent fail */ }
};

// ── Helpers ──
const getElapsed = (from: Date) => {
  const diff = Date.now() - from.getTime();
  const mins = Math.floor(diff / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  return `${mins}:${String(secs).padStart(2, "0")}`;
};

const MAX_SCALE_MS = 15 * 60 * 1000;

const getHeat = (order: KitchenOrder): number => {
  const elapsed = Date.now() - order.placedAt.getTime();
  return Math.min(elapsed / MAX_SCALE_MS, 1);
};

const heatColor = (heat: number) => {
  const hue = Math.round(145 - heat * 145);
  const sat = Math.round(50 + heat * 30);
  const lig = Math.round(24 + heat * 10);
  return { hue, sat, lig };
};

const heatBorderColor = (heat: number) => {
  const { hue, sat, lig } = heatColor(heat);
  return `hsl(${hue}, ${sat}%, ${lig + 12}%)`;
};

const heatBgColor = (heat: number) => {
  const { hue, sat, lig } = heatColor(heat);
  return `hsl(${hue}, ${sat}%, ${lig}%)`;
};

const heatGlow = (heat: number) => {
  if (heat < 0.3) return "none";
  const { hue, sat } = heatColor(heat);
  const radius = Math.round(8 + heat * 15);
  const alpha = (heat * 0.4).toFixed(2);
  return `0 0 ${radius}px hsl(${hue}, ${sat}%, 45%, ${alpha})`;
};

const heatPadding = (_heat: number) => 8;
const heatTimerSize = (_heat: number) => 13;
const heatBorderWidth = (heat: number) => Math.round(1 + heat * 2);

// ── Estimated prep times (minutes) ──
const PREP_TIMES: Record<string, number> = {
  burger: 12, hambur: 12, cheese: 12, crispy: 12, confit: 14, piggy: 14, gorgon: 15, frangolino: 12, cerrado: 12,
  batata: 8, croquete: 6, nugget: 7,
};

const getEstimatedPrepMinutes = (name: string): number => {
  const n = name.toLowerCase();
  for (const [key, mins] of Object.entries(PREP_TIMES)) {
    if (n.includes(key)) return mins;
  }
  return 10; // default
};

const formatPrepEstimate = (minutes: number) => `~${minutes}min`;

// ── Table grouping ──
interface TableGroup {
  tableNumber: number;
  orders: KitchenOrder[];
  oldestPlacedAt: Date;
  totalItems: number;
  maxPrepMinutes: number;
}

const getFoodEmoji = (name: string): string => {
  const n = name.toLowerCase();
  if (n.includes("burger") || n.includes("hambur") || n.includes("x-")) return "🍔";
  if (n.includes("batata") || n.includes("frita")) return "🍟";
  if (n.includes("refri") || n.includes("coca") || n.includes("suco")) return "🥤";
  if (n.includes("água") || n.includes("agua")) return "💧";
  if (n.includes("salada")) return "🥗";
  if (n.includes("pizza")) return "🍕";
  if (n.includes("milk") || n.includes("shake")) return "🥛";
  if (n.includes("combo")) return "🍱";
  if (n.includes("sobremesa") || n.includes("brownie") || n.includes("sorvete")) return "🍰";
  if (n.includes("wrap")) return "🌯";
  if (n.includes("hot") || n.includes("dog")) return "🌭";
  if (n.includes("nugget") || n.includes("frango") || n.includes("chicken")) return "🍗";
  if (n.includes("onion") || n.includes("cebola")) return "🧅";
  return "🍽️";
};

// ── Kitchen Display ──
const KitchenDisplay = () => {
  const { signOut } = useAuth();
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [finishedOrders, setFinishedOrders] = useState<KitchenOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [, setTick] = useState(0);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [userName, setUserName] = useState("");
  const [userRole, setUserRole] = useState<"kitchen" | "admin" | "attendant">("attendant");
  const [navRoles, setNavRoles] = useState<{ attendant: boolean; kitchen: boolean; admin: boolean }>({
    attendant: false,
    kitchen: false,
    admin: false,
  });

  // Action dialog state (cancel, pause, dispatch)
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [actionPassword, setActionPassword] = useState("");
  const [actionTargetId, setActionTargetId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<"cancel" | "cancel-all" | "pause" | "dispatch">("cancel");

  // Mobile KDS tab
  const [kdsTab, setKdsTab] = useState<"ativos" | "prontos">("ativos");

  // Drag-and-drop
  const [dragOverReady, setDragOverReady] = useState(false);

  // Expanded tables
  const [expandedTables, setExpandedTables] = useState<Set<number>>(new Set());
  const [expandedFinished, setExpandedFinished] = useState<Set<number>>(new Set());

  // Track previous order IDs for new order sound
  const prevOrderIdsRef = useRef<Set<string>>(new Set());

  // Group orders by table
  const tableGroups = useMemo((): TableGroup[] => {
    if (!Array.isArray(orders) || orders.length === 0) return [];
    const map = new Map<number, KitchenOrder[]>();
    for (const o of orders) {
      const existing = map.get(o.tableNumber) ?? [];
      existing.push(o);
      map.set(o.tableNumber, existing);
    }
    return Array.from(map.entries())
      .map(([tableNumber, tableOrders]) => ({
        tableNumber,
        orders: tableOrders.sort((a, b) => a.placedAt.getTime() - b.placedAt.getTime()),
        oldestPlacedAt: new Date(Math.min(...tableOrders.map((o) => o.placedAt.getTime()))),
        totalItems: tableOrders.reduce((s, o) => s + o.items.reduce((ss, i) => ss + i.quantity, 0), 0),
        maxPrepMinutes: Math.max(...tableOrders.flatMap((o) => o.items.map((i) => getEstimatedPrepMinutes(i.name)))),
      }))
      .sort((a, b) => a.oldestPlacedAt.getTime() - b.oldestPlacedAt.getTime());
  }, [orders]);

  // Group finished orders by table
  const finishedTableGroups = useMemo((): TableGroup[] => {
    if (!Array.isArray(finishedOrders) || finishedOrders.length === 0) return [];
    const map = new Map<number, KitchenOrder[]>();
    for (const o of finishedOrders) {
      const existing = map.get(o.tableNumber) ?? [];
      existing.push(o);
      map.set(o.tableNumber, existing);
    }
    return Array.from(map.entries())
      .map(([tableNumber, tableOrders]) => ({
        tableNumber,
        orders: tableOrders.sort((a, b) => a.placedAt.getTime() - b.placedAt.getTime()),
        oldestPlacedAt: new Date(Math.min(...tableOrders.map((o) => o.placedAt.getTime()))),
        totalItems: tableOrders.reduce((s, o) => s + o.items.reduce((ss, i) => ss + i.quantity, 0), 0),
        maxPrepMinutes: 0,
      }))
      .sort((a, b) => b.oldestPlacedAt.getTime() - a.oldestPlacedAt.getTime());
  }, [finishedOrders]);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const navigate = useNavigate();

  // Get current user ID and roles
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (user) {
        setCurrentUserId(user.id);
        setUserName(user.user_metadata?.full_name?.split(" ")[0] ?? "Usuário");
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id);
        const isKitchenOrAdmin = roles?.some((r) => r.role === "kitchen" || r.role === "admin");
        setIsReadOnly(!isKitchenOrAdmin);
        if (roles?.some((r) => r.role === "admin")) setUserRole("admin");
        else if (roles?.some((r) => r.role === "kitchen")) setUserRole("kitchen");
        else setUserRole("attendant");
        const r = (roles ?? []).map((x) => x.role);
        setNavRoles({
          attendant: r.includes("attendant"),
          kitchen: r.includes("kitchen"),
          admin: r.includes("admin"),
        });
      }
    });
  }, []);

  const mapOrder = (o: any): KitchenOrder => ({
    id: o.id,
    status: o.status,
    placedAt: new Date(o.placed_at),
    startedAt: o.status === "preparing" ? new Date(o.placed_at) : undefined,
    tableNumber: o.sessions?.table_number ?? 0,
    clientName: o.session_clients?.name ?? "Cliente",
    items: (o.order_items ?? [])
      .filter((oi: any) => oi.destination === "kitchen")
      .map((oi: any) => ({
        id: oi.id,
        menuItemId: oi.menu_item_id,
        name: oi.name,
        quantity: oi.quantity,
        readyQuantity: oi.ready_quantity ?? 0,
        observation: oi.observation ?? undefined,
        ingredientMods: (oi.ingredient_mods as IngredientMod[]) ?? undefined,
        claimedBy: oi.claimed_by ?? undefined,
        claimedAt: oi.claimed_at ? new Date(oi.claimed_at) : undefined,
      })),
  });

  const loadOrders = useCallback(async () => {
    const { data, error } = await supabase
      .from("orders")
      .select("id, status, placed_at, order_items(*), sessions!inner(table_number), session_clients!inner(name)")
      .in("status", ["pending", "preparing"])
      .order("placed_at", { ascending: true });

    if (error) {
      console.error("Error loading kitchen orders:", error);
      return { error: true };
    }

    const mapped = (data ?? []).map(mapOrder).filter((o) => o.items.length > 0);

    if (soundEnabled) {
      const currentIds = new Set(mapped.map(o => o.id));
      const prevIds = prevOrderIdsRef.current;
      for (const id of currentIds) {
        if (!prevIds.has(id)) { playNewOrderSound(); break; }
      }
    }
    prevOrderIdsRef.current = new Set(mapped.map(o => o.id));

    setOrders(mapped);
    return { error: false };
  }, [soundEnabled]);

  const loadFinished = useCallback(async () => {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("orders")
      .select("id, status, placed_at, order_items(*), sessions!inner(table_number), session_clients!inner(name)")
      .eq("status", "ready")
      .gte("placed_at", thirtyMinAgo)
      .order("placed_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("Error loading finished orders:", error);
      return;
    }

    const mapped = (data ?? []).map(mapOrder).filter((o) => o.items.length > 0);
    setFinishedOrders(mapped);
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadOrders(), loadFinished()]).finally(() => setLoading(false));
  }, [loadOrders, loadFinished]);

  useEffect(() => {
    const channel = supabase
      .channel("kitchen-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        loadOrders();
        loadFinished();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, () => {
        loadOrders();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [loadOrders, loadFinished]);

  const handleStartPreparing = async (orderId: string) => {
    const { error } = await supabase
      .from("orders")
      .update({ status: "preparing", preparing_at: new Date().toISOString() })
      .eq("id", orderId);

    if (error) {
      toast.error("Erro ao atualizar status");
      return;
    }
    toast.success("Pedido em preparo!");
  };

  const handleItemReady = async (order: KitchenOrder, item: KitchenItem) => {
    console.log("[v0] handleItemReady START", { orderId: order.id, itemId: item.id, readyQty: item.readyQuantity, totalQty: item.quantity });
    if (item.readyQuantity >= item.quantity) {
      console.log("[v0] Item already complete, skipping");
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    const currentUserId = user?.id;

    // Check if claimed by another user
    if (item.claimedBy && item.claimedBy !== currentUserId) {
      toast.error("Este item já está sendo preparado por outro cozinheiro");
      return;
    }

    if (order.status === "pending") {
      await supabase.from("orders").update({ status: "preparing", preparing_at: new Date().toISOString() }).eq("id", order.id);
    }

    // Claim the item if not yet claimed
    if (!item.claimedBy) {
      await supabase
        .from("order_items")
        .update({ claimed_by: currentUserId, claimed_at: new Date().toISOString() })
        .eq("id", item.id);
    }

    const newReadyQty = item.readyQuantity + 1;

    const { error } = await supabase
      .from("order_items")
      .update({ ready_quantity: newReadyQty })
      .eq("id", item.id);

    if (error) {
      toast.error("Erro ao atualizar item");
      return;
    }

    const updatedItems = order.items.map((i) =>
      i.id === item.id ? { ...i, readyQuantity: newReadyQty } : i
    );
    const allReady = updatedItems.every((i) => i.readyQuantity >= i.quantity);

    if (allReady) {
      await supabase.from("orders").update({ status: "ready", ready_at: new Date().toISOString() }).eq("id", order.id);
      
      // Immediately update local state to remove from active orders
      setOrders(prev => prev.filter(o => o.id !== order.id));
      // Reload finished orders to add this one
      await loadFinished();
      
      if (soundEnabled) playReadySound();
      toast.success(`Pedido pronto! Mesa ${String(order.tableNumber).padStart(2, "0")} — ${order.clientName}`);
      supabase.functions.invoke("push-notify", {
        body: {
          action: "notify",
          title: `Pedido Pronto!`,
          message: `Mesa ${String(order.tableNumber).padStart(2, "0")} — ${order.clientName}`,
          url: "/",
        },
      }).catch(() => toast.error("Notificacao nao enviada"));
    } else {
      // Update local state for partial ready
      setOrders(prev => prev.map(o => 
        o.id === order.id 
          ? { ...o, items: updatedItems }
          : o
      ));
      toast.success(`${item.name}: ${newReadyQty}/${item.quantity} pronto(s)`);
    }
  };

  // Claim an item without marking ready (just "start preparing")
  const handleClaimItem = async (item: KitchenItem, order: KitchenOrder) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (item.claimedBy && item.claimedBy !== user?.id) {
      toast.error("Item já reservado por outro cozinheiro");
      return;
    }
    if (item.claimedBy === user?.id) {
      // Unclaim
      await supabase.from("order_items").update({ claimed_by: null, claimed_at: null }).eq("id", item.id);
      toast.success(`${item.name} liberado`);
    } else {
      if (order.status === "pending") {
        await supabase.from("orders").update({ status: "preparing", preparing_at: new Date().toISOString() }).eq("id", order.id);
      }
      await supabase.from("order_items").update({ claimed_by: user?.id, claimed_at: new Date().toISOString() }).eq("id", item.id);
      toast.success(`${item.name} reservado para você`);
    }
  };

  const openActionDialog = (type: "cancel" | "cancel-all" | "pause" | "dispatch", orderId?: string) => {
    setActionType(type);
    setActionTargetId(orderId ?? null);
    setActionPassword("");
    setActionDialogOpen(true);
  };

  const handleActionConfirm = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      toast.error("Sessão inválida. Faça login novamente.");
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: actionPassword,
    });
    if (error) {
      toast.error("Senha incorreta!");
      return;
    }

    if (actionType === "cancel-all") {
      const ids = orders.map(o => o.id);
      for (const id of ids) {
        await supabase.from("orders").update({ status: "cancelled" }).eq("id", id);
      }
      // Clear all orders from local state
      setOrders([]);
      toast.success(`${ids.length} pedido(s) cancelado(s)`);
    } else if (actionTargetId) {
      if (actionType === "cancel") {
        await supabase.from("orders").update({ status: "cancelled" }).eq("id", actionTargetId);
        // Remove from local state
        setOrders(prev => prev.filter(o => o.id !== actionTargetId));
        toast.success(`Pedido ${getOrderNumber(actionTargetId)} cancelado`);
      } else if (actionType === "pause") {
        await supabase.from("orders").update({ status: "pending" }).eq("id", actionTargetId);
        // Update local state to pending
        setOrders(prev => prev.map(o => 
          o.id === actionTargetId ? { ...o, status: "pending" as const } : o
        ));
        toast.success(`Pedido ${getOrderNumber(actionTargetId)} pausado`);
      } else if (actionType === "dispatch") {
        const order = orders.find(o => o.id === actionTargetId);
        if (order) {
          for (const item of order.items) {
            if (item.readyQuantity < item.quantity) {
              await supabase.from("order_items").update({ ready_quantity: item.quantity }).eq("id", item.id);
            }
          }
          await supabase.from("orders").update({ status: "ready", ready_at: new Date().toISOString() }).eq("id", actionTargetId);
          
          // Immediately update local state
          setOrders(prev => prev.filter(o => o.id !== actionTargetId));
          await loadFinished();
          
          if (soundEnabled) playReadySound();
          toast.success(`Pedido despachado! Mesa ${String(order.tableNumber).padStart(2, "0")} — ${order.clientName}`);
          supabase.functions.invoke("push-notify", {
            body: {
              action: "notify",
              title: `Pedido Pronto!`,
              message: `Mesa ${String(order.tableNumber).padStart(2, "0")} — ${order.clientName}`,
              url: "/",
            },
          }).catch(() => toast.error("Notificacao nao enviada"));
        }
      }
    }
    setActionDialogOpen(false);
  };

  // Drag and drop to finalized
  const handleDragStart = (e: React.DragEvent, orderId: string) => {
    e.dataTransfer.setData("text/plain", orderId);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverReady(false);
    const orderId = e.dataTransfer.getData("text/plain");
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    // Mark all items as fully ready
    for (const item of order.items) {
      if (item.readyQuantity < item.quantity) {
        await supabase.from("order_items").update({ ready_quantity: item.quantity }).eq("id", item.id);
      }
    }
    await supabase.from("orders").update({ status: "ready", ready_at: new Date().toISOString() }).eq("id", orderId);
    if (soundEnabled) playReadySound();
    toast.success(`✅ Pedido pronto! Mesa ${String(order.tableNumber).padStart(2, "0")} — ${order.clientName}`);
    // Send push notification to attendants
    supabase.functions.invoke("push-notify", {
      body: {
        action: "notify",
        title: `🔔 Pedido Pronto!`,
        message: `Mesa ${String(order.tableNumber).padStart(2, "0")} — ${order.clientName}`,
        url: "/",
      },
    }).catch(() => toast.error("Notificação não enviada"));
  };

  const getOrderNumber = (id: string) => "#" + id.slice(0, 4).toUpperCase();

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[hsl(220,20%,12%)] text-white">
        <span className="h-12 w-12 animate-pulse text-primary text-4xl inline-block" aria-hidden>🔥</span>
        <span className="text-sm text-white/70">Carregando pedidos...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[hsl(220,20%,12%)] text-white flex flex-col">
      {/* Header — compact single row */}
      <header className="sticky top-0 z-10 border-b border-white/10 bg-[hsl(220,20%,10%)]/90 backdrop-blur-md px-2 sm:px-3 py-1.5 sm:py-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-primary shrink-0 text-lg sm:text-xl" aria-hidden>🍳</span>
          <h1 className="text-sm sm:text-xl font-bold leading-none truncate" style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.05em" }}>
            Cozinha
          </h1>
          {(navRoles.attendant || navRoles.kitchen || navRoles.admin) && (
            <div className="hidden sm:flex items-center gap-1 ml-2 border-l border-white/20 pl-2">
              {navRoles.attendant && (
                <Button variant="ghost" size="sm" className="h-8 text-xs text-white/60 hover:text-white gap-1" onClick={() => navigate("/")}>
                  <span aria-hidden>📋</span> Atendimento
                </Button>
              )}
              {navRoles.kitchen && (
                <Button variant="ghost" size="sm" className="h-8 text-xs text-primary gap-1" onClick={() => navigate("/cozinha")}>
                  <span aria-hidden>🍳</span> Cozinha
                </Button>
              )}
              {navRoles.admin && (
                <Button variant="ghost" size="sm" className="h-8 text-xs text-white/60 hover:text-white gap-1" onClick={() => navigate("/admin")}>
                  <span aria-hidden>⚙</span> Admin
                </Button>
              )}
            </div>
          )}
          {isReadOnly && (
            <span className="text-[9px] bg-white/10 text-white/50 px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wider">
              Somente leitura
            </span>
          )}
          {!isReadOnly && (
            <span className="hidden sm:inline text-[10px] text-white/40">
              Duplo-clique = preparando • ✓ pronto • Arraste → finalizar
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {userName && (
            <div className="hidden sm:flex items-center gap-1 mr-1">
              <span className="text-white/40 text-xs" aria-hidden>👤</span>
              <span className="text-[10px] font-semibold text-white/70">{userName}</span>
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                userRole === "admin" ? "bg-primary/20 text-primary" :
                userRole === "kitchen" ? "bg-emerald-500/20 text-emerald-400" :
                "bg-white/10 text-white/50"
              }`}>
                {userRole === "admin" ? "Admin" : userRole === "kitchen" ? "Cozinheiro" : "Atendente"}
              </span>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="text-white/50 hover:text-white h-10 w-10 sm:h-8 sm:w-8"
            onClick={() => setSoundEnabled(!soundEnabled)}
            title={soundEnabled ? "Desativar sons" : "Ativar sons"}
          >
            <span className="text-sm" aria-hidden>{soundEnabled ? "🔊" : "🔇"}</span>
          </Button>
          {!isReadOnly && (
            <>
              <Button
                variant={paused ? "default" : "destructive"}
                size="sm"
                className="gap-1 h-10 text-xs px-3 sm:text-xs sm:px-2.5 sm:h-8"
                onClick={() => setPaused(!paused)}
              >
                <span className="text-sm" aria-hidden>{paused ? "▶" : "⏸"}</span>
                <span className="hidden sm:inline">{paused ? "Retomar" : "Pausar"}</span>
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="gap-1 h-10 text-xs px-3 sm:text-xs sm:px-2.5 sm:h-8"
                onClick={() => openActionDialog("cancel-all")}
              >
                <span className="text-sm" aria-hidden>⛔</span>
                <span className="hidden sm:inline">Cancelar</span>
              </Button>
            </>
          )}
          <Button
            variant="outline"
            size="sm"
            className="gap-1 h-10 text-xs px-3 sm:text-xs sm:px-2.5 sm:h-8 border-white/20 text-white/60 hover:text-white"
            onClick={() => signOut()}
          >
            <span className="text-sm" aria-hidden>🚪</span>
            <span className="hidden sm:inline">Sair</span>
          </Button>
        </div>
      </header>

      {/* KDS Quick Stats */}
      <div className="border-b border-white/10 bg-[hsl(220,20%,10%)]/50 px-2 sm:px-3 py-2">
        <div className="flex items-center gap-2 sm:gap-4 overflow-x-auto">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-yellow-500/10 border border-yellow-500/20 shrink-0">
            <span className="text-yellow-400 text-xs">Pendentes</span>
            <span className="text-sm font-bold text-yellow-400">{orders.filter(o => o.status === "pending").length}</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary/10 border border-primary/20 shrink-0">
            <span className="text-primary text-xs">Preparando</span>
            <span className="text-sm font-bold text-primary">{orders.filter(o => o.status === "preparing").length}</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 shrink-0">
            <span className="text-emerald-400 text-xs">Prontos</span>
            <span className="text-sm font-bold text-emerald-400">{finishedOrders.length}</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 shrink-0">
            <span className="text-white/60 text-xs">Mesas</span>
            <span className="text-sm font-bold text-white/80">{tableGroups.length}</span>
          </div>
          {orders.filter(o => o.status !== "ready" && o.status !== "delivered" && Date.now() - o.placedAt.getTime() > 15 * 60 * 1000).length > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-500/15 border border-red-500/30 animate-pulse shrink-0">
              <span className="text-red-400 text-xs">Atrasados</span>
              <span className="text-sm font-bold text-red-400">
                {orders.filter(o => o.status !== "ready" && o.status !== "delivered" && Date.now() - o.placedAt.getTime() > 15 * 60 * 1000).length}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Mobile tab switcher */}
      <div className="flex sm:hidden border-b border-white/10">
        <button
          onClick={() => setKdsTab("ativos")}
          className={`flex-1 py-2 text-xs font-bold text-center transition-colors ${
            kdsTab === "ativos" ? "text-primary border-b-2 border-primary" : "text-white/40"
          }`}
        >
          <span className="inline mr-1 opacity-80" aria-hidden>🍳</span>
          Ativos ({orders.length})
        </button>
        <button
          onClick={() => setKdsTab("prontos")}
          className={`flex-1 py-2 text-xs font-bold text-center transition-colors ${
            kdsTab === "prontos" ? "text-green-400 border-b-2 border-green-400" : "text-white/40"
          }`}
        >
          <span className="inline mr-1 opacity-80" aria-hidden>✓</span>
          Prontos ({finishedOrders.length})
        </button>
      </div>

      <div className="flex-1 flex flex-col sm:flex-row gap-0 sm:gap-3 p-2 sm:p-3 overflow-hidden">
        {/* Active orders — grouped by table */}
        <div className={`flex-1 overflow-y-auto pr-0 sm:pr-2 ${kdsTab !== "ativos" ? "hidden sm:block" : ""}`}>
          <h2 className="hidden sm:flex text-sm font-bold mb-3 items-center gap-2">
            <span aria-hidden>🍳</span>
            Pedidos Ativos ({orders.length})
            {tableGroups.length > 0 && (
              <span className="text-sm font-normal text-white/40 ml-1">
                · {tableGroups.length} {tableGroups.length === 1 ? "mesa" : "mesas"}
              </span>
            )}
          </h2>

          {orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-white/30">
              <span className="text-5xl mb-4 opacity-50" aria-hidden>✓</span>
              <p className="text-lg">Nenhum pedido pendente</p>
            </div>
          ) : (
            <div
              className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-2"
            >
              <AnimatePresence>
                {tableGroups.map((group) => {
                  const heat = getHeat({ placedAt: group.oldestPlacedAt } as KitchenOrder);
                  const pad = heatPadding(heat);
                  const timerFontSize = heatTimerSize(heat);
                  const borderW = heatBorderWidth(heat);
                  const isCritical = heat >= 0.8;
                  const isExpanded = expandedTables.has(group.tableNumber);
                    const toggleExpand = () => {
                      setExpandedTables((prev) => {
                        const next = new Set(prev);
                        if (next.has(group.tableNumber)) {
                          next.delete(group.tableNumber);
                        } else {
                          next.add(group.tableNumber);
                        }
                        return next;
                      });
                    };

                  return (
                    <motion.div
                      key={`table-${group.tableNumber}`}
                      layout
                      initial={{ opacity: 0, scale: 0.92 }}
                      animate={{ opacity: paused ? 0.4 : 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.3 } }}
                      style={{
                        padding: isExpanded ? `${pad}px` : "2px 4px",
                        borderWidth: `${borderW}px`,
                        borderColor: heatBorderColor(heat),
                        backgroundColor: heatBgColor(heat),
                        boxShadow: heatGlow(heat),
                        breakInside: "avoid" as const,
                      }}
                      className={`rounded select-none transition-all duration-700 mb-0.5 text-white ${paused ? "grayscale-[40%]" : ""}`}
                    >
                      {/* Header — ultra-compact when collapsed */}
                      <div className="flex items-center justify-between cursor-pointer" onClick={toggleExpand} style={{ minHeight: isExpanded ? undefined : "18px" }}>
                        <div className="flex items-center gap-0.5">
                          <span className={`font-black flex items-center gap-0.5 ${isExpanded ? "text-[12px]" : "text-[8px]"}`}>
                            <span className="opacity-80" aria-hidden>▦</span>
                            M{String(group.tableNumber).padStart(2, "0")}
                          </span>
                          {isCritical && (
                            <span className="text-[7px] font-bold bg-white/25 px-0.5 rounded-full animate-pulse">⚠</span>
                          )}
                          {!isExpanded && (
                            <span className="text-[7px] bg-black/15 px-0.5 rounded-full leading-none">
                              {group.totalItems}
                            </span>
                          )}
                          {isExpanded && (
                            <span className="text-[10px] bg-black/15 px-1.5 py-0.5 rounded-full">
                              {group.totalItems} itens
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-0.5">
                          <div className="rounded px-0.5 bg-black/20 shrink-0">
                            <p className={`font-mono font-black leading-none ${isExpanded ? "" : "text-[8px]"}`} style={isExpanded ? { fontSize: `${timerFontSize}px` } : undefined}>
                              {getElapsed(group.oldestPlacedAt)}
                            </p>
                          </div>
                          <span className="text-[10px] opacity-50">{isExpanded ? "▲" : "▼"}</span>
                        </div>
                      </div>

                      {/* Expanded: full detail */}
                      {isExpanded && (
                        <div className="space-y-1.5 mt-1">
                          {group.orders.map((order) => (
                            <div
                              key={order.id}
                              draggable={!paused && !isReadOnly}
                              onDragStart={(e) => !isReadOnly && handleDragStart(e as any, order.id)}
                              onDoubleClick={() => !paused && !isReadOnly && order.status === "pending" && handleStartPreparing(order.id)}
                              className={`rounded-lg bg-black/10 p-2 transition-colors ${isReadOnly ? "" : "cursor-pointer hover:bg-black/15"}`}
                            >
                              {/* Order sub-header */}
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-1">
                                  <span className="text-[9px] font-bold bg-black/20 px-1 py-0.5 rounded-full">
                                    {getOrderNumber(order.id)}
                                  </span>
                                  <span className="text-[10px] opacity-60" aria-hidden>👤</span>
                                  <span className="text-xs font-bold">{order.clientName}</span>
                                  {order.status === "preparing" && (
                                    <span className="text-[9px] bg-white/15 px-1 py-0.5 rounded-full flex items-center gap-0.5">
                                      <span className="text-[8px] opacity-80" aria-hidden>🔥</span> Prep
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className="text-[9px] text-white/50 font-mono">{getElapsed(order.placedAt)}</span>
                                  {!isReadOnly && (
                                    <div className="flex items-center gap-0.5">
                                      {order.status === "preparing" && (
                                        <button
                                          onClick={(e) => { e.stopPropagation(); openActionDialog("pause", order.id); }}
                                          className="flex h-7 w-7 items-center justify-center rounded-full bg-yellow-500/20 hover:bg-yellow-500/40 transition-colors"
                                          title="Pausar"
                                        >
                                          <span className="text-yellow-400 text-xs" aria-hidden>⏸</span>
                                        </button>
                                      )}
                                      <button
                                        onClick={(e) => { e.stopPropagation(); openActionDialog("dispatch", order.id); }}
                                        className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/20 hover:bg-emerald-500/40 transition-colors"
                                        title="Despachar"
                                      >
                                        <span className="text-emerald-400 text-xs" aria-hidden>✓</span>
                                      </button>
                                      <button
                                        onClick={(e) => { e.stopPropagation(); openActionDialog("cancel", order.id); }}
                                        className="flex h-7 w-7 items-center justify-center rounded-full bg-red-500/20 hover:bg-red-500/40 transition-colors"
                                        title="Cancelar"
                                      >
                                        <span className="text-red-400 text-xs" aria-hidden>⛔</span>
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Items */}
                              <div className="space-y-0.5">
                                {order.items.map((item) => {
                                  const allDone = item.readyQuantity >= item.quantity;
                                  const claimedByOther = item.claimedBy && item.claimedBy !== currentUserId;
                                  const claimedByMe = item.claimedBy === currentUserId;
                                  return (
                                    <div key={item.id} className={`rounded px-1.5 py-1 ${
                                      allDone ? "bg-black/25 opacity-50" 
                                      : claimedByOther ? "bg-black/30 opacity-60" 
                                      : claimedByMe ? "bg-white/10 ring-1 ring-white/20" 
                                      : "bg-black/10"
                                    }`}>
                                      <div className="flex items-center justify-between gap-1">
                                        <span className={`font-bold text-[11px] flex-1 min-w-0 truncate ${allDone ? "line-through" : ""}`}>
                                          {getFoodEmoji(item.name)} {item.quantity}× {item.name}
                                          {claimedByOther && (
                                            <span className="text-[8px] ml-1 bg-yellow-500/30 text-yellow-300 px-1 py-0.5 rounded-full font-semibold">
                                              🔒 Outro
                                            </span>
                                          )}
                                          {claimedByMe && !allDone && (
                                            <span className="text-[8px] ml-1 bg-green-500/30 text-green-300 px-1 py-0.5 rounded-full font-semibold">
                                              👨‍🍳 Você
                                            </span>
                                          )}
                                        </span>
                                        <div className="flex items-center gap-1">
                                          <span className="text-[9px] font-mono font-bold bg-white/15 px-1 py-0.5 rounded-full">
                                            {item.readyQuantity}/{item.quantity}
                                          </span>
                                          {!allDone && !paused && !isReadOnly && !claimedByOther && (
                                            <button
                                              onClick={(e) => { e.stopPropagation(); handleItemReady(order, item); }}
                                              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/25 hover:bg-white/40 active:scale-90 transition-all"
                                            >
                                              <span className="text-base" aria-hidden>✓</span>
                                            </button>
                                          )}
                                          {!allDone && !paused && !isReadOnly && !claimedByOther && !claimedByMe && (
                                            <button
                                              onClick={(e) => { e.stopPropagation(); handleClaimItem(item, order); }}
                                              className="flex h-8 w-8 items-center justify-center rounded-full bg-yellow-500/20 hover:bg-yellow-500/40 active:scale-90 transition-all"
                                              title="Reservar item"
                                            >
                                              <span className="text-yellow-400 text-sm" aria-hidden>🔥</span>
                                            </button>
                                          )}
                                          {claimedByOther && <span className="text-[9px]">🔒</span>}
                                          {allDone && <span className="text-xs opacity-50" aria-hidden>✓</span>}
                                        </div>
                                      </div>
                                      {item.ingredientMods && item.ingredientMods.length > 0 && (
                                        <div className="flex flex-wrap gap-0.5 mt-0.5">
                                          {item.ingredientMods.map((mod, mIdx) => (
                                            <span key={mIdx} className={`text-[9px] font-semibold px-1 py-0.5 rounded-full ${mod.action === "extra" ? "bg-white/20" : "bg-black/20"}`}>
                                              {mod.action === "extra" ? "+" : "−"}{mod.name}
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                      {item.observation && (
                                        <p className="text-[9px] italic opacity-75 mt-0.5">{item.observation}</p>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Finished column with drop zone — always visible */}
        <div
          className={`sm:flex-none w-full sm:w-52 lg:w-64 shrink-0 border-t-2 sm:border-t-0 sm:border-l-2 pt-2 sm:pt-0 sm:pl-2 overflow-y-auto transition-colors ${
            kdsTab !== "prontos" ? "sm:block" : ""
          } ${dragOverReady ? "border-emerald-400 bg-emerald-500/5" : "border-white/10"}`}
          onDragOver={isReadOnly ? undefined : (e) => { e.preventDefault(); setDragOverReady(true); }}
          onDragLeave={isReadOnly ? undefined : () => setDragOverReady(false)}
          onDrop={isReadOnly ? undefined : handleDrop}
        >
          <h2 className="flex text-[10px] sm:text-xs font-bold mb-1 sm:mb-1.5 items-center gap-1">
            <span className="text-green-400 text-xs" aria-hidden>✓</span>
            Prontos ({finishedOrders.length})
          </h2>

          {finishedTableGroups.length === 0 ? (
            <div className={`flex items-center justify-center rounded-lg border-2 border-dashed py-4 sm:py-8 transition-colors ${
              dragOverReady ? "border-emerald-400 bg-emerald-500/10" : "border-white/10"
            }`}>
              <p className="text-[10px] text-white/30 font-medium">Arraste pedidos aqui</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {finishedTableGroups.map((group) => {
                const isFinishedExpanded = expandedFinished.has(group.tableNumber);
                const toggleFinishedExpand = () => {
                  setExpandedFinished((prev) => {
                    const next = new Set(prev);
                    if (next.has(group.tableNumber)) next.delete(group.tableNumber);
                    else next.add(group.tableNumber);
                    return next;
                  });
                };

                return (
                  <motion.div
                    key={`finished-table-${group.tableNumber}`}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="rounded border border-emerald-500/20 bg-emerald-900/10 cursor-pointer"
                    style={{ padding: isFinishedExpanded ? "6px" : "2px 4px" }}
                    onClick={toggleFinishedExpand}
                  >
                    {/* Compact header */}
                    <div className="flex items-center justify-between" style={{ minHeight: isFinishedExpanded ? undefined : "18px" }}>
                      <div className="flex items-center gap-0.5">
                        <span className={`font-black flex items-center gap-0.5 text-emerald-300 ${isFinishedExpanded ? "text-[10px]" : "text-[8px]"}`}>
                          <span className="opacity-80" aria-hidden>▦</span>
                          M{String(group.tableNumber).padStart(2, "0")}
                        </span>
                        <span className="text-[7px] bg-white/10 px-0.5 rounded-full leading-none">
                          {group.totalItems}
                        </span>
                      </div>
                      <div className="flex items-center gap-0.5">
                        <span className="text-emerald-400 text-[10px]" aria-hidden>✓</span>
                        {isFinishedExpanded ? <span className="text-[8px] opacity-50">▲</span> : <span className="text-[8px] opacity-50">▼</span>}
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {isFinishedExpanded && (
                      <div className="space-y-0.5 mt-1">
                        {group.orders.map((order) => (
                          <div key={order.id} className="rounded bg-black/10 px-1 py-0.5">
                            <div className="flex items-center gap-0.5">
                              <span className="text-[7px] font-bold bg-black/20 px-0.5 rounded">
                                {getOrderNumber(order.id)}
                              </span>
                              <span className="text-[8px] font-semibold truncate">{order.clientName}</span>
                            </div>
                            {order.items.map((item) => (
                              <p key={item.id} className="text-[7px] text-white/50 truncate">
                                {item.quantity}× {item.name}
                              </p>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Action Dialog */}
      <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
        <DialogContent className="bg-[hsl(220,20%,15%)] border-white/10 text-white">
          <DialogHeader>
            <DialogTitle>
              {actionType === "cancel-all" ? "Cancelar Todos os Pedidos" 
                : actionType === "cancel" ? "Cancelar Pedido"
                : actionType === "pause" ? "Pausar Pedido"
                : "Despachar Pedido"}
            </DialogTitle>
            <DialogDescription className="text-white/60">
              {actionType === "cancel-all" ? "Digite a senha para cancelar todos os pedidos."
                : actionType === "cancel" ? "Digite a senha para cancelar este pedido."
                : actionType === "pause" ? "Digite a senha para pausar este pedido."
                : "Digite a senha para despachar este pedido como pronto."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="action-pwd" className="text-white/70">Senha</Label>
            <Input
              id="action-pwd"
              type="password"
              placeholder="Digite a senha"
              value={actionPassword}
              onChange={(e) => setActionPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleActionConfirm()}
              autoFocus
              className="bg-white/10 border-white/20 text-white placeholder:text-white/30"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialogOpen(false)} className="border-white/20 text-white/60">
              Voltar
            </Button>
            <Button 
              variant={actionType === "dispatch" ? "default" : "destructive"} 
              onClick={handleActionConfirm}
              className={actionType === "dispatch" ? "bg-emerald-600 hover:bg-emerald-700" : actionType === "pause" ? "bg-yellow-600 hover:bg-yellow-700" : ""}
            >
              {actionType === "cancel" || actionType === "cancel-all" ? "Confirmar Cancelamento"
                : actionType === "pause" ? "Confirmar Pausa"
                : "Confirmar Despacho"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ── Page wrapper with auth gate ──
const KitchenPage = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[hsl(220,20%,12%)] text-white">
        <span className="h-12 w-12 animate-pulse text-primary text-4xl inline-block" aria-hidden>🔥</span>
        <span className="text-sm text-white/70">Carregando...</span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: "/cozinha" }} />;
  }

  return <KitchenDisplay />;
};

export default KitchenPage;
