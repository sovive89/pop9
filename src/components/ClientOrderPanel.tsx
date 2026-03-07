import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Plus,
  Minus,
  ShoppingCart,
  Trash2,
  Beef,
  Cookie,
  CupSoda,
  Salad,
  User,
  MessageSquare,
  Copy,
  Clock,
  CheckCircle2,
  ChefHat,
  Package,
  CircleMinus,
  CirclePlus,
  Printer,
  Pencil,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { categoryLabels, type MenuCategory, type MenuItem } from "@/data/menu";
import { useMenuItems } from "@/hooks/useMenuItems";
import {
  type ClientOrder,
  type OrderItem,
  type PlacedOrder,
  type IngredientMod,
  getCartTotal,
  getClientTotal,
  getItemUnitPrice,
  formatCurrency,
  statusLabels,
  statusColors,
  type OrderStatus,
} from "@/utils/orders";
import type { ClientInfo } from "@/components/TableSessionPanel";
import { buildClientBillReceipt, printReceipt } from "@/utils/thermal-print";
import ServiceChargeToggle from "@/components/ServiceChargeToggle";
import ReceiptPreviewModal from "@/components/ReceiptPreviewModal";

const MEAT_POINTS = ["Mal passado", "Ao ponto p/ mal", "Ao ponto", "Ao ponto p/ bem", "Bem passado"] as const;

const categoryIcons: Record<MenuCategory, React.ElementType> = {
  burgers: Beef,
  sides: Salad,
  drinks: CupSoda,
  desserts: Cookie,
};

const orderStatusIcons: Record<OrderStatus, React.ElementType> = {
  pending: Clock,
  preparing: ChefHat,
  ready: CheckCircle2,
  delivered: Package,
};

interface Props {
  client: ClientInfo;
  tableId: number;
  order: ClientOrder;
  onUpdateOrder: (order: ClientOrder) => void;
  onPlaceOrder: (cart: OrderItem[]) => void;
  onBack: () => void;
}

type View = "menu" | "cart" | "orders" | "item-detail";

