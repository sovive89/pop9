import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PAGE_HELP } from "@/lib/page-help";
import { useCallback, useEffect, useRef, useState } from "react";
import { Printer, Plus, Trash2, Pencil, Tag as TagIcon } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useCurrentBusinessUnit } from "@/hooks/useCurrentBusinessUnit";
import { PRINTER_PRESETS, printerPreview } from "@/lib/printerPresets";
import { printReceipt } from "@/utils/thermal-print";
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
  SECTOR_LABELS,
  type PrinterSector,
} from "@/hooks/usePrinterConfigs";

const TIPO_OPTIONS: { value: PrinterTipo; label: string }[] = [
  { value: "termica", label: "Térmica (comanda/conta)" },
  { value: "etiqueta", label: "Etiqueta adesiva" },
];

const GATILHO_OPTIONS = Object.entries(GATILHO_LABELS) as [PrinterGatilho, string][];
const CONNECTION_OPTIONS = Object.entries(CONNECTION_TYPE_LABELS) as [PrinterConnectionType, string][];

const PrintersTab = () => {
  const { printers, loading, error, scope, reload, createPrinter, updatePrinter, deletePrinter } = usePrinterConfigs();
  const { businessUnitId, units } = useCurrentBusinessUnit();
  const unitName = units.find(unit => unit.id === businessUnitId)?.name ?? "";
  const currentScope = useRef(scope);currentScope.current = scope;
  const savingLock = useRef(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [setor, setSetor] = useState<PrinterSector>("cozinha");
  const [preset, setPreset] = useState("cozinha");
  const [previewGatilho, setPreviewGatilho] = useState<PrinterGatilho>("comanda_cozinha");
  const [previewOpen, setPreviewOpen] = useState(false);
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
  const [destinos, setDestinos] = useState<PrinterDestino[]>(["kitchen"]);
  const [sectors, setSectors] = useState<{ slug: string; name: string; active: boolean }[]>([]);
  const [newSector, setNewSector] = useState("");
  const [sectorBusy, setSectorBusy] = useState(false);
  const loadSectors = useCallback(async () => {
    if (!businessUnitId) { setSectors([]); return; }
    const { data, error } = await (supabase as any).from("print_sectors")
      .select("slug,name,active").eq("business_unit_id", businessUnitId).order("name");
    if (error) { toast.error("Erro ao carregar setores: " + error.message); return; }
    setSectors(data ?? []);
  }, [businessUnitId]);
  useEffect(() => { void loadSectors(); }, [loadSectors]);
  const addSector = async () => {
    const name = newSector.trim();
    if (!name || !businessUnitId || sectorBusy) return;
    const slug = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
      .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48);
    if (!slug || sectors.some(s => s.slug === slug)) { toast.error("Setor duplicado ou inválido"); return; }
    setSectorBusy(true);
    try {
      const { error } = await (supabase as any).from("print_sectors")
        .insert({ business_unit_id: businessUnitId, slug, name });
      if (error) { toast.error(error.message); return; }
      setNewSector(""); await loadSectors();
      setDestinos(prev => [...new Set([...prev, slug])]);
    } finally { setSectorBusy(false); }
  };

  const resetForm = useCallback(() => {
    setName("");
    setSetor("cozinha");setPreset("cozinha");setPreviewGatilho("comanda_cozinha");setPreviewOpen(false);
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
    setDestinos(["kitchen"]);
  }, []);
  useEffect(() => { setDialogOpen(false);resetForm(); }, [scope, resetForm]);

  const applyPreset = () => {
    const model = PRINTER_PRESETS.find(option => option.id === preset);
    if (!model) return;
    setSetor(model.setor);setTipo(model.tipo);setGatilhos([...model.gatilhos]);setDestinos([...model.destinos]);setPaperWidth(model.paperWidth);setCopies(model.copies);setAutoCut(model.autoCut);setPreviewGatilho(model.gatilhos[0]);
    if (!name.trim()) setName(`Impressora ${model.label}`);
  };

  const openNew = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (p: PrinterConfig) => {
    setEditingId(p.id);
    setName(p.name);
    setSetor(p.setor);setPreset(PRINTER_PRESETS.some(option => option.id === p.setor) ? p.setor : "cozinha");setPreviewGatilho(p.gatilhos[0]);setPreviewOpen(false);
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
    if (!name.trim() || !gatilhos.length || networkError || savingLock.current || !businessUnitId) return;
    const requestScope = scope;savingLock.current = true;
    setSaving(true);
    const data = {
      name: name.trim(),
      setor,
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
    try {
    const ok = editingId ? await updatePrinter(editingId, data) : await createPrinter(data);
    if (ok && currentScope.current === requestScope) {
      resetForm();
      setDialogOpen(false);
    }
    } finally { savingLock.current = false;setSaving(false); }
  };

  if (loading) {
    return <p className="text-center text-muted-foreground py-10 text-sm">Carregando...</p>;
  }
  if (error) return <div role="alert" className="space-y-3"><p>Não foi possível carregar as impressoras desta unidade.</p><Button variant="outline" onClick={()=>void reload()}>Tentar novamente</Button></div>;
  if (!businessUnitId) return <p>Selecione uma unidade para configurar as impressoras.</p>;
  const previewTrigger = gatilhos.includes(previewGatilho) ? previewGatilho : gatilhos[0];
  const previewHtml = previewOpen && previewTrigger && destinos.length ? printerPreview(previewTrigger, destinos, unitName, paperWidth, copies) : "";

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground leading-relaxed">
          {unitName} · Comece com um modelo de Cozinha, Bar, Caixa ou Expedição e ajuste papel, cópias e conexão. Cada impressora pode ter um ou mais gatilhos (ex.: a mesma térmica imprime a comanda
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
                  {SECTOR_LABELS[p.setor]} · {p.gatilhos.map((g) => GATILHO_LABELS[g]).join(", ")} · {CONNECTION_TYPE_LABELS[p.connectionType]} · {p.paperWidth} mm · {p.copies} cópia(s)
                  {p.deviceIdentifier && ` · ${p.deviceIdentifier}`}
                  {p.host && ` · Rede ${p.host}:${p.port} (${p.destinos.map((d) => sectors.find(s => s.slug === d)?.name ?? DESTINO_LABELS[d] ?? d).join(" + ")})`}
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
              Aplique um modelo predefinido, confira a prévia e ajuste o equipamento.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2 rounded-lg border p-3"><Label htmlFor="printer-preset">Modelo predefinido</Label><select id="printer-preset" className="w-full rounded-md border bg-background p-2 text-sm" value={preset} onChange={event=>setPreset(event.target.value)}>{PRINTER_PRESETS.map(option=><option key={option.id} value={option.id}>{option.label}</option>)}</select><p className="text-xs text-muted-foreground">{PRINTER_PRESETS.find(option=>option.id===preset)?.description}</p><Button type="button" variant="outline" disabled={saving} onClick={applyPreset}>Aplicar modelo</Button><p className="text-xs text-muted-foreground">Preenche tipo, impressões, destinos, papel, cópias e corte. A conexão e o endereço do equipamento são preservados.</p></div>
            <div className="space-y-2"><Label htmlFor="printer-sector">Setor da impressora</Label><select id="printer-sector" value={setor} onChange={event=>setSetor(event.target.value as PrinterSector)} className="w-full rounded-md border bg-background p-2 text-sm">{Object.entries(SECTOR_LABELS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div>
            <div className="space-y-2">
              <Label htmlFor="printer-name" className="text-sm text-muted-foreground">Nome</Label>
              <Input id="printer-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Impressora do bar" />
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
                      {[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={autoCut} onCheckedChange={(c) => setAutoCut(c === true)} /> Cortar o papel no fim
              </label>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Setores que esta impressora recebe</Label>
                <div className="flex flex-wrap gap-4">
                  {(sectors.length ? sectors.filter(s => s.active || destinos.includes(s.slug)).map(s => s.slug) : Object.keys(DESTINO_LABELS)).map((d) => (
                    <label key={d} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={destinos.includes(d)} onCheckedChange={(c) => toggleDestino(d, c === true)} /> {sectors.find(s => s.slug === d)?.name ?? DESTINO_LABELS[d] ?? d}
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <Input aria-label="Novo setor" placeholder="Novo setor (ex.: Confeitaria)" value={newSector} onChange={e => setNewSector(e.target.value)} />
                <Button type="button" variant="outline" disabled={!newSector.trim() || sectorBusy} onClick={() => void addSector()}>Adicionar setor</Button>
              </div>
              {networkError && <p className="text-xs text-destructive">{networkError}</p>}
            </div>
            <div className="space-y-3 rounded-lg border p-3"><Label htmlFor="printer-preview-model">Prévia da impressão</Label><select id="printer-preview-model" className="w-full rounded-md border bg-background p-2 text-sm" value={previewTrigger ?? ""} onChange={event=>setPreviewGatilho(event.target.value as PrinterGatilho)}>{gatilhos.map(value=><option key={value} value={value}>{GATILHO_LABELS[value]}</option>)}</select><Button type="button" variant="outline" disabled={!previewTrigger || !destinos.length || saving} onClick={()=>setPreviewOpen(value=>!value)}>{previewOpen ? "Ocultar prévia" : "Ver prévia"}</Button>{previewHtml && <><iframe title="Prévia do modelo de impressão" sandbox="" srcDoc={previewHtml} className="h-80 w-full rounded-md border bg-white" /><Button type="button" variant="outline" onClick={()=>printReceipt(previewHtml)}>Imprimir teste no navegador</Button></>}<p className="text-xs text-muted-foreground">Prévia com dados de exemplo, sem registrar pedidos ou pagamentos. O corte é aplicado pelo print server. Contas, avisos e etiquetas são impressos pelo navegador; o servidor automático atende comandas de cozinha/bar.</p></div>
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
