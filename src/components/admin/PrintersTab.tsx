import { useState } from "react";
import { Printer, Plus, Trash2, Tag as TagIcon, TestTube2, ChevronDown, ChevronUp, Settings2 } from "lucide-react";
import { testQzPrinter } from "@/utils/qz-printer";
import { printReceipt } from "@/utils/thermal-print";
import { toast } from "sonner";
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
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [tipo, setTipo] = useState<PrinterTipo>("termica");
  const [gatilho, setGatilho] = useState<PrinterGatilho>("comanda_cozinha");
  const [connectionType, setConnectionType] = useState<PrinterConnectionType>("browser");
  const [deviceIdentifier, setDeviceIdentifier] = useState("");
  const [host,setHost] = useState("");
  const [port,setPort] = useState("9100");
  const [paperWidth,setPaperWidth] = useState("80");
  const [transport,setTransport] = useState("tcp");
  const [copies,setCopies] = useState("1");
  const [autoCut,setAutoCut] = useState(false);
  const [encoding,setEncoding] = useState("cp850");

  const handleTestPrint = async (p: (typeof printers)[number]) => {
    if (p.connectionType === "qz_tray") {
      setTestingId(p.id);
      try {
        await testQzPrinter(p);
        toast.success("Comando de teste enviado ao QZ Tray");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Falha ao conectar ao QZ Tray");
      } finally { setTestingId(null); }
      return;
    }
    if (p.connectionType === "webusb") {
      toast.error("WebUSB ainda não está disponível. Selecione QZ Tray ou navegador.");
      return;
    }
    const escaped = p.name.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] ?? char));
    printReceipt(`<!doctype html><html><head><meta charset="utf-8"><style>@page{size:${p.paperWidth}mm auto;margin:0}body{font-family:monospace;padding:4mm;text-align:center;color:#000}hr{border:0;border-top:1px dashed #000}</style></head><body><h2>POP9 ERP</h2><hr><p>TESTE DE IMPRESSAO</p><p>${escaped}</p><p>${new Date().toLocaleString("pt-BR")}</p><hr><p>Teste pelo navegador</p></body></html>`);
  };

  const resetForm = () => {
    setAdvancedOpen(false);
    setName("");
    setTipo("termica");
    setGatilho("comanda_cozinha");
    setConnectionType("browser");
    setDeviceIdentifier(""); setHost(""); setPort("9100"); setPaperWidth("80"); setTransport("tcp"); setCopies("1"); setAutoCut(false); setEncoding("cp850");
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    if (transport === "tcp" && connectionType !== "browser" && (!host.trim() || !/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)) { toast.error("Informe IP/host e porta TCP válida."); return; }
    if (!Number.isInteger(Number(copies)) || Number(copies) < 1 || Number(copies) > 10) { toast.error("Cópias devem estar entre 1 e 10."); return; }
    setSaving(true);
    const ok = await createPrinter({
      name: name.trim(),
      tipo,
      gatilho,
      connectionType,
      deviceIdentifier: deviceIdentifier.trim() || null,
      host: host.trim() || null, port: Number(port), paperWidth: Number(paperWidth), transport, copies: Number(copies), autoCut, encoding,
    });
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
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Central de Impressão</h2>
        <p className="text-xs text-muted-foreground">Gerencie os destinos de impressão desta unidade. A fila centralizada e o monitoramento online ainda não estão disponíveis.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-2xl font-semibold">{printers.length}</p>
          <p className="text-xs text-muted-foreground">Cadastradas</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-2xl font-semibold">{printers.filter(p => p.active).length}</p>
          <p className="text-xs text-muted-foreground">Ativas (não indica conexão)</p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Impressoras cadastradas</h3>
        <Button size="sm" onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4 mr-1" /> Adicionar</Button>
      </div>
      <div className="space-y-2">
        {printers.map(p => {
          const expanded = expandedIds.includes(p.id);
          return <div key={p.id} className="rounded-xl border border-border bg-card p-4 space-y-3">
            <button type="button" className="flex items-center justify-between gap-3 w-full text-left" aria-expanded={expanded} onClick={() => setExpandedIds(ids => expanded ? ids.filter(id => id !== p.id) : [...ids, p.id])}>
              <span className="flex items-center gap-2 min-w-0">
                {p.tipo === "etiqueta" ? <TagIcon className="h-5 w-5 shrink-0 text-primary"/> : <Printer className="h-5 w-5 shrink-0 text-primary"/>}
                <span className="min-w-0"><span className="block font-semibold truncate">{p.name}</span><span className="block text-xs text-muted-foreground">{GATILHO_LABELS[p.gatilho]}</span></span>
              </span>
              <span className="flex items-center gap-2 shrink-0"><Badge variant={p.active ? "secondary" : "outline"}>{p.active ? "Ativa" : "Inativa"}</Badge>{expanded ? <ChevronUp className="h-4 w-4"/> : <ChevronDown className="h-4 w-4"/>}</span>
            </button>
            {expanded && <>
              <div className="rounded-lg bg-muted/40 p-3 space-y-1 text-xs text-muted-foreground">
                <p>Conexão: {CONNECTION_TYPE_LABELS[p.connectionType]} · {p.transport === "tcp" ? "Rede TCP" : "Impressora do sistema"}</p>
                {p.host && <p>Endereço: {p.host}:{p.port}</p>}
                {p.deviceIdentifier && <p>Dispositivo: {p.deviceIdentifier}</p>}
                <p>Papel: {p.paperWidth} mm · {p.copies} cópia(s) · {p.encoding.toUpperCase()}</p>
                <p>Status de conexão: não monitorado</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => handleTestPrint(p)} disabled={testingId === p.id}><TestTube2 className="h-4 w-4 mr-1"/>{testingId === p.id ? "Testando..." : "Testar"}</Button>
                <Button size="sm" variant="outline" onClick={() => updatePrinter(p.id, { active: !p.active })}>{p.active ? "Desativar" : "Ativar"}</Button>
                <Button size="sm" variant="outline" onClick={() => { if (window.confirm(`Excluir a impressora "${p.name}"?`)) deletePrinter(p.id); }}><Trash2 className="h-4 w-4 mr-1"/>Excluir</Button>
              </div>
            </>}
          </div>;
        })}
        {printers.length === 0 && <p className="text-center text-muted-foreground py-6 text-sm">Nenhuma impressora cadastrada.</p>}
      </div>
      <div className="rounded-xl border border-dashed border-border p-4 space-y-1">
        <p className="text-sm font-medium">Fila de impressão</p>
        <p className="text-xs text-muted-foreground">Em desenvolvimento. O histórico e os estados de envio aparecerão aqui após a integração com o agente de impressão.</p>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova impressora</DialogTitle>
            <DialogDescription>
              Nome, tipo, gatilho (quando ela é usada) e conexão.
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
              <Label className="text-sm text-muted-foreground">Gatilho (quando imprime)</Label>
              <Select value={gatilho} onValueChange={(v) => setGatilho(v as PrinterGatilho)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GATILHO_OPTIONS.map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
            <button type="button" className="w-full flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm font-medium" aria-expanded={advancedOpen} onClick={() => setAdvancedOpen(v => !v)}><span className="flex items-center gap-2"><Settings2 className="h-4 w-4"/>Configurações avançadas</span>{advancedOpen ? <ChevronUp className="h-4 w-4"/> : <ChevronDown className="h-4 w-4"/>}</button>
            {advancedOpen && <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Transporte</Label><Select value={transport} onValueChange={setTransport}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="tcp">TCP / Rede</SelectItem><SelectItem value="usb">USB</SelectItem></SelectContent></Select></div>
              <div className="space-y-2"><Label>Papel</Label><Select value={paperWidth} onValueChange={setPaperWidth}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="58">58 mm</SelectItem><SelectItem value="80">80 mm</SelectItem></SelectContent></Select></div>
              {transport === "tcp" && <><div className="space-y-2"><Label>IP / Host</Label><Input value={host} onChange={e=>setHost(e.target.value)} placeholder="192.168.1.12"/></div><div className="space-y-2"><Label>Porta TCP</Label><Input type="number" min="1" max="65535" value={port} onChange={e=>setPort(e.target.value)}/></div></>}
              <div className="space-y-2"><Label>Cópias</Label><Input type="number" min="1" max="10" value={copies} onChange={e=>setCopies(e.target.value)}/></div>
              <div className="space-y-2"><Label>Codificação</Label><Select value={encoding} onValueChange={setEncoding}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="cp850">CP850</SelectItem><SelectItem value="cp860">CP860</SelectItem><SelectItem value="utf8">UTF-8</SelectItem></SelectContent></Select></div>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={autoCut} onChange={e=>setAutoCut(e.target.checked)}/> Corte automático</label>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Identificador do dispositivo (opcional)</Label>
              <Input
                value={deviceIdentifier}
                onChange={(e) => setDeviceIdentifier(e.target.value)}
                placeholder="Ex: nome/IP da impressora, quando aplicável"
              />
            </div>
            </div>}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={saving || !name.trim()}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PrintersTab;