const ClientOrderPanel = ({ client, tableId, order, onUpdateOrder, onPlaceOrder, onBack }: Props) => {
  const { menuItems } = useMenuItems();
  const [activeCategory, setActiveCategory] = useState<MenuCategory>("burgers");
  const [view, setView] = useState<View>("menu");
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [itemObservation, setItemObservation] = useState("");
  const [ingredientMods, setIngredientMods] = useState<IngredientMod[]>([]);
  const [meatPoint, setMeatPoint] = useState<string | null>(null);
  // Index of cart entry being edited (null = adding new)
  const [editingCartIndex, setEditingCartIndex] = useState<number | null>(null);
  // Search
  const [searchQuery, setSearchQuery] = useState("");
  // Preview da conta impressa (tela)
  const [receiptPreviewHtml, setReceiptPreviewHtml] = useState<string | null>(null);

  const categories: MenuCategory[] = ["burgers", "sides", "drinks", "desserts"];

  const isSearching = searchQuery.trim().length > 0;

  const filteredItems = useMemo(() => {
    if (isSearching) {
      const q = searchQuery.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return menuItems.filter((m) => {
        const name = m.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const desc = (m.description ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return name.includes(q) || desc.includes(q);
      });
    }
    return menuItems.filter((m) => m.category === activeCategory);
  }, [menuItems, activeCategory, searchQuery, isSearching]);

  const cartCount = order.cart.length; // each entry is 1 unit
  const cartTotal = getCartTotal(order.cart);
  const clientTotal = getClientTotal(order);

  // Count how many units of a menu item are in cart
  const getItemQty = (menuItemId: string) =>
    order.cart.filter((i) => i.menuItemId === menuItemId).length;

  const handlePlaceOrder = () => {
    if (order.cart.length === 0) return;
    onPlaceOrder(order.cart);
    setView("orders");
  };

  // Open detail to ADD a new unit
  const handleOpenDetail = (item: MenuItem) => {
    setSelectedItem(item);
    setItemObservation("");
    setIngredientMods([]);
    setMeatPoint(null);
    setEditingCartIndex(null);
    setView("item-detail");
  };

  // Open detail to EDIT an existing cart entry
  const handleEditCartEntry = (index: number) => {
    const entry = order.cart[index];
    const menuItem = menuItems.find((m) => m.id === entry.menuItemId);
    if (!menuItem) return;

    setSelectedItem(menuItem);
    setIngredientMods(entry.ingredientMods ?? []);
    // Parse observation to extract meat point
    const obs = entry.observation ?? "";
    const foundPoint = MEAT_POINTS.find((p) => obs.includes(p));
    setMeatPoint(foundPoint ?? null);
    // Remove structured parts from observation to get manual text
    let manualObs = obs;
    if (foundPoint) manualObs = manualObs.replace(foundPoint, "");
    // Remove ingredient mod text
    const removed = (entry.ingredientMods ?? []).filter((m) => m.action === "remove").map((m) => m.name);
    const extras = (entry.ingredientMods ?? []).filter((m) => m.action === "extra").map((m) => m.name);
    if (removed.length) manualObs = manualObs.replace("S/ " + removed.join(", "), "");
    if (extras.length) manualObs = manualObs.replace("C/ extra " + extras.join(", "), "");
    manualObs = manualObs.replace(/\s*\|\s*/g, " ").trim();
    setItemObservation(manualObs);
    setEditingCartIndex(index);
    setView("item-detail");
  };

  const isBurger = selectedItem?.category === "burgers";

  const toggleIngredient = (ingredientName: string, action: "remove") => {
    setIngredientMods((prev) => {
      const existing = prev.find((m) => m.name === ingredientName && m.action === action);
      if (existing) {
        return prev.filter((m) => !(m.name === ingredientName && m.action === action));
      }
      const filtered = prev.filter((m) => m.name !== ingredientName);
      return [...filtered, { name: ingredientName, action }];
    });
  };

  const getExtraCount = (ingredientName: string): number =>
    ingredientMods.filter((m) => m.name === ingredientName && m.action === "extra").length;

  const addExtraIngredient = (ingredientName: string, extraPrice?: number) => {
    setIngredientMods((prev) => [...prev, { name: ingredientName, action: "extra" as const, extraPrice }]);
  };

  const removeExtraIngredient = (ingredientName: string) => {
    setIngredientMods((prev) => {
      const idx = prev.findIndex((m) => m.name === ingredientName && m.action === "extra");
      if (idx === -1) return prev;
      return prev.slice(0, idx).concat(prev.slice(idx + 1));
    });
  };

  const getModState = (ingredientName: string): "remove" | "extra" | null => {
    const removed = ingredientMods.some((m) => m.name === ingredientName && m.action === "remove");
    if (removed) return "remove";
    const count = getExtraCount(ingredientName);
    return count > 0 ? "extra" : null;
  };

  const buildObservationText = (): string => {
    const parts: string[] = [];
    const removed = ingredientMods.filter((m) => m.action === "remove").map((m) => m.name);
    const extraNames = [...new Set(ingredientMods.filter((m) => m.action === "extra").map((m) => m.name))];
    const extraWithQty = extraNames.map((name) => {
      const count = getExtraCount(name);
      return count > 1 ? `${name} (${count}x)` : name;
    });
    if (removed.length) parts.push("S/ " + removed.join(", "));
    if (extraWithQty.length) parts.push("C/ extra " + extraWithQty.join(", "));
    if (meatPoint) parts.push(meatPoint);
    if (itemObservation.trim()) parts.push(itemObservation.trim());
    return parts.join(" | ");
  };

  const handleDuplicateLastOrder = () => {
    if (order.orders.length === 0) return;
    const last = order.orders[order.orders.length - 1];
    onUpdateOrder({ ...order, cart: [...order.cart, ...last.items.map((i) => ({ ...i, quantity: 1 }))] });
    toast.success("Último pedido duplicado no carrinho");
    setView("cart");
  };

  // Add or update cart entry from item-detail
  const handleConfirmItem = () => {
    if (!selectedItem) return;
    const obs = buildObservationText() || undefined;
    const entry: OrderItem = {
      menuItemId: selectedItem.id,
      name: selectedItem.name,
      price: selectedItem.price,
      quantity: 1,
      observation: obs,
      ingredientMods: ingredientMods.length > 0 ? [...ingredientMods] : undefined,
    };

    let newCart: OrderItem[];
    if (editingCartIndex !== null) {
      // Update existing entry
      newCart = order.cart.map((item, idx) => (idx === editingCartIndex ? entry : item));
      toast.success(`${selectedItem.name} atualizado`);
    } else {
      // Add new entry
      newCart = [...order.cart, entry];
      toast.success(`${selectedItem.name} adicionado`);
    }
    onUpdateOrder({ ...order, cart: newCart });
    setView("menu");
  };

  // Remove a cart entry by index
  const handleRemoveCartEntry = (index: number) => {
    const newCart = order.cart.filter((_, idx) => idx !== index);
    onUpdateOrder({ ...order, cart: newCart });
  };

  // Duplicate a cart entry (add another identical unit)
  const handleDuplicateCartEntry = (index: number) => {
    const entry = order.cart[index];
    const newCart = [...order.cart, { ...entry }];
    onUpdateOrder({ ...order, cart: newCart });
    toast.success(`+1 ${entry.name}`);
  };

  const firstName = client.name.split(" ")[0];

  // Build mod summary for cart display
  const getModSummary = (item: OrderItem): string => {
    const parts: string[] = [];
    if (item.ingredientMods) {
      const removed = item.ingredientMods.filter((m) => m.action === "remove").map((m) => m.name);
      const extraNames = [...new Set(item.ingredientMods.filter((m) => m.action === "extra").map((m) => m.name))];
      const extraWithQty = extraNames.map((name) => {
        const count = item.ingredientMods!.filter((m) => m.name === name && m.action === "extra").length;
        return count > 1 ? `${name} (${count}x)` : name;
      });
      if (removed.length) parts.push("S/ " + removed.join(", "));
      if (extraWithQty.length) parts.push("C/ " + extraWithQty.join(", "));
    }
    return parts.join(" · ");
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur-md px-4 py-2.5"
      >
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-muted-foreground hover:text-foreground transition-colors p-1">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/20 shrink-0">
              <User className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{firstName}</p>
              <p className="text-[10px] text-muted-foreground">Mesa {String(tableId).padStart(2, "0")}</p>
            </div>
          </div>
          <Button
            variant={view === "orders" ? "default" : "ghost"}
            size="sm"
            className="relative gap-1 text-xs"
            onClick={() => setView(view === "orders" ? "menu" : "orders")}
          >
            <Clock className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Pedidos</span>
            {order.orders.length > 0 && (
              <span className="ml-0.5 text-[10px] font-bold">({order.orders.length})</span>
            )}
          </Button>
          <Button
            variant={view === "cart" ? "default" : "outline"}
            size="sm"
            className="relative gap-1"
            onClick={() => setView(view === "cart" ? "menu" : "cart")}
          >
            <ShoppingCart className="h-4 w-4" />
            {cartCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </Button>
        </div>
      </motion.header>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar — categories */}
        {(view === "menu" || view === "item-detail") && (
          <motion.aside
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="w-16 sm:w-20 border-r border-border bg-card/50 flex flex-col items-center py-3 gap-1 shrink-0 overflow-y-auto"
          >
            {categories.map((cat) => {
              const Icon = categoryIcons[cat];
              const isActive = cat === activeCategory;
              return (
                <button
                  key={cat}
                  onClick={() => {
                    setActiveCategory(cat);
                    if (view === "item-detail") setView("menu");
                  }}
                  className={`flex flex-col items-center gap-1 rounded-xl px-2 py-2.5 w-full transition-colors ${
                    isActive
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-[9px] font-medium leading-tight text-center">
                    {categoryLabels[cat]}
                  </span>
                </button>
              );
            })}
          </motion.aside>
        )}

        {/* Main content */}
        <div className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            {view === "item-detail" && selectedItem ? (
              /* Item detail */
              <motion.div
                key="detail"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="p-4 space-y-4"
              >
                <button
                  onClick={() => setView(editingCartIndex !== null ? "cart" : "menu")}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  {editingCartIndex !== null ? "Voltar ao carrinho" : "Voltar ao cardápio"}
                </button>

                <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-2xl text-foreground" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                        {selectedItem.name}
                      </h3>
                      {editingCartIndex !== null && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary font-medium">
                          Editando
                        </span>
                      )}
                    </div>
                    {selectedItem.description && (
                      <p className="text-sm text-muted-foreground mt-1">{selectedItem.description}</p>
                    )}
                    <p className="text-xl font-bold text-primary mt-2">{formatCurrency(selectedItem.price)}</p>
                  </div>

                  {/* Ingredients +/- */}
                  {selectedItem.ingredients && selectedItem.ingredients.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ingredientes</span>
                      <div className="space-y-1">
                        {selectedItem.ingredients.map((ing) => {
                          const modState = getModState(ing.name);
                          const extraCount = getExtraCount(ing.name);
                          return (
                            <div key={ing.name} className="flex items-center gap-2 py-1.5 px-2 rounded-lg bg-secondary/30">
                              <span className={`flex-1 text-sm ${modState === "remove" ? "line-through text-muted-foreground/50" : modState === "extra" ? "text-primary font-medium" : "text-foreground"}`}>
                                {ing.name}
                                {ing.extraPrice != null && (
                                  <span className="text-xs text-muted-foreground ml-1">(+{formatCurrency(ing.extraPrice)}/un)</span>
                                )}
                                {extraCount > 0 && (
                                  <span className="text-xs text-primary ml-1">· {extraCount}x</span>
                                )}
                              </span>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => toggleIngredient(ing.name, "remove")}
                                  className={`h-7 w-7 rounded-md flex items-center justify-center transition-colors ${
                                    modState === "remove"
                                      ? "bg-destructive/20 text-destructive"
                                      : "border border-border text-muted-foreground hover:text-foreground hover:border-destructive/50"
                                  }`}
                                  title="Retirar"
                                >
                                  <CircleMinus className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => removeExtraIngredient(ing.name)}
                                  disabled={extraCount === 0}
                                  className="h-7 w-7 rounded-md flex items-center justify-center transition-colors border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 disabled:opacity-40 disabled:pointer-events-none"
                                  title="Menos extra"
                                >
                                  <Minus className="h-4 w-4" />
                                </button>
                                <span className="min-w-[1.25rem] text-center text-sm font-medium text-foreground">
                                  {extraCount}
                                </span>
                                <button
                                  onClick={() => addExtraIngredient(ing.name, ing.extraPrice)}
                                  className="h-7 w-7 rounded-md flex items-center justify-center transition-colors border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 hover:bg-primary/10"
                                  title="Mais extra"
                                >
                                  <Plus className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Meat doneness — only for burgers */}
                  {isBurger && (
                    <div className="space-y-1.5">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ponto da Carne</span>
                      <div className="flex flex-wrap gap-1.5">
                        {MEAT_POINTS.map((point) => (
                          <button
                            key={point}
                            onClick={() => setMeatPoint(meatPoint === point ? null : point)}
                            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                              meatPoint === point
                                ? "bg-primary text-primary-foreground border-primary"
                                : "border-border text-muted-foreground hover:text-foreground hover:border-primary/50"
                            }`}
                          >
                            {point}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Observation */}
                  <div>
                    <label className="flex items-center justify-between text-sm font-medium text-muted-foreground mb-1.5">
                      <span className="flex items-center gap-1.5">
                        <MessageSquare className="h-3.5 w-3.5" />
                        Observação
                      </span>
                      <span className="text-[10px]">{itemObservation.length}/50</span>
                    </label>
                    <textarea
                      value={itemObservation}
                      onChange={(e) => setItemObservation(e.target.value.slice(0, 50))}
                      placeholder="Ex: caprichar no molho..."
                      maxLength={50}
                      rows={2}
                      className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                    />
                  </div>

                  {/* Confirm button */}
                  {(() => {
                    const extrasTotal = ingredientMods
                      .filter((m) => m.action === "extra" && m.extraPrice)
                      .reduce((s, m) => s + (m.extraPrice ?? 0), 0);
                    const unitPrice = selectedItem.price + extrasTotal;
                    return (
                      <Button className="w-full gap-2" onClick={handleConfirmItem}>
                        {editingCartIndex !== null ? (
                          <>
                            <Pencil className="h-4 w-4" />
                            Salvar alterações — {formatCurrency(unitPrice)}
                          </>
                        ) : (
                          <>
                            <Plus className="h-4 w-4" />
                            Adicionar 1 unidade — {formatCurrency(unitPrice)}
                          </>
                        )}
                      </Button>
                    );
                  })()}
                </div>
              </motion.div>
            ) : view === "cart" ? (
              /* Cart view — each entry is an individual unit */
              <motion.div
                key="cart"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-2xl text-foreground" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                    CARRINHO
                  </h3>
                  <div className="flex gap-2">
                    {order.orders.length > 0 && (
                      <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={handleDuplicateLastOrder}>
                        <Copy className="h-3.5 w-3.5" />
                        Repetir último
                      </Button>
                    )}
                  </div>
                </div>

                {order.cart.length === 0 ? (
                  <div className="text-center py-12 space-y-2">
                    <ShoppingCart className="h-10 w-10 text-muted-foreground/30 mx-auto" />
                    <p className="text-sm text-muted-foreground">Carrinho vazio</p>
                    <Button variant="outline" size="sm" onClick={() => setView("menu")}>
                      Ver cardápio
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {order.cart.map((item, index) => {
                      const unitPrice = getItemUnitPrice(item);
                      const modSummary = getModSummary(item);
                      return (
                        <div key={index} className="rounded-xl border border-border bg-card p-3">
                          <div className="flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                              {modSummary && (
                                <p className="text-[10px] text-primary/80 mt-0.5 truncate">
                                  {modSummary}
                                </p>
                              )}
                              {item.observation && (
                                <p className="text-[10px] text-muted-foreground/70 mt-0.5 italic truncate">
                                  📝 {item.observation}
                                </p>
                              )}
                            </div>
                            <span className="text-sm font-semibold text-primary shrink-0">
                              {formatCurrency(unitPrice)}
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleEditCartEntry(index)}
                                className="h-7 w-7 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary transition-colors"
                                title="Editar"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                              <button
                                onClick={() => handleDuplicateCartEntry(index)}
                                className="h-7 w-7 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary transition-colors"
                                title="Adicionar +1 igual"
                              >
                                <Copy className="h-3 w-3" />
                              </button>
                              <button
                                onClick={() => handleRemoveCartEntry(index)}
                                className="h-7 w-7 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-destructive hover:border-destructive transition-colors"
                                title="Remover"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            ) : view === "orders" ? (
              /* Orders history */
              <motion.div
                key="orders"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="p-4 space-y-4"
              >
                <h3 className="text-2xl text-foreground" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                  MEUS PEDIDOS
                </h3>

                {order.orders.length === 0 ? (
                  <div className="text-center py-12 space-y-2">
                    <Package className="h-10 w-10 text-muted-foreground/30 mx-auto" />
                    <p className="text-sm text-muted-foreground">Nenhum pedido realizado</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {[...order.orders].reverse().map((placedOrder) => {
                      const StatusIcon = orderStatusIcons[placedOrder.status];
                      const orderTotal = placedOrder.items.reduce((s, i) => s + getItemUnitPrice(i) * i.quantity, 0);
                      return (
                        <div key={placedOrder.id} className="rounded-xl border border-border bg-card overflow-hidden">
                          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-secondary/30">
                            <StatusIcon className="h-4 w-4 shrink-0" />
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${statusColors[placedOrder.status]}`}>
                              {statusLabels[placedOrder.status]}
                            </span>
                            <span className="text-[10px] text-muted-foreground ml-auto">
                              {placedOrder.placedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                          <div className="px-4 py-2 space-y-1.5">
                            {placedOrder.items.map((item, idx) => (
                              <div key={idx} className="flex items-center justify-between text-sm">
                                <span className="text-foreground">
                                  {item.quantity}× {item.name}
                                </span>
                                <span className="text-muted-foreground">{formatCurrency(getItemUnitPrice(item) * item.quantity)}</span>
                              </div>
                            ))}
                          </div>
                          <div className="px-4 py-2 border-t border-border flex justify-between">
                            <span className="text-xs text-muted-foreground">Subtotal</span>
                            <span className="text-sm font-semibold text-primary">{formatCurrency(orderTotal)}</span>
                          </div>
                        </div>
                      );
                    })}

                    {/* Total geral */}
                    <div className="rounded-xl border-2 border-primary/30 bg-primary/5 px-4 py-3 flex justify-between items-center">
                      <span className="text-sm font-bold text-foreground">Total consumido</span>
                      <span className="text-lg font-bold text-primary">{formatCurrency(clientTotal)}</span>
                    </div>

                    {/* Service charge toggle + Print */}
                    <ServiceChargeToggle
                      total={clientTotal}
                      onPrint={(withCharge) => {
                        const html = buildClientBillReceipt(tableId, client, order, withCharge);
                        printReceipt(html);
                        setReceiptPreviewHtml(html);
                      }}
                      label="Imprimir Conta Individual"
                    />
                  </div>
                )}
              </motion.div>
            ) : (
              /* Menu view — compact iFood-style cards */
              <motion.div
                key="menu"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="p-3 sm:p-4 space-y-3"
              >
                {/* Search bar */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar no cardápio..."
                    className="w-full h-10 rounded-xl border border-border bg-muted pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <h3
                  className="text-xl text-foreground"
                  style={{ fontFamily: "'Bebas Neue', sans-serif" }}
                >
                  {isSearching
                    ? `Resultados (${filteredItems.length})`
                    : categoryLabels[activeCategory]}
                </h3>

                {filteredItems.length === 0 ? (
                  <div className="text-center py-8 space-y-2">
                    <Search className="h-8 w-8 text-muted-foreground/30 mx-auto" />
                    <p className="text-sm text-muted-foreground">Nenhum item encontrado</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {filteredItems.map((item) => {
                      const qty = getItemQty(item.id);
                      return (
                        <motion.button
                          key={item.id}
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          whileHover={{ scale: 1.03 }}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => handleOpenDetail(item)}
                          className={`relative text-left rounded-xl border-2 p-3 transition-colors ${
                            qty > 0 ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/30"
                          }`}
                        >
                          {isSearching && (
                            <span className="text-[9px] text-muted-foreground/70 uppercase tracking-wider">
                              {categoryLabels[item.category]}
                            </span>
                          )}
                          <p className="text-xs font-semibold text-foreground leading-tight line-clamp-2">
                            {item.name}
                          </p>
                          <p className="text-sm font-bold text-primary mt-1.5">
                            {formatCurrency(item.price)}
                          </p>
                          {qty > 0 && (
                            <span className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                              {qty}
                            </span>
                          )}
                        </motion.button>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Bottom bar — cart summary */}
      {cartTotal > 0 && view !== "cart" && (
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="sticky bottom-0 border-t border-border bg-card/95 backdrop-blur-md px-4 py-2.5"
        >
          <button
            onClick={() => setView("cart")}
            className="w-full flex items-center justify-between rounded-xl bg-primary px-4 py-3 text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" />
              <span className="text-sm font-medium">{cartCount} {cartCount === 1 ? "item" : "itens"}</span>
            </div>
            <span className="font-bold">{formatCurrency(cartTotal)}</span>
          </button>
        </motion.div>
      )}

      {/* Bottom bar — place order (in cart view) */}
      {view === "cart" && order.cart.length > 0 && (
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="sticky bottom-0 border-t border-border bg-card/95 backdrop-blur-md px-4 py-3"
        >
          <Button className="w-full gap-2 h-12 text-base" onClick={handlePlaceOrder}>
            <ShoppingCart className="h-5 w-5" />
            Enviar Pedido — {formatCurrency(cartTotal)}
          </Button>
        </motion.div>
      )}

      <ReceiptPreviewModal
        receiptHtml={receiptPreviewHtml}
        onClose={() => setReceiptPreviewHtml(null)}
        title="Conta Individual"
      />
    </div>
  );
};

export default ClientOrderPanel;
