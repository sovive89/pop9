# POP9 — IMPLEMENTAÇÃO COMPLETA
## Schema + Frontend + Backend — Tudo Concentrado

---

# PARTE 1: MIGRATIONS SQL (Supabase)

## 1.1 - Criar tabela `items` (unificada: insumos, produzidos, venda)

```sql
-- Arquivo: supabase/migrations/20260307000000_create_items_unified.sql

CREATE TABLE public.items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('insumo', 'produzido', 'venda')),
  base_unit TEXT NOT NULL,
  current_stock NUMERIC DEFAULT 0,
  minimum_stock NUMERIC DEFAULT 0,
  critical_stock NUMERIC DEFAULT 0,
  available BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_items_type ON public.items(type);
CREATE INDEX idx_items_available ON public.items(available);
```

## 1.2 - Criar tabela `recipes` (receitas de produção)

```sql
-- Arquivo: supabase/migrations/20260307000001_create_recipes.sql

CREATE TABLE public.recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  output_item_id UUID NOT NULL REFERENCES public.items(id),
  default_yield NUMERIC NOT NULL,
  shelf_life_days INTEGER,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE public.recipe_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  input_item_id UUID NOT NULL REFERENCES public.items(id),
  quantity NUMERIC NOT NULL,
  ingredient_type TEXT NOT NULL CHECK (ingredient_type IN ('precise', 'approximate', 'overhead')),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_recipe_ingredients_recipe ON public.recipe_ingredients(recipe_id);
CREATE INDEX idx_recipe_ingredients_type ON public.recipe_ingredients(ingredient_type);
```

## 1.3 - Criar tabela `stock_movements` (rastreamento)

```sql
-- Arquivo: supabase/migrations/20260307000002_create_stock_movements.sql

CREATE TABLE public.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.items(id),
  quantity NUMERIC NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('compra', 'producao_entrada', 'producao_saida', 'venda', 'ajuste')),
  batch_id UUID,
  expires_at DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX idx_stock_movements_item ON public.stock_movements(item_id);
CREATE INDEX idx_stock_movements_batch ON public.stock_movements(batch_id);
CREATE INDEX idx_stock_movements_reason ON public.stock_movements(reason);
```

## 1.4 - Criar tabela `production_batches` (lotes produzidos)

```sql
-- Arquivo: supabase/migrations/20260307000003_create_production_batches.sql

CREATE TABLE public.production_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES public.recipes(id),
  quantity_produced NUMERIC NOT NULL,
  produced_at TIMESTAMP DEFAULT NOW(),
  expires_at DATE,
  batch_code TEXT UNIQUE,
  notes TEXT,
  produced_by UUID REFERENCES auth.users(id)
);

CREATE INDEX idx_batches_recipe ON public.production_batches(recipe_id);
CREATE INDEX idx_batches_produced_at ON public.production_batches(produced_at);
```

## 1.5 - Criar tabela `orders_kds` (pedidos para KDS)

```sql
-- Arquivo: supabase/migrations/20260307000004_create_orders_kds.sql

CREATE TABLE public.orders_kds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id),
  menu_item_id UUID NOT NULL REFERENCES public.menu_items(id),
  quantity INTEGER NOT NULL,
  observations TEXT,
  preparation_location TEXT NOT NULL CHECK (preparation_location IN ('kitchen', 'bar', 'counter')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'preparing', 'ready', 'served', 'cancelled')),
  
  received_at TIMESTAMP,
  preparation_started_at TIMESTAMP,
  completed_at TIMESTAMP,
  
  timer_wait_seconds INTEGER DEFAULT 0,
  timer_prep_seconds INTEGER DEFAULT 0,
  timer_delivery_seconds INTEGER DEFAULT 0,
  color TEXT DEFAULT 'green',
  is_blinking BOOLEAN DEFAULT false,
  paused BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_kds_order ON public.orders_kds(order_id);
CREATE INDEX idx_kds_status ON public.orders_kds(status);
CREATE INDEX idx_kds_location ON public.orders_kds(preparation_location);
```

## 1.6 - Criar tabela `app_config` (configurações globais)

