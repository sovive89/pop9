import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Lote, RawMaterial } from "@/hooks/useStockData";

type UnitOption = { id: string; name: string };
type Candidate = { id: string; name: string; unit: string; tipo: string };

interface Props {
  open: boolean;
  lot: Lote | null;
  sourceMaterial: RawMaterial | undefined;
  units: UnitOption[];
  sourceUnitId: string | null;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: { lotId: string; targetUnitId: string; targetRawMaterialId: string; quantity: number }) => Promise<boolean>;
}

const normalized = (value: string) => value.trim().toLocaleLowerCase("pt-BR");

export default function StockTransferDialog({ open, lot, sourceMaterial, units, sourceUnitId, busy, onOpenChange, onSubmit }: Props) {
  const [targetUnitId, setTargetUnitId] = useState("");
  const [targetRawMaterialId, setTargetRawMaterialId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const sourceMaterialName = sourceMaterial?.name;
  const sourceMaterialUnit = sourceMaterial?.unit;
  const sourceMaterialType = sourceMaterial?.itemType;

  useEffect(() => {
    if (!open || !targetUnitId || !sourceMaterialName || !sourceMaterialUnit || !sourceMaterialType) {
      setCandidates([]); setTargetRawMaterialId(""); setLookupError(""); setLoadingCandidates(false);
      return;
    }
    let cancelled = false;
    setLoadingCandidates(true); setLookupError(""); setCandidates([]); setTargetRawMaterialId("");
    void (async () => {
      const { data, error } = await supabase.from("raw_materials")
        .select("id,name,unit,tipo")
        .eq("business_unit_id", targetUnitId)
        .eq("active", true)
        .eq("tipo", sourceMaterialType)
        .ilike("name", sourceMaterialName.replace(/[\\%_]/g, "\\$&"))
        .ilike("unit", sourceMaterialUnit.replace(/[\\%_]/g, "\\$&"));
      if (cancelled) return;
      if (error) { setLookupError(error.message); setLoadingCandidates(false); return; }
      const matches = (data ?? []).filter(row =>
        normalized(row.name) === normalized(sourceMaterialName) &&
        normalized(row.unit) === normalized(sourceMaterialUnit)
      ).map(row => ({ id: row.id, name: row.name, unit: row.unit, tipo: row.tipo }));
      setCandidates(matches);
      if (matches.length === 1) setTargetRawMaterialId(matches[0].id);
      setLoadingCandidates(false);
    })();
    return () => { cancelled = true; };
  }, [open, targetUnitId, sourceMaterialName, sourceMaterialUnit, sourceMaterialType]);

  const maxQuantity = lot?.quantidadeRestante ?? 0;
  const parsedQuantity = Number(quantity);
  const canSubmit = Boolean(lot && sourceMaterial && targetUnitId && targetRawMaterialId &&
    Number.isFinite(parsedQuantity) && parsedQuantity > 0 && parsedQuantity <= maxQuantity && !loadingCandidates && !busy);
  const targetName = useMemo(() => units.find(unit => unit.id === targetUnitId)?.name ?? "unidade de destino", [units, targetUnitId]);

  const close = (next: boolean) => {
    if (busy) return;
    if (!next) { setTargetUnitId(""); setTargetRawMaterialId(""); setQuantity(""); setCandidates([]); setLookupError(""); }
    onOpenChange(next);
  };

  const submit = async () => {
    if (!canSubmit || !lot || !targetRawMaterialId) return;
    const ok = await onSubmit({ lotId: lot.id, targetUnitId, targetRawMaterialId, quantity: parsedQuantity });
    if (ok) close(false);
  };

  return <Dialog open={open} onOpenChange={close}>
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Transferir parte do lote</DialogTitle>
        <DialogDescription>
          A origem mantém o histórico. O destino recebe um lote vinculado ao original, com a mesma validade e custo unitário.
        </DialogDescription>
      </DialogHeader>
      {lot && sourceMaterial && <div className="space-y-4 py-2">
        <div className="rounded-lg border bg-muted/40 p-3 text-sm">
          <p className="font-medium">{sourceMaterial.name} · lote {lot.numeroLote}</p>
          <p className="text-muted-foreground">Disponível: {maxQuantity.toLocaleString("pt-BR")} {sourceMaterial.unit}{lot.validade ? ` · validade ${new Date(`${lot.validade}T00:00:00`).toLocaleDateString("pt-BR")}` : " · sem validade informada"}</p>
        </div>
        <div className="space-y-2">
          <Label>Unidade de destino</Label>
          <Select value={targetUnitId} onValueChange={setTargetUnitId}>
            <SelectTrigger><SelectValue placeholder="Selecione a unidade" /></SelectTrigger>
            <SelectContent>{units.filter(unit => unit.id !== sourceUnitId).map(unit => <SelectItem key={unit.id} value={unit.id}>{unit.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {targetUnitId && <div className="space-y-2">
          <Label>Insumo correspondente em {targetName}</Label>
          {loadingCandidates ? <p className="text-sm text-muted-foreground">Verificando insumos com mesmo nome, tipo e unidade-base…</p> : lookupError ? <p className="text-sm text-destructive">Não foi possível consultar os insumos de destino: {lookupError}</p> : candidates.length ? <Select value={targetRawMaterialId} onValueChange={setTargetRawMaterialId}>
            <SelectTrigger><SelectValue placeholder="Selecione o insumo correspondente" /></SelectTrigger>
            <SelectContent>{candidates.map(item => <SelectItem key={item.id} value={item.id}>{item.name} · {item.unit}</SelectItem>)}</SelectContent>
          </Select> : <p className="text-sm text-destructive">Não há insumo correspondente. Crie ou copie o item/ficha para essa unidade antes de transferir.</p>}
        </div>}
        <div className="space-y-2">
          <Label>Quantidade a transferir ({sourceMaterial.unit})</Label>
          <Input type="number" min="0" max={maxQuantity} step="any" value={quantity} onChange={event => setQuantity(event.target.value)} placeholder="Informe uma quantidade maior que zero" />
          {Number.isFinite(parsedQuantity) && parsedQuantity > maxQuantity && <p className="text-sm text-destructive">A quantidade não pode exceder o saldo do lote.</p>}
        </div>
        <p className="text-xs text-muted-foreground">A baixa e a entrada serão registradas juntas. Nenhum lote, saldo ou movimento será apagado.</p>
      </div>}
      <DialogFooter>
        <Button variant="outline" onClick={() => close(false)} disabled={busy}>Cancelar</Button>
        <Button onClick={() => void submit()} disabled={!canSubmit}>{busy ? "Transferindo…" : "Confirmar transferência"}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
