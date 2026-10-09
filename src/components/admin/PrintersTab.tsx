import { useState } from "react";
import { Printer, Plus, Trash2, Tag as TagIcon, TestTube2 } from "lucide-react";
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
  const [name, setName] = useState("");
  const [tipo, setTipo] = useState<PrinterTipo>("termica");
  const [gatilho, setGatilho] = useState<PrinterGatilho>("comanda_cozinha");
  const [connectionType, setConnectionType] = useState<PrinterConnectionType>("browser");
  const [deviceIdentifier, setDeviceIdentifier] = useState("");\n  const [host,setHost] = useState("");\n  const [port,setPort] = useState("9100");\n  const [paperWidth,setPaperWidth] = useState("80");\n  const [transport,setTransport] = useState("tcp");\n  const [copies,setCopies] = useState("1");\n  const [autoCut,setAutoCut] = useState(false);\n  const [encoding,setEncoding] = useState("cp850");

  const handleTestPrint = (printerName: string, connectionType: PrinterConnectionType) => {
    if (connectionType !== "browser") {
      toast.info("Envio direto ainda não disponível. Este teste usa o diálogo do navegador; QZ Tray/WebUSB exigem integração local.");
    }
    const escaped = printerName.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] ?? char));
    printReceipt(`<!doctype html><html><head><meta charset="utf-8"><style>@page{size:80mm auto;margin:0}body{font-family:monospace;width:72mm;padding:4mm;text-align:center;color:#000}hr{border:0;border-top:1px dashed #000}</style></head><body><h2>POP9 ERP</h2><hr><p>TESTE DE IMPRESSAO</p><p>${escaped}</p><p>${new Date().toLocaleString("pt-BR")}</p><hr><p>Teste pelo navegador</p></body></html>`);
  };

  const resetForm = () => {
    setName("");
    setTipo("termica");
    setGatilho("comanda_cozinha");
    setConnectionType("browser");
    setDeviceIdentifier(""); setHost(""); setPort("9100"); setPaperWidth("80"); setTransport("tcp"); setCopies("1"); setAutoCut(false); setEncoding("cp850");
  };

  const handleCreate = async () => {
    if (!name.trim()) return;\n    if (transport === "tcp" && connectionType !== "browser" && (!host.trim() || !/^\\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)) { toast.error("Informe IP/host e porta TCP válida."); return; }
    setSaving(true);
    const ok = await createPrinter({
      name: name.trim(),
      tipo,
      gatilho,
      connectionType,
      deviceIdentifier: deviceIdentifier.trim() || null,\n      host: host.trim() || null, port: Number(port), paperWidth: Number(paperWidth), transport, copies: Number(copies), autoCut, encoding,
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
          uma camada extra (QZ Tray ou WebUSB). O campo "Conexão" já existe pra quando isso for
          implementado; por enquanto ele é só informativo.
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
                  {p.deviceIdentifier && ` · ${p.deviceIdentifier}`}\n                  {p.host && ` · ${p.host}:${p.port}`} · {p.paperWidth}mm
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">\n                <Button size="sm" variant="outline" onClick={() => handleTestPrint(p.name, p.connectionType)} title="Teste via navegador"><TestTube2 className="h-4 w-4 mr-1" /> Testar</Button>
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