```sql
-- Arquivo: supabase/migrations/20260307000005_create_app_config.sql

CREATE TABLE public.app_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value TEXT,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Inserts de configuração padrão
INSERT INTO public.app_config (key, value, description) VALUES
  ('thermal_printer_kitchen_ip', '192.168.1.100', 'IP da impressora térmica da cozinha'),
  ('thermal_printer_cashier_ip', '192.168.1.101', 'IP da impressora térmica do caixa'),
  ('kds_display_address', 'http://localhost:5173/kds', 'Endereço do display KDS'),
  ('overhead_calc_days', '30', 'Dias para cálculo de overhead'),
  ('alert_critical_stock', 'true', 'Alertar quando estoque crítico'),
  ('pause_all_operations', 'false', 'Pausa todas as operações');
```

---

# PARTE 2: SUPABASE FUNCTIONS & RPCS

## 2.1 - RPC: Criar receita com ingredientes

```sql
-- Arquivo: supabase/migrations/20260307000006_rpc_create_recipe.sql

CREATE OR REPLACE FUNCTION create_production_recipe(
  p_name TEXT,
  p_output_item_id UUID,
  p_default_yield NUMERIC,
  p_shelf_life_days INTEGER,
  p_ingredients JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_recipe_id UUID;
  v_ingredient JSONB;
BEGIN
  -- Criar receita
  INSERT INTO public.recipes (name, output_item_id, default_yield, shelf_life_days)
  VALUES (p_name, p_output_item_id, p_default_yield, p_shelf_life_days)
  RETURNING id INTO v_recipe_id;

  -- Inserir ingredientes
  FOR v_ingredient IN SELECT * FROM jsonb_array_elements(p_ingredients)
  LOOP
    INSERT INTO public.recipe_ingredients (
      recipe_id, input_item_id, quantity, ingredient_type
    ) VALUES (
      v_recipe_id,
      (v_ingredient->>'input_item_id')::UUID,
      (v_ingredient->>'quantity')::NUMERIC,
      v_ingredient->>'ingredient_type'
    );
  END LOOP;

  RETURN v_recipe_id;
END;
$$;
```

## 2.2 - RPC: Produzir lote

```sql
-- Arquivo: supabase/migrations/20260307000007_rpc_produce_batch.sql

CREATE OR REPLACE FUNCTION produce_batch(
  p_recipe_id UUID,
  p_quantity NUMERIC,
  p_notes TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_batch_id UUID;
  v_output_item_id UUID;
  v_expires_at DATE;
  v_ingredient RECORD;
  v_batch_code TEXT;
BEGIN
  -- Buscar dados da receita
  SELECT output_item_id, shelf_life_days INTO v_output_item_id, v_expires_at
  FROM public.recipes
  WHERE id = p_recipe_id;

  v_expires_at := CASE WHEN v_expires_at IS NOT NULL 
    THEN NOW()::DATE + (v_expires_at || ' days')::INTERVAL
    ELSE NULL
  END;

  v_batch_code := 'BATCH-' || DATE_PART('YYYYMMDD', NOW())::TEXT || '-' || SUBSTR(gen_random_uuid()::TEXT, 1, 8);

  -- Criar batch
  INSERT INTO public.production_batches (
    recipe_id, quantity_produced, expires_at, batch_code, notes, produced_by
  ) VALUES (
    p_recipe_id, p_quantity, v_expires_at, v_batch_code, p_notes, auth.uid()
  )
  RETURNING id INTO v_batch_id;

  -- Descontar insumos (producao_saida)
  FOR v_ingredient IN 
    SELECT ri.input_item_id, ri.quantity 
    FROM public.recipe_ingredients ri 
    WHERE ri.recipe_id = p_recipe_id AND ri.ingredient_type != 'overhead'
  LOOP
    INSERT INTO public.stock_movements (item_id, quantity, reason, batch_id, created_by)
    VALUES (v_ingredient.input_item_id, -(v_ingredient.quantity * p_quantity), 'producao_saida', v_batch_id, auth.uid());
  END LOOP;

  -- Creditar item produzido (producao_entrada)
  INSERT INTO public.stock_movements (item_id, quantity, reason, batch_id, expires_at, created_by)
  VALUES (v_output_item_id, p_quantity, 'producao_entrada', v_batch_id, v_expires_at, auth.uid());

  RETURN v_batch_id;
END;
$$;
```

## 2.3 - RPC: Atualizar estoque via movements

