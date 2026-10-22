import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Printer, RefreshCw, QrCode } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

interface Props {
  tableId: string;
  tableNumber: number;
  unitName: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** QR da mesa no editor: mostra, imprime e regenera (o antigo para de funcionar). */
const TableQrPanel = ({ tableId, tableNumber, unitName }: Props) => {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const load = async (regenerate: boolean) => {
    setBusy(true);
    const { data, error } = await (supabase.rpc as unknown as (fn: string, args: object) => Promise<{ data: string | null; error: unknown }>)("table_qr_token", { p_table_id: tableId, p_regenerate: regenerate });
    if (error || !data) {
      toast.error("Não foi possível gerar o QR desta mesa");
      setBusy(false);
      return;
    }
    const url = `${window.location.origin}/m/t/${data}`;
    setDataUrl(await QRCode.toDataURL(url, { width: 512, margin: 2 }));
    if (regenerate) toast.success("QR novo gerado. O QR impresso antigo não funciona mais.");
    setConfirm(false);
    setBusy(false);
  };

  useEffect(() => {
    setDataUrl(null);
    setConfirm(false);
    void load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId]);

  const print = () => {
    if (!dataUrl) return;
    const w = window.open("", "_blank", "width=480,height=640");
    if (!w) {
      toast.error("Libere pop-ups para imprimir");
      return;
    }
    w.document.write(
      `<!doctype html><title>Mesa ${tableNumber}</title><body style="font-family:sans-serif;text-align:center;margin:24px">` +
        `<h2 style="margin:0">${esc(unitName)}</h2><h1 style="font-size:64px;margin:8px 0">Mesa ${String(tableNumber).padStart(2, "0")}</h1>` +
        `<img src="${dataUrl}" style="width:320px;height:320px"><p>Aponte a câmera para pedir</p>` +
        `<script>window.onload=()=>{window.print()}<\/script></body>`,
    );
    w.document.close();
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <QrCode className="h-4 w-4 text-primary" />
      <span className="text-sm font-medium text-foreground">QR da Mesa {String(tableNumber).padStart(2, "0")}</span>
      {dataUrl && <img src={dataUrl} alt={`QR mesa ${tableNumber}`} className="h-20 w-20 rounded border border-border" />}
      <Button size="sm" variant="outline" onClick={print} disabled={!dataUrl || busy}>
        <Printer className="mr-1.5 h-4 w-4" /> Imprimir
      </Button>
      <Button size="sm" variant="outline" onClick={() => (confirm ? load(true) : setConfirm(true))} disabled={busy}>
        <RefreshCw className="mr-1.5 h-4 w-4" /> {confirm ? "Confirmar regenerar?" : "Regenerar"}
      </Button>
      {confirm && <span className="text-xs text-muted-foreground">O QR já impresso deixa de funcionar.</span>}
    </div>
  );
};

export default TableQrPanel;
