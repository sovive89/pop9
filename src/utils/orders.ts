export interface IngredientMod {
  name: string;
  action: "remove" | "extra";
  extraPrice?: number;
}

export interface OrderItem {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  observation?: string;
  ingredientMods?: IngredientMod[];
}

export type OrderStatus = "pending" | "preparing" | "ready" | "delivered";

export type OrderOrigin = "mesa" | "pwa";

export interface PlacedOrder {
  id: string;
  items: OrderItem[];
  status: OrderStatus;
  placedAt: Date;
  origin?: OrderOrigin;
}

export interface ClientOrder {
  clientId: string;
  cart: OrderItem[];
  orders: PlacedOrder[];
}

export const statusLabels: Record<OrderStatus, string> = {
  pending: "Pendente",
  preparing: "Preparando",
  ready: "Pronto",
  delivered: "Entregue",
};

export const statusColors: Record<OrderStatus, string> = {
  pending: "bg-warning/20 text-warning-foreground border-warning/40",
  preparing: "bg-primary/15 text-primary border-primary/40",
  ready: "bg-success/15 text-success-foreground border-success/40",
  delivered: "bg-muted text-muted-foreground border-border",
};

export const getItemExtrasTotal = (item: OrderItem): number =>
  (item.ingredientMods ?? [])
    .filter((m) => m.action === "extra" && m.extraPrice)
    .reduce((sum, m) => sum + (m.extraPrice ?? 0), 0);

export const getItemUnitPrice = (item: OrderItem): number =>
  item.price + getItemExtrasTotal(item);

export const getCartTotal = (cart: OrderItem[]): number =>
  cart.reduce((sum, item) => sum + getItemUnitPrice(item) * item.quantity, 0);

export const getClientTotal = (order: ClientOrder): number =>
  order.orders.reduce(
    (sum, o) => sum + o.items.reduce((s, i) => s + getItemUnitPrice(i) * i.quantity, 0),
    0
  );

export const getTableTotal = (orders: ClientOrder[]): number =>
  orders.reduce((sum, order) => sum + getClientTotal(order), 0);

export const formatCurrency = (value: number): string =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