```sql
-- Arquivo: supabase/migrations/20260307000008_rpc_update_stock.sql

CREATE OR REPLACE FUNCTION update_stock_from_movements()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.items
  SET current_stock = current_stock + NEW.quantity,
      updated_at = NOW()
  WHERE id = NEW.item_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_stock
AFTER INSERT ON public.stock_movements
FOR EACH ROW
EXECUTE FUNCTION update_stock_from_movements();
```

## 2.4 - RPC: Notificar garçom quando prato pronto

```sql
-- Arquivo: supabase/migrations/20260307000009_rpc_notify_waiter.sql

CREATE OR REPLACE FUNCTION notify_item_ready()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_order_id UUID;
  v_all_ready BOOLEAN;
BEGIN
  IF NEW.status = 'ready' THEN
    SELECT order_id INTO v_order_id FROM public.orders_kds WHERE id = NEW.id;
    
    -- Verificar se TODOS os itens do pedido estão prontos
    SELECT NOT EXISTS(
      SELECT 1 FROM public.orders_kds 
      WHERE order_id = v_order_id AND status != 'ready' AND status != 'served' AND status != 'cancelled'
    ) INTO v_all_ready;

    IF v_all_ready THEN
      -- Notificar (via Realtime ou Webhook)
      PERFORM pg_notify('order_ready', json_build_object(
        'order_id', v_order_id,
        'timestamp', NOW()
      )::text);
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_notify_item_ready
AFTER UPDATE ON public.orders_kds
FOR EACH ROW
EXECUTE FUNCTION notify_item_ready();
```

---

# PARTE 3: COMPONENTES REACT (Frontend)

## 3.1 - KDSDisplay.tsx (Kitchen Display System)

