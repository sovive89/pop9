import { PAGE_HELP } from "@/lib/page-help";
import { useState } from "react";
import { Printer, Plus, Trash2, Pencil, Tag as TagIcon } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  usePrinterConfigs,
  GATILHO_LABELS,
  CONNECTION_TYPE_LABELS,
  type PrinterTipo,
  type PrinterGatilho,
  type PrinterConnectionType,
  type PrinterConfig,
} from "@/hooks/usePrinterConfigs";

const TIPO_OPTIONS: { value: PrinterTipo; label: string }[] = [
  { value: "termica", label: "Térmica (comanda/conta)" },
  { value: "etiqueta", label: "Etiqueta adesiva" },
];

const GATILHO_OPTIONS = Object.entries(GATILHO_LABELS) as [PrinterGatilho, string][];
const CONNECTION_OPTIONS = Object.entries(CONNECTION_TYPE_LABELS) as [PrinterConnectionType, string][];

const PrintersTab = () => {
  const { printers, loading, createPrinter, updatePrinter, deletePrinter } = usePrinterConfigs();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [tipo, setTipo] = useState<PrinterTipo>("termica");
  const [gatilhos, setGatilhos] = useState<PrinterGatilho[]>(["comanda_cozinha"]);
  // null = nova impressora; id = editando uma existente.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [connectionType, setConnectionType] = useState<PrinterConnectionType>("browser");
  const [deviceIdentifier, setDeviceIdentifier] = useState("");

  const resetForm = () => {
    setName("");
    setTipo("termica");
    setGatilhos(["comanda_cozinha"]);
    setEditingId(null);
    setConnectionType("browser");
    setDeviceIdentifier("");
  };

  const openNew = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (p: PrinterConfig) => {
    setEditingId(p.id);
    setName(p.name);
    setTipo(p.tipo);
    setGatilhos(p.gatilhos);
    setConnectionType(p.connectionType);
    setDeviceIdentifier(p.deviceIdentifier ?? "");
    setDialogOpen(true);
  };

  const toggleGatilho = (value: PrinterGatilho, checked: boolean) =>
    setGatilhos((prev) => (checked ? [...prev.filter((g) => g !== value), value] : prev.filter((g) => g !== value)));

  const handleSave = async () => {
    if (!name.trim() || !gatilhos.length) return;
    setSaving(true);
    const data = {
      name: name.trim(),
      tipo,
      gatilhos,
      connectionType,
      deviceIdentifier: deviceIdentifier.trim() || null,
    };
    const ok = editingId ? await updatePrinter(editingId, data) : await createPrinter(data);
    setSaving(false);
    if (ok) {
      resetForm();
      setDialogOpen(false);
    }
  };

  if (loading) {
    return <p className="text-center text-muted-foreground py-10 text-sm">Carregando...</p>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Cada impressora pode ter um ou mais gatilhos (ex.: a mesma térmica imprime a comanda
          da cozinha e a conta da mesa), e um gatilho pode sair em mais de uma impressora. Hoje a
          execução real da impressão continua sendo o diálogo do navegador — o navegador não
          permite selecionar/lembrar uma impressora específica nem imprimir silenciosamente sem
          uma camada extra (QZ Tray ou WebUSB). O campo "Conexão" já existe pra quando isso for
          implementado; por enquanto ele é só informativo.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <h3 tabIndex={0} data-tooltip={PAGE_HELP["printers"]} className="text-sm font-semibold text-foreground">Impressoras cadastradas</h3>
        <Button size="sm" onClick={openNew}>
          <Plus className="h-4 w-4 mr-1" /> Nova impressora
        </Button>
      </div>

      <div className="space-y-2">
        {printers.map((p) => (
          <div key={p.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-foreground flex items-center gap-2">
                  {p.tipo === "etiqueta" ? (
                    <TagIcon className="h-4 w-4 text-primary" />
                  ) : (
                    <Printer className="h-4 w-4 text-primary" />
                  )}
                  {p.name}
                  {!p.active && (
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">
                      inativa
                    </Badge>
                  )}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {p.gatilhos.map((g) => GATILHO_LABELS[g]).join(", ")} · {CONNECTION_TYPE_LABELS[p.connectionType]}
                  {p.deviceIdentifier && ` · ${p.deviceIdentifier}`}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => updatePrinter(p.id, { active: !p.active })}
                >
                  {p.active ? "Desativar" : "Ativar"}
                </Button>
                <Button size="sm" variant="outline" aria-label={`Editar ${p.name}`} onClick={() => openEdit(p)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="outline" aria-label={`Remover ${p.name}`} onClick={() => deletePrinter(p.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}
        {printers.length === 0 && (
          <p className="text-center text-muted-foreground py-6 text-sm">
            Nenhuma impressora cadastrada ainda.
          </p>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar impressora" : "Nova impressora"}</DialogTitle>
            <DialogDescription>
              Nome, tipo, gatilhos (quando ela é usada) e conexão.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Impressora do bar" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as PrinterTipo)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPO_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Gatilhos (quando imprime) — escolha um ou mais</Label>
              <div className="space-y-2 rounded-lg border border-border p-3">
                {GATILHO_OPTIONS.map(([value, label]) => (
                  <label key={value} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={gatilhos.includes(value)} onCheckedChange={(c) => toggleGatilho(value, c === true)} />
                    {label}
                  </label>
                ))}
              </div>
              {!gatilhos.length && <p className="text-xs text-destructive">Escolha pelo menos um gatilho.</p>}
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Conexão</Label>
              <Select value={connectionType} onValueChange={(v) => setConnectionType(v as PrinterConnectionType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONNECTION_OPTIONS.map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Identificador do dispositivo (opcional)</Label>
              <Input
                value={deviceIdentifier}
                onChange={(e) => setDeviceIdentifier(e.target.value)}
                placeholder="Ex: nome/IP da impressora, quando aplicável"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving || !name.trim() || !gatilhos.length}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PrintersTab;
