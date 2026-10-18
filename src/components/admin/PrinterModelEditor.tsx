import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GATILHO_LABELS, type PrinterGatilho } from "@/hooks/usePrinterConfigs";
import { defaultPrintLayout, readPrintLogo, type PrintLayout } from "@/lib/printLayout";
import { normalizeLayout } from "../../../print-server/src/layout.mjs";

type Props = {
  open: boolean; onOpenChange: (open: boolean) => void; trigger: PrinterGatilho;
  value?: PrintLayout; onApply: (value: PrintLayout) => void;
  preview: (layout: PrintLayout) => string;
};
export default function PrinterModelEditor({ open, onOpenChange, trigger, value, onApply, preview }: Props) {
  const [draft, setDraft] = useState<PrintLayout>(defaultPrintLayout);
  const [logoBusy, setLogoBusy] = useState(false);
  useEffect(() => { if (open) setDraft(normalizeLayout(value)); }, [open, trigger, value]);
  const change = (patch: Partial<PrintLayout>) => setDraft(previous => ({ ...previous, ...patch }));
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto">
      <DialogHeader><DialogTitle>Editar modelo: {GATILHO_LABELS[trigger]}</DialogTitle>
        <DialogDescription>Personalize este modelo para esta impressora. Depois de aplicar, salve o cadastro da impressora.</DialogDescription></DialogHeader>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <div className="space-y-1"><Label htmlFor="model-header">Cabeçalho adicional</Label><Input id="model-header" maxLength={80} value={draft.header} onChange={event => change({ header: event.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="model-logo">Logo (preto e branco)</Label><Input id="model-logo" type="file" accept="image/png,image/jpeg,image/webp" disabled={logoBusy} onChange={async event => {
            const file = event.target.files?.[0]; if (!file) return;
            setLogoBusy(true);
            try { change({ logo: await readPrintLogo(file) }); } catch (error) { toast.error(error instanceof Error ? error.message : "Falha ao ler logo"); } finally { setLogoBusy(false); }
          }} /><p className="text-xs text-muted-foreground">Até 2 MB. A imagem é convertida para a impressão térmica, sem buscar arquivos externos.</p>{draft.logo && <Button type="button" variant="outline" onClick={() => change({ logo: null })}>Remover logo</Button>}</div>
          <div className="space-y-1"><Label htmlFor="model-size">Texto dos itens</Label><select id="model-size" value={draft.itemSize} className="w-full rounded-md border bg-background p-2" onChange={event => change({ itemSize: event.target.value as PrintLayout["itemSize"] })}><option value="normal">Normal</option><option value="large">Grande</option></select></div>
          {([
            ["showUnit", "Mostrar unidade"], ["showLocation", "Mostrar mesa ou retirada"], ["showOrigin", "Mostrar origem do pedido"],
            ["showClient", "Mostrar cliente"], ["showOrder", "Mostrar referência do pedido"],
            ["showTime", "Mostrar horário"], ["showModifications", "Mostrar modificações e observações"],
          ] as const).map(([key, label]) => <label key={key} className="flex items-center gap-2 text-sm"><Checkbox checked={draft[key]} onCheckedChange={checked => change({ [key]: checked === true })} />{label}</label>)}
          <p className="text-xs text-muted-foreground">As opções afetam os campos presentes no modelo. Valores e totais das contas são preservados.</p>
          {!draft.showModifications && <p role="alert" className="text-sm text-destructive">Modificações e observações não aparecerão neste comprovante.</p>}
          <div className="space-y-1"><Label htmlFor="model-footer">Rodapé</Label><textarea id="model-footer" maxLength={240} value={draft.footer} onChange={event => change({ footer: event.target.value })} className="min-h-20 w-full rounded-md border bg-background p-2 text-sm" /></div>
        </div>
        <div className="space-y-2"><p className="text-sm font-medium">Prévia com dados de exemplo</p><iframe title="Prévia do modelo em edição" sandbox="" srcDoc={preview(draft)} className="h-[30rem] w-full border bg-white" /></div>
      </div>
      <DialogFooter className="flex-wrap gap-2"><Button type="button" variant="outline" disabled={logoBusy} onClick={() => setDraft(defaultPrintLayout())}>Restaurar padrão</Button><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button type="button" disabled={logoBusy} onClick={() => { onApply(normalizeLayout(draft)); onOpenChange(false); }}>Aplicar alterações</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