```tsx
// src/components/KDSDisplay.tsx

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, Pause, Play, ChefHat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface KDSItem {
  id: string;
  order_id: string;
  menu_item_id: string;
  quantity: number;
  observations: string;
  preparation_location: "kitchen" | "bar" | "counter";
  status: "pending" | "preparing" | "ready" | "served" | "cancelled";
  timer_wait_seconds: number;
  timer_prep_seconds: number;
  timer_delivery_seconds: number;
  color: string;
  is_blinking: boolean;
  paused: boolean;
  received_at: string;
  preparation_started_at: string;
  completed_at: string;
  created_at: string;
  updated_at: string;
}

const getStatusColor = (status: string, isBlinking: boolean) => {
  const colors: Record<string, string> = {
    pending: "bg-green-500",
    preparing: "bg-yellow-500",
    ready: "bg-blue-500",
    served: "bg-gray-500",
    cancelled: "bg-red-500",
  };
  return colors[status] || "bg-gray-500";
};

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

const KDSCard = ({
  item,
  onMarkReady,
  onPause,
}: {
  item: KDSItem;
  onMarkReady: (id: string) => void;
  onPause: (id: string) => void;
}) => {
  const [elapsedWait, setElapsedWait] = useState(0);
  const [elapsedPrep, setElapsedPrep] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!item.paused) {
        if (item.status === "pending" && item.received_at) {
          const elapsed = Math.floor(
            (Date.now() - new Date(item.received_at).getTime()) / 1000
          );
          setElapsedWait(elapsed);
        } else if (item.status === "preparing" && item.preparation_started_at) {
          const elapsed = Math.floor(
            (Date.now() - new Date(item.preparation_started_at).getTime()) / 1000
          );
          setElapsedPrep(elapsed);
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [item]);

  const isOverdue =
    (item.status === "pending" && elapsedWait > item.timer_wait_seconds) ||
    (item.status === "preparing" && elapsedPrep > item.timer_prep_seconds);

  const statusBgColor = getStatusColor(item.status, item.is_blinking);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      className={`${statusBgColor} rounded-xl p-4 text-white shadow-lg ${
        item.is_blinking ? "animate-pulse" : ""
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-bold text-lg">Pedido #{item.order_id.slice(0, 8)}</h3>
        <Badge variant="secondary" className="text-xs">
          {item.quantity}x
        </Badge>
      </div>

      <p className="text-sm mb-2">{item.observations || "Sem observações"}</p>

      <div className="space-y-1 mb-4">
        <div className="text-xs flex justify-between">
          <span>Espera</span>
          <span className={isOverdue ? "font-bold" : ""}>
            {formatTime(elapsedWait)}
          </span>
        </div>
        <div className="text-xs flex justify-between">
          <span>Preparo</span>
          <span>{formatTime(elapsedPrep)}</span>
        </div>
      </div>

      <div className="flex gap-2">
        {item.status === "pending" && (
          <Button
            size="sm"
            className="flex-1 bg-orange-600 hover:bg-orange-700"
            onClick={() => onMarkReady(item.id)}
          >
            <ChefHat className="h-4 w-4 mr-1" /> Iniciando
          </Button>
        )}
        {item.status === "preparing" && (
          <Button
            size="sm"
            className="flex-1 bg-green-600 hover:bg-green-700"
            onClick={() => onMarkReady(item.id)}
          >
            Pronto
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          className="flex-1"
          onClick={() => onPause(item.id)}
        >
          {item.paused ? (
            <Play className="h-4 w-4" />
          ) : (
            <Pause className="h-4 w-4" />
          )}
        </Button>
      </div>
    </motion.div>
  );
};

const KDSDisplay = ({ location }: { location: "kitchen" | "bar" | "counter" }) => {
  const [items, setItems] = useState<KDSItem[]>([]);
  const [pausedAll, setPausedAll] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadKDSItems = async () => {
      const { data } = await supabase
        .from("orders_kds")
        .select("*")
        .eq("preparation_location", location)
        .in("status", ["pending", "preparing"])
        .order("created_at", { ascending: true });

      setItems((data as KDSItem[]) || []);
      setLoading(false);
    };

    loadKDSItems();

    // Real-time subscription
    const channel = supabase
      .channel(`kds_${location}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders_kds",
          filter: `preparation_location=eq.${location}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setItems((prev) => [...prev, payload.new as KDSItem]);
          } else if (payload.eventType === "UPDATE") {
            setItems((prev) =>
              prev.map((item) =>
                item.id === payload.new.id ? (payload.new as KDSItem) : item
              )
            );
          } else if (payload.eventType === "DELETE") {
            setItems((prev) =>
              prev.filter((item) => item.id !== payload.old.id)
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [location]);

  const handleMarkReady = useCallback(async (itemId: string) => {
    await supabase
      .from("orders_kds")
      .update({
        status: "ready",
        completed_at: new Date().toISOString(),
      })
      .eq("id", itemId);
  }, []);

  const handlePause = useCallback(async (itemId: string) => {
    const item = items.find((i) => i.id === itemId);
    if (item) {
      await supabase
        .from("orders_kds")
        .update({ paused: !item.paused })
        .eq("id", itemId);
    }
  }, [items]);

  const handlePauseAll = useCallback(async () => {
    await supabase
      .from("app_config")
      .update({ value: pausedAll ? "false" : "true" })
      .eq("key", "pause_all_operations");
    setPausedAll(!pausedAll);
  }, [pausedAll]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-900">
        <div className="text-white text-2xl">Carregando KDS...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 p-4">
      <div className="mx-auto max-w-7xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-4xl font-bold text-white flex items-center gap-2">
            <ChefHat className="h-8 w-8" />
            KDS — {location.toUpperCase()}
          </h1>
          <Button
            size="lg"
            className={`${
              pausedAll
                ? "bg-red-600 hover:bg-red-700"
                : "bg-green-600 hover:bg-green-700"
            }`}
            onClick={handlePauseAll}
          >
            {pausedAll ? "RETOMAR" : "PAUSAR TUDO"}
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence>
            {items.map((item) => (
              <KDSCard
                key={item.id}
                item={item}
                onMarkReady={handleMarkReady}
                onPause={handlePause}
              />
            ))}
          </AnimatePresence>
        </div>

        {items.length === 0 && (
          <div className="flex h-64 items-center justify-center rounded-xl border-2 border-dashed border-gray-600">
            <p className="text-xl text-gray-400">Nenhum pedido pendente</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default KDSDisplay;
```

## 3.2 - useKDSNotifications.ts (Hook para notificações)

```tsx
// src/hooks/useKDSNotifications.ts

import { useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const useKDSNotifications = () => {
  useEffect(() => {
    // Subscription ao Realtime para pedidos prontos
    const channel = supabase
      .channel("order_ready")
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "orders_kds",
        filter: "status=eq.ready",
      })
      .subscribe(async (payload) => {
        if (payload.eventType === "UPDATE") {
          const order = payload.new as any;

          // Checar se todos os itens do pedido estão prontos
          const { data: allItems } = await supabase
            .from("orders_kds")
            .select("*")
            .eq("order_id", order.order_id);

          const allReady = allItems?.every(
            (item) =>
              item.status === "ready" ||
              item.status === "served" ||
              item.status === "cancelled"
          );

          if (allReady) {
            // Notificar garçom
            toast.success(
              `🚀 Pedido #${order.order_id.slice(0, 8)} PRONTO!`,
              {
                duration: 5000,
              }
            );

            // Som (opcional)
            playNotificationSound();

            // Vibração (se suportado)
            if (navigator.vibrate) {
              navigator.vibrate([200, 100, 200]);
            }
          }
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
};

const playNotificationSound = () => {
  const audioContext = new (window.AudioContext ||
    (window as any).webkitAudioContext)();
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();

  oscillator.connect(gain);
  gain.connect(audioContext.destination);

  oscillator.frequency.value = 1000;
  oscillator.type = "sine";

  gain.gain.setValueAtTime(0.3, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(
    0.01,
    audioContext.currentTime + 0.5
  );

  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + 0.5);
};
```

## 3.3 - OrderConfirmation.tsx (Confirmação ao pedido)

```tsx
// src/components/OrderConfirmation.tsx

import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Printer } from "lucide-react";

interface OrderConfirmationProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: Array<{
    id: string;
    menu_item_id: string;
    quantity: number;
    observations: string;
    preparation_location: "kitchen" | "bar" | "counter";
  }>;
  sessionId: string;
}

const OrderConfirmation = ({
  open,
  onOpenChange,
  items,
  sessionId,
}: OrderConfirmationProps) => {
  const [confirming, setConfirming] = useState(false);

  const handleConfirmOrder = async () => {
    setConfirming(true);
    try {
      // 1. Criar pedido na tabela orders
      const { data: orderData, error: orderError } = await supabase
        .from("orders")
        .insert({
          session_id: sessionId,
          status: "received",
          confirmed_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (orderError) throw orderError;

      const orderId = orderData.id;

      // 2. Criar itens no KDS
      const kdsItems = items.map((item) => ({
        order_id: orderId,
        menu_item_id: item.menu_item_id,
        quantity: item.quantity,
        observations: item.observations,
        preparation_location: item.preparation_location,
        status: "pending",
        received_at: new Date().toISOString(),
      }));

      const { error: kdsError } = await supabase
        .from("orders_kds")
        .insert(kdsItems);

      if (kdsError) throw kdsError;

      // 3. Descontar estoque (stock_movements)
      // ... (implementação)

      // 4. Imprimir ticket na cozinha
      await printKitchenTicket(orderId, items);

      toast.success("Pedido confirmado!");
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      toast.error("Erro ao confirmar pedido");
    } finally {
      setConfirming(false);
    }
  };

  const printKitchenTicket = async (orderId: string, items: any[]) => {
    // Implementar impressão térmica
    console.log("Imprimindo ticket:", orderId, items);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Confirmar Pedido</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 max-h-64 overflow-y-auto">
          {items.map((item, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between p-2 border rounded"
            >
              <span className="text-sm">
                {item.quantity}x Item #{item.menu_item_id.slice(0, 8)}
              </span>
              <span className="text-xs text-muted-foreground">
                {item.preparation_location}
              </span>
            </div>
          ))}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={confirming}
          >
            Cancelar
          </Button>
          <Button onClick={handleConfirmOrder} disabled={confirming}>
            <Printer className="h-4 w-4 mr-2" />
            {confirming ? "Confirmando..." : "Confirmar & Imprimir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default OrderConfirmation;
```

---

# PARTE 4: INTEGRAÇÃO COM SESSÕES EXISTENTES

## 4.1 - useKDSIntegration.ts (Hook de integração)

```tsx
// src/hooks/useKDSIntegration.ts

import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Hook que integra o novo KDS com as sessões existentes do Pop9
 */
export const useKDSIntegration = (sessionId: string) => {
  useEffect(() => {
    // Quando uma nova ordem é criada na sessão, sincronizar com KDS
    const syncOrderToKDS = async (orderId: string) => {
      const { data: orderItems } = await supabase
        .from("order_items")
        .select("*")
        .eq("order_id", orderId);

      // Criar entradas correspondentes em orders_kds
      if (orderItems) {
        const kdsItems = orderItems.map((item: any) => ({
          order_id: orderId,
          menu_item_id: item.menu_item_id,
          quantity: item.quantity,
          observations: item.observations,
          preparation_location: item.preparation_location || "kitchen",
          status: "pending",
          received_at: new Date().toISOString(),
        }));

        await supabase.from("orders_kds").insert(kdsItems);
      }
    };

    // Listen para novos pedidos na sessão
    const channel = supabase
      .channel(`session_${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "orders",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          syncOrderToKDS((payload.new as any).id);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);
};
```

---

# PARTE 5: ROTAS & PÁGINAS

## 5.1 - KDSPage.tsx (Página do KDS)

```tsx
// src/pages/KDSPage.tsx

import { useEffect, useState } from "react";
import { useSearchParams, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import KDSDisplay from "@/components/KDSDisplay";
import { useKDSNotifications } from "@/hooks/useKDSNotifications";

const KDSPage = () => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const location = (searchParams.get("location") ||
    "kitchen") as "kitchen" | "bar" | "counter";

  // Ativar notificações
  useKDSNotifications();

  // Verificar se usuário tem permissão
  if (!user) {
    return <Navigate to="/login" />;
  }

  return (
    <div className="bg-gray-900 min-h-screen">
      <KDSDisplay location={location} />
    </div>
  );
};

export default KDSPage;
```

---

# PARTE 6: CONFIGURAÇÕES & EXPORTS

## 6.1 - types.ts (TypeScript types)

```tsx
// src/types/kds.ts

export interface KDSItem {
  id: string;
  order_id: string;
  menu_item_id: string;
  quantity: number;
  observations: string;
  preparation_location: "kitchen" | "bar" | "counter";
  status: "pending" | "preparing" | "ready" | "served" | "cancelled";
  timer_wait_seconds: number;
  timer_prep_seconds: number;
  timer_delivery_seconds: number;
  color: string;
  is_blinking: boolean;
  paused: boolean;
  received_at: string;
  preparation_started_at: string;
  completed_at: string;
  created_at: string;
  updated_at: string;
}

export interface ProductionRecipe {
  id: string;
  name: string;
  output_item_id: string;
  default_yield: number;
  shelf_life_days: number | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface StockMovement {
  id: string;
  item_id: string;
  quantity: number;
  reason:
    | "compra"
    | "producao_entrada"
    | "producao_saida"
    | "venda"
    | "ajuste";
  batch_id: string | null;
  expires_at: string | null;
  created_at: string;
  created_by: string | null;
}
```

---

# PARTE 7: INSTALAÇÃO & DEPLOY

## 7.1 - Passo a passo

```bash
# 1. Copiar migrations SQL para supabase/migrations/
# (todos os arquivos 20260307*.sql)

# 2. Executar migrations
supabase db push

# 3. Copiar arquivos React:
# - src/components/KDSDisplay.tsx
# - src/hooks/useKDSNotifications.ts
# - src/hooks/useKDSIntegration.ts
# - src/pages/KDSPage.tsx
# - src/types/kds.ts
# - src/components/OrderConfirmation.tsx

# 4. Adicionar rota no App.tsx:
# <Route path="/kds" element={<KDSPage />} />

# 5. Deploy no Vercel
git add .
git commit -m "feat: KDS + nova arquitetura de receitas"
git push origin main

# 6. Testar em produção
# pop9-lv5p.vercel.app/kds?location=kitchen
# pop9-lv5p.vercel.app/kds?location=bar
# pop9-lv5p.vercel.app/kds?location=counter
```

---

# PARTE 8: CHECKLIST DE IMPLEMENTAÇÃO

- [ ] Migrations SQL criadas e rodadas no Supabase
- [ ] RPCs testadas (create_recipe, produce_batch, etc)
- [ ] KDSDisplay.tsx importado e funcionando
- [ ] useKDSNotifications hook ativado globalmente
- [ ] OrderConfirmation integrado ao fluxo de pedidos
- [ ] Rota /kds adicionada
- [ ] Testes em produção (kitchen, bar, counter)
- [ ] Impressora térmica integrada (opcional)
- [ ] WhatsApp/SMS para notificação ao garçom (opcional)
- [ ] Relatórios de produção adicionados ao Admin

---

**Pronto!** Tudo concentrado aqui. Qualquer dúvida, é só chamar! 🚀
