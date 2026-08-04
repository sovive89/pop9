import { useState, useMemo } from "react";
import {
  Flame,
  Plus,
  Package,
  Factory,
  Truck,
  AlertTriangle,
  Tag,
  Trash2,
  Search,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { useStockData, ProductionRecipeInput } from "@/hooks/useStockData";

type SubView = "insumos" | "producao" | "fornecedores";

const STATUS_LABELS: Record<string, string> = {
  valido: "Válido",
  vence_hoje: "Vence hoje",
  vencido: "Vencido",
  sem_validade: "Sem validade",
};
const STATUS_COLORS: Record<string, string> = {
  valido: "bg-success/15 text-success-foreground border-success/30",
  vence_hoje: "bg-yellow-500/15 text-yellow-600 border-yellow-500/30",
  vencido: "bg-destructive/15 text-destructive border-destructive/30",
  sem_validade: "bg-muted text-muted-foreground border-border",
};

const StockTab = () => {
  const {
    rawMaterials,
    suppliers,
    recipes,
    labels,
    alerts,
    loading,
    createRawMaterial,
    registerPurchase,
    createSupplier,
    createRecipe,
    produceBatch,
  } = useStockData();

  const [view, setView] = useState<SubView>("insumos");
  const [search, setSearch] = useState("");

  // Dialog state
  const [newMaterialOpen, setNewMaterialOpen] = useState(false);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [purchaseTarget, setPurchaseTarget] = useState<string | null>(null);
  const [newSupplierOpen, setNewSupplierOpen] = useState(false);
  const [newRecipeOpen, setNewRecipeOpen] = useState(false);
  const [produceOpen, setProduceOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // ── Forms: novo insumo ──
  const [matName, setMatName] = useState("");
  const [matUnit, setMatUnit] = useState("");
  const [matIsProduced, setMatIsProduced] = useState(false);
  const [matMinStock, setMatMinStock] = useState("");

  // ── Forms: entrada de compra ──
  const [pQuantity, setPQuantity] = useState("");
  const [pUnitCost, setPUnitCost] = useState("");
  const [pSupplierId, setPSupplierId] = useState<string>("");
  const [pIsBox, setPIsBox] = useState(false);
  const [pBoxCount, setPBoxCount] = useState("");
  const [pUnitsPerBox, setPUnitsPerBox] = useState("");

  // ── Forms: novo fornecedor ──
  const [supName, setSupName] = useState("");
  const [supDocument, setSupDocument] = useState("");
  const [supPhone, setSupPhone] = useState("");
  const [supEmail, setSupEmail] = useState("");

  // ── Forms: nova receita de produção ──
  const [recName, setRecName] = useState("");
  const [recOutputId, setRecOutputId] = useState<string>("");
  const [recOutputQty, setRecOutputQty] = useState("");
  const [recShelfDays, setRecShelfDays] = useState("");
  const [recInputs, setRecInputs] = useState<ProductionRecipeInput[]>([{ rawMaterialId: "", quantity: 0 }]);

  // ── Forms: produzir lote ──
  const [prodRecipeId, setProdRecipeId] = useState<string>("");
  const [prodQuantity, setProdQuantity] = useState("");
  const [prodNotes, setProdNotes] = useState("");
  const [prodInputs, setProdInputs] = useState<{ rawMaterialId: string; quantityUsed: number }[]>([]);

  const materialsById = useMemo(
    () => Object.fromEntries(rawMaterials.map((m) => [m.id, m])),
    [rawMaterials]
  );

  const filteredMaterials = rawMaterials.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase())
  );

  const resetMaterialForm = () => {
    setMatName("");
    setMatUnit("");
    setMatIsProduced(false);
    setMatMinStock("");
  };

  const resetPurchaseForm = () => {
    setPQuantity("");
    setPUnitCost("");
    setPSupplierId("");
    setPIsBox(false);
    setPBoxCount("");
    setPUnitsPerBox("");
    setPurchaseTarget(null);
  };

  const resetSupplierForm = () => {
    setSupName("");
    setSupDocument("");
    setSupPhone("");
    setSupEmail("");
  };

  const resetRecipeForm = () => {
    setRecName("");
    setRecOutputId("");
    setRecOutputQty("");
    setRecShelfDays("");
    setRecInputs([{ rawMaterialId: "", quantity: 0 }]);
  };

  const resetProduceForm = () => {
    setProdRecipeId("");
    setProdQuantity("");
    setProdNotes("");
    setProdInputs([]);
  };

  const handleCreateMaterial = async () => {
    if (!matName.trim() || !matUnit.trim()) return;
    setSaving(true);
    const ok = await createRawMaterial({
      name: matName.trim(),
      unit: matUnit.trim(),
      isProduced: matIsProduced,
      minStock: Number(matMinStock) || 0,
    });
    setSaving(false);
    if (ok) {
      setNewMaterialOpen(false);
      resetMaterialForm();
    }
  };

  const openPurchase = (rawMaterialId: string) => {
    setPurchaseTarget(rawMaterialId);
    setPurchaseOpen(true);
  };

  const handleRegisterPurchase = async () => {
    if (!purchaseTarget || !pQuantity) return;
    setSaving(true);
    const ok = await registerPurchase({
      rawMaterialId: purchaseTarget,
      quantity: Number(pQuantity),
      unitCost: pUnitCost ? Number(pUnitCost) : null,
      supplierId: pSupplierId || null,
      boxCount: pIsBox ? Number(pBoxCount) : undefined,
      unitsPerBox: pIsBox ? Number(pUnitsPerBox) : undefined,
    });
    setSaving(false);
    if (ok) {
      setPurchaseOpen(false);
      resetPurchaseForm();
    }
  };

  const handleCreateSupplier = async () => {
    if (!supName.trim()) return;
    setSaving(true);
    const ok = await createSupplier({
      name: supName.trim(),
      document: supDocument.trim(),
      phone: supPhone.trim(),
      email: supEmail.trim(),
    });
    setSaving(false);
    if (ok) {
      setNewSupplierOpen(false);
      resetSupplierForm();
    }
  };

  const updateRecInput = (idx: number, patch: Partial<ProductionRecipeInput>) => {
    setRecInputs((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const handleCreateRecipe = async () => {
    if (!recName.trim() || !recOutputId || !recOutputQty) return;
    setSaving(true);
    const ok = await createRecipe({
      name: recName.trim(),
      outputRawMaterialId: recOutputId,
      outputQuantity: Number(recOutputQty),
      shelfLifeDays: recShelfDays ? Number(recShelfDays) : null,
      inputs: recInputs.filter((i) => i.rawMaterialId && i.quantity > 0),
    });
    setSaving(false);
    if (ok) {
      setNewRecipeOpen(false);
      resetRecipeForm();
    }
  };

  const openProduce = (recipeId: string) => {
    const recipe = recipes.find((r) => r.id === recipeId);
    setProdRecipeId(recipeId);
    setProdQuantity(recipe ? String(recipe.outputQuantity) : "");
    setProdInputs(recipe ? recipe.inputs.map((i) => ({ rawMaterialId: i.rawMaterialId, quantityUsed: i.quantity })) : []);
    setProduceOpen(true);
  };

  const handleProduceBatch = async () => {
    if (!prodRecipeId || !prodQuantity) return;
    setSaving(true);
    const ok = await produceBatch({
      recipeId: prodRecipeId,
      quantityProduced: Number(prodQuantity),
      notes: prodNotes,
      inputsUsed: prodInputs.filter((i) => i.rawMaterialId && i.quantityUsed > 0),
    });
    setSaving(false);
    if (ok) {
      setProduceOpen(false);
      resetProduceForm();
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Flame className="h-6 w-6 animate-pulse text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Alerta de estoque baixo */}
      {alerts.length > 0 && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3">
          <div className="flex items-center gap-2 text-destructive text-sm font-medium mb-2">
            <AlertTriangle className="h-4 w-4" />
            {alerts.length} insumo{alerts.length > 1 ? "s" : ""} no estoque mínimo ou abaixo
          </div>
          <div className="flex flex-wrap gap-2">
            {alerts.map((a) => (
              <Badge key={a.id} variant="outline" className="border-destructive/40 text-destructive">
                {a.name}: {a.currentStock} {a.unit} (mín. {a.minStock})
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Sub-navegação */}
      <div className="flex gap-1 rounded-xl border border-border bg-muted/30 p-1">
        {[
          { key: "insumos" as const, label: "Insumos", icon: Package },
          { key: "producao" as const, label: "Produção", icon: Factory },
          { key: "fornecedores" as const, label: "Fornecedores", icon: Truck },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs sm:text-sm font-medium transition-colors ${
              view === key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ── INSUMOS ── */}
      {view === "insumos" && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar insumo..."
                className="h-10 pl-9"
              />
            </div>
            <Button onClick={() => setNewMaterialOpen(true)} size="icon" className="h-10 w-10 shrink-0">
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {filteredMaterials.map((m) => {
            const low = m.currentStock <= m.minStock;
            return (
              <div key={m.id} className="rounded-xl border border-border bg-card p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-foreground flex items-center gap-2">
                      {m.name}
                      {m.isProduced && (
                        <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">
                          produzido
                        </Badge>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Custo médio: R$ {m.averageCost.toFixed(2)} / {m.unit}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => openPurchase(m.id)}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Entrada
                  </Button>
                </div>
                <div className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                  low ? "bg-destructive/10 text-destructive" : "bg-muted/50 text-foreground"
                }`}>
                  <span>
                    Estoque: <strong>{m.currentStock}</strong> {m.unit}
                  </span>
                  <span className="text-xs opacity-80">mín. {m.minStock} {m.unit}</span>
                </div>
              </div>
            );
          })}
          {filteredMaterials.length === 0 && (
            <p className="text-center text-muted-foreground py-8">Nenhum insumo cadastrado</p>
          )}
        </div>
      )}

      {/* ── PRODUÇÃO ── */}
      {view === "producao" && (
        <div className="space-y-5">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-foreground">Receitas de produção</h3>
              <Button size="sm" variant="outline" onClick={() => setNewRecipeOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Nova receita
              </Button>
            </div>
            <div className="space-y-2">
              {recipes.map((r) => (
                <div key={r.id} className="rounded-xl border border-border bg-card p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-foreground">{r.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Rende {r.outputQuantity} {materialsById[r.outputRawMaterialId]?.unit ?? ""} de{" "}
                      {materialsById[r.outputRawMaterialId]?.name ?? "?"}
                      {r.shelfLifeDays ? ` · validade ${r.shelfLifeDays}d` : ""}
                    </p>
                  </div>
                  <Button size="sm" onClick={() => openProduce(r.id)}>
                    <Factory className="h-3.5 w-3.5 mr-1" /> Produzir
                  </Button>
                </div>
              ))}
              {recipes.length === 0 && (
                <p className="text-center text-muted-foreground py-6 text-sm">Nenhuma receita cadastrada</p>
              )}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5">
              <Tag className="h-4 w-4" /> Etiquetas de lotes produzidos
            </h3>
            <div className="space-y-2">
              {labels.map((l) => (
                <div key={l.batchId} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-medium text-foreground">{l.productName}</p>
                    <Badge variant="outline" className={STATUS_COLORS[l.statusValidade]}>
                      {STATUS_LABELS[l.statusValidade]}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Lote {l.batchCode} · {l.quantityProduced} {l.unit} · produzido em{" "}
                    {new Date(l.producedAt).toLocaleDateString("pt-BR")}
                    {l.expiresAt && ` · válido até ${new Date(l.expiresAt).toLocaleDateString("pt-BR")}`}
                  </p>
                </div>
              ))}
              {labels.length === 0 && (
                <p className="text-center text-muted-foreground py-6 text-sm">Nenhum lote produzido ainda</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── FORNECEDORES ── */}
      {view === "fornecedores" && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button onClick={() => setNewSupplierOpen(true)} size="sm">
              <Plus className="h-3.5 w-3.5 mr-1" /> Novo fornecedor
            </Button>
          </div>
          {suppliers.map((s) => (
            <div key={s.id} className="rounded-xl border border-border bg-card p-4">
              <p className="font-medium text-foreground">{s.name}</p>
              <p className="text-xs text-muted-foreground">
                {[s.document, s.phone, s.email].filter(Boolean).join(" · ") || "Sem contato registrado"}
              </p>
            </div>
          ))}
          {suppliers.length === 0 && (
            <p className="text-center text-muted-foreground py-8">Nenhum fornecedor cadastrado</p>
          )}
        </div>
      )}

      {/* ── DIALOG: novo insumo ── */}
      <Dialog open={newMaterialOpen} onOpenChange={(o) => { setNewMaterialOpen(o); if (!o) resetMaterialForm(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Insumo</DialogTitle>
            <DialogDescription>
              Cadastre um insumo bruto (comprado) ou um item que só existe depois de produzido internamente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Nome</Label>
              <Input value={matName} onChange={(e) => setMatName(e.target.value)} placeholder="Ex: Carne bovina" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Unidade de medida</Label>
              <Input value={matUnit} onChange={(e) => setMatUnit(e.target.value)} placeholder="kg, un, l, porção..." />
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Estoque mínimo (para alerta)</Label>
              <Input type="number" value={matMinStock} onChange={(e) => setMatMinStock(e.target.value)} placeholder="0" />
            </div>
            <button
              type="button"
              onClick={() => setMatIsProduced((v) => !v)}
              className={`w-full flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                matIsProduced ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground"
              }`}
            >
              <Factory className="h-4 w-4" />
              Este item só existe depois de uma produção interna
            </button>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setNewMaterialOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleCreateMaterial} disabled={saving || !matName.trim() || !matUnit.trim()}>
              {saving ? "Aguarde..." : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── DIALOG: entrada de compra ── */}
      <Dialog open={purchaseOpen} onOpenChange={(o) => { setPurchaseOpen(o); if (!o) resetPurchaseForm(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar Entrada</DialogTitle>
            <DialogDescription>
              {purchaseTarget && `Compra de ${materialsById[purchaseTarget]?.name}. Toda entrada fica salva no histórico.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <button
              type="button"
              onClick={() => setPIsBox((v) => !v)}
              className={`w-full flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                pIsBox ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground"
              }`}
            >
              <Package className="h-4 w-4" />
              Comprado em caixa fechada (várias unidades)
            </button>

            {pIsBox ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Nº de caixas</Label>
                  <Input
                    type="number"
                    value={pBoxCount}
                    onChange={(e) => {
                      setPBoxCount(e.target.value);
                      const total = Number(e.target.value || 0) * Number(pUnitsPerBox || 0);
                      setPQuantity(total ? String(total) : "");
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Unidades por caixa</Label>
                  <Input
                    type="number"
                    value={pUnitsPerBox}
                    onChange={(e) => {
                      setPUnitsPerBox(e.target.value);
                      const total = Number(pBoxCount || 0) * Number(e.target.value || 0);
                      setPQuantity(total ? String(total) : "");
                    }}
                  />
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">
                Quantidade total {purchaseTarget && `(${materialsById[purchaseTarget]?.unit})`}
              </Label>
              <Input type="number" value={pQuantity} onChange={(e) => setPQuantity(e.target.value)} disabled={pIsBox} />
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Preço pago (por unidade, opcional)</Label>
              <Input type="number" step="0.01" value={pUnitCost} onChange={(e) => setPUnitCost(e.target.value)} placeholder="R$" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Fornecedor (opcional)</Label>
              <Select value={pSupplierId} onValueChange={setPSupplierId}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPurchaseOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleRegisterPurchase} disabled={saving || !pQuantity}>
              {saving ? "Aguarde..." : "Registrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── DIALOG: novo fornecedor ── */}
      <Dialog open={newSupplierOpen} onOpenChange={(o) => { setNewSupplierOpen(o); if (!o) resetSupplierForm(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Fornecedor</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Nome</Label>
              <Input value={supName} onChange={(e) => setSupName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">CNPJ/CPF</Label>
              <Input value={supDocument} onChange={(e) => setSupDocument(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Telefone</Label>
              <Input value={supPhone} onChange={(e) => setSupPhone(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">E-mail</Label>
              <Input value={supEmail} onChange={(e) => setSupEmail(e.target.value)} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setNewSupplierOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleCreateSupplier} disabled={saving || !supName.trim()}>
              {saving ? "Aguarde..." : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── DIALOG: nova receita ── */}
      <Dialog open={newRecipeOpen} onOpenChange={(o) => { setNewRecipeOpen(o); if (!o) resetRecipeForm(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova Receita de Produção</DialogTitle>
            <DialogDescription>Defina o porcionamento: quais insumos entram e o que sai.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Nome da receita</Label>
              <Input value={recName} onChange={(e) => setRecName(e.target.value)} placeholder="Ex: Porcionamento hambúrguer 100g" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Item produzido (saída)</Label>
                <Select value={recOutputId} onValueChange={setRecOutputId}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {rawMaterials.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Rendimento padrão</Label>
                <Input type="number" value={recOutputQty} onChange={(e) => setRecOutputQty(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Validade padrão (dias, opcional)</Label>
              <Input type="number" value={recShelfDays} onChange={(e) => setRecShelfDays(e.target.value)} placeholder="Ex: 3" />
            </div>

            <div className="space-y-2 border-t border-border pt-3">
              <Label className="text-sm text-muted-foreground">Insumos consumidos por lote</Label>
              {recInputs.map((inp, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <Select value={inp.rawMaterialId} onValueChange={(v) => updateRecInput(idx, { rawMaterialId: v })}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="Insumo..." /></SelectTrigger>
                    <SelectContent>
                      {rawMaterials.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    className="w-24"
                    value={inp.quantity || ""}
                    onChange={(e) => updateRecInput(idx, { quantity: Number(e.target.value) })}
                    placeholder="Qtd"
                  />
                  <button
                    type="button"
                    onClick={() => setRecInputs((prev) => prev.filter((_, i) => i !== idx))}
                    className="p-2 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRecInputs((prev) => [...prev, { rawMaterialId: "", quantity: 0 }])}
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar insumo
              </Button>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setNewRecipeOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleCreateRecipe} disabled={saving || !recName.trim() || !recOutputId || !recOutputQty}>
              {saving ? "Aguarde..." : "Criar receita"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── DIALOG: produzir lote ── */}
      <Dialog open={produceOpen} onOpenChange={(o) => { setProduceOpen(o); if (!o) resetProduceForm(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Produzir Lote</DialogTitle>
            <DialogDescription>
              Ao confirmar, gera etiqueta automaticamente (código + validade) e credita o item produzido no estoque.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
            {(() => {
              const activeRecipe = recipes.find((r) => r.id === prodRecipeId);
              const outputMaterial = activeRecipe ? materialsById[activeRecipe.outputRawMaterialId] : undefined;
              return (
                <div className="rounded-lg border border-primary/30 bg-primary/10 p-3">
                  <p className="text-xs text-muted-foreground">Item produzido (crédito no estoque)</p>
                  <p className="font-semibold text-foreground">
                    {outputMaterial?.name ?? "?"}
                    {outputMaterial?.unit ? ` · ${outputMaterial.unit}` : ""}
                  </p>
                  {activeRecipe && (
                    <p className="text-xs text-muted-foreground mt-0.5">Receita: {activeRecipe.name}</p>
                  )}
                </div>
              );
            })()}
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">
                Quantidade produzida (real)
                {(() => {
                  const activeRecipe = recipes.find((r) => r.id === prodRecipeId);
                  const outputMaterial = activeRecipe ? materialsById[activeRecipe.outputRawMaterialId] : undefined;
                  return outputMaterial?.unit ? ` (${outputMaterial.unit})` : "";
                })()}
              </Label>
              <Input type="number" value={prodQuantity} onChange={(e) => setProdQuantity(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Insumos consumidos (ajuste se necessário)</Label>
              {prodInputs.map((inp, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <span className="flex-1 text-sm text-foreground">
                    {materialsById[inp.rawMaterialId]?.name ?? "?"}
                  </span>
                  <Input
                    type="number"
                    className="w-24"
                    value={inp.quantityUsed || ""}
                    onChange={(e) =>
                      setProdInputs((prev) =>
                        prev.map((p, i) => (i === idx ? { ...p, quantityUsed: Number(e.target.value) } : p))
                      )
                    }
                  />
                  <span className="text-xs text-muted-foreground w-8">{materialsById[inp.rawMaterialId]?.unit}</span>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Observações (opcional)</Label>
              <Input value={prodNotes} onChange={(e) => setProdNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setProduceOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleProduceBatch} disabled={saving || !prodQuantity}>
              {saving ? "Aguarde..." : "Confirmar produção"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StockTab;
