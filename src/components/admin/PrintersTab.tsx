import { useState } from "react";
import { Printer, Plus, Trash2, Tag as TagIcon, TestTube2 } from "lucide-react";
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
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Cada gatilho (ex: "Comanda da cozinha") pode ter uma impressora associada. Hoje a
          execução real da impressão continua sendo o diálogo do navegador — o navegador não
          permite selecionar/lembrar uma impressora específica nem imprimir silenciosamente sem
          uma camada extra (QZ Tray ou WebUSB). QZ Tray pode enviar comandos ESC/POS quando estiver instalado e autorizado no computador. WebUSB ainda não está integrado.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Impressoras cadastradas</h3>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
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
                  {GATILHO_LABELS[p.gatilho]} · {CONNECTION_TYPE_LABELS[p.connectionType]}
                  {p.deviceIdentifier && ` · ${p.deviceIdentifier}`}
                  {p.host && ` · ${p.host}:${p.port}`} · {p.paperWidth}mm
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button size="sm" variant="outline" onClick={() => handleTestPrint(p)} disabled={testingId === p.id} title="Testar impressora"><TestTube2 className="h-4 w-4 mr-1" /> Testar</Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => updatePrinter(p.id, { active: !p.active })}
                >
                  {p.active ? "Desativar" : "Ativar"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => deletePrinter(p.id)}>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
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
