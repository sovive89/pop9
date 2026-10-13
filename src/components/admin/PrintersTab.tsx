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
  type PrinterDestino,
  DESTINO_LABELS,
  isValidHost,
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
  // Impressão direta pelo print server (térmica de rede, porta 9100).
  const [host, setHost] = useState("");
  const [port, setPort] = useState("9100");
  const [paperWidth, setPaperWidth] = useState(80);
  const [copies, setCopies] = useState(1);
  const [autoCut, setAutoCut] = useState(true);
  const [destinos, setDestinos] = useState<PrinterDestino[]>(["kitchen", "bar"]);

  const resetForm = () => {
    setName("");
    setTipo("termica");
    setGatilhos(["comanda_cozinha"]);
    setEditingId(null);
    setConnectionType("browser");
    setDeviceIdentifier("");
    setHost("");
    setPort("9100");
    setPaperWidth(80);
    setCopies(1);
    setAutoCut(true);
    setDestinos(["kitchen", "bar"]);
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
    setHost(p.host ?? "");
    setPort(String(p.port));
    setPaperWidth(p.paperWidth);
    setCopies(p.copies);
    setAutoCut(p.autoCut);
    setDestinos(p.destinos);
    setDialogOpen(true);
  };

  const toggleGatilho = (value: PrinterGatilho, checked: boolean) =>
    setGatilhos((prev) => (checked ? [...prev.filter((g) => g !== value), value] : prev.filter((g) => g !== value)));

  const portNumber = Number(port);
  const hostValue = host.trim();
  const networkError = hostValue && !isValidHost(hostValue)
    ? "IP ou nome inválido (ex.: 192.168.0.50, sem http:// nem porta)."
    : !Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535
      ? "Porta inválida (padrão 9100)."
      : !destinos.length ? "Escolha pelo menos um setor." : "";

  const toggleDestino = (value: PrinterDestino, checked: boolean) =>
    setDestinos((prev) => (checked ? [...prev.filter((d) => d !== value), value] : prev.filter((d) => d !== value)));

  const handleSave = async () => {
    if (!name.trim() || !gatilhos.length || networkError) return;
    setSaving(true);
    const data = {
      name: name.trim(),
      tipo,
      gatilhos,
      connectionType,
      deviceIdentifier: deviceIdentifier.trim() || null,
      host: hostValue || null,
      port: portNumber,
      paperWidth,
      copies,
      autoCut,
      destinos,
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
          da cozinha e a conta da mesa), e um gatilho pode sair em mais de uma impressora. Sem
          o print server, a impressão usa o diálogo do navegador. Com o POP9 Print Server instalado
          num computador da loja e o IP da térmica preenchido abaixo, a comanda da cozinha/bar sai
          sozinha, direto na impressora (ative também a Estação de impressão em Módulos).
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
                  {p.host && ` · Rede ${p.host}:${p.port} (${p.destinos.map((d) => DESTINO_LABELS[d]).join(" + ")})`}
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
        <DialogContent className="max-h-[90vh] overflow-y-auto">
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
            <div className="space-y-3 rounded-lg border border-border p-3">
              <p className="text-sm font-medium">Impressão direta (print server)</p>
              <p className="text-xs text-muted-foreground">
                Para a comanda sair sozinha, sem diálogo do navegador: informe o IP da térmica de rede.
                O POP9 Print Server (pasta print-server do sistema) envia a comanda para cá.
              </p>
              <div className="grid grid-cols-[1fr_6rem] gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">IP da impressora</Label>
                  <Input value={host} onChange={(e) => setHost(e.target.value)} placeholder="192.168.0.50" inputMode="decimal" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Porta</Label>
                  <Input value={port} onChange={(e) => setPort(e.target.value.replace(/\D/g, ""))} inputMode="numeric" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Papel</Label>
                  <Select value={String(paperWidth)} onValueChange={(v) => setPaperWidth(Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="80">80 mm</SelectItem>
                      <SelectItem value="58">58 mm</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Cópias</Label>
                  <Select value={String(copies)} onValueChange={(v) => setCopies(Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={autoCut} onCheckedChange={(c) => setAutoCut(c === true)} /> Cortar o papel no fim
              </label>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Setores que esta impressora recebe</Label>
                <div className="flex gap-4">
                  {(Object.keys(DESTINO_LABELS) as PrinterDestino[]).map((d) => (
                    <label key={d} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={destinos.includes(d)} onCheckedChange={(c) => toggleDestino(d, c === true)} /> {DESTINO_LABELS[d]}
                    </label>
                  ))}
                </div>
              </div>
              {networkError && <p className="text-xs text-destructive">{networkError}</p>}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving || !name.trim() || !gatilhos.length || Boolean(networkError)}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PrintersTab;
