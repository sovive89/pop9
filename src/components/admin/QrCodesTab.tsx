import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { QrCode, Download, Loader2 } from "lucide-react";

const CONFIG_KEY = "customer_checkin_enabled";

interface BusinessUnit {
  id: string;
  table_count: number | null;
}

interface TableQr {
  tableNumber: number;
  dataUrl: string;
  url: string;
}

const baseUrl = window.location.origin;

const QrCodesTab = () => {
  const [enabled, setEnabled] = useState(false);
  const [savingToggle, setSavingToggle] = useState(false);
  const [businessUnit, setBusinessUnit] = useState<BusinessUnit | null>(null);
  const [tableQrs, setTableQrs] = useState<TableQr[]>([]);
  const [generalQr, setGeneralQr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [{ data: config }, { data: units }] = await Promise.all([
        supabase.from("app_config").select("value").eq("key", CONFIG_KEY).maybeSingle(),
        supabase.from("business_units").select("id, table_count").eq("active", true).limit(1),
      ]);

      setEnabled(config?.value === "true");

      const unit = units?.[0] ?? null;
      setBusinessUnit(unit);

      setGeneralQr(await QRCode.toDataURL(`${baseUrl}/m`, { width: 200, margin: 1 }));

      if (unit && unit.table_count) {
        const { data: existing } = await supabase
          .from("table_qr_codes")
          .select("table_number, token")
          .eq("business_unit_id", unit.id)
          .eq("active", true);

        const existingMap = new Map((existing ?? []).map((r) => [r.table_number, r.token]));
        const missing: number[] = [];
        for (let n = 1; n <= unit.table_count; n++) {
          if (!existingMap.has(n)) missing.push(n);
        }

        if (missing.length > 0) {
          const { data: inserted } = await supabase
            .from("table_qr_codes")
            .insert(missing.map((table_number) => ({ table_number, business_unit_id: unit.id })))
            .select("table_number, token");
          for (const row of inserted ?? []) existingMap.set(row.table_number, row.token);
        }

        const qrs: TableQr[] = [];
        for (let n = 1; n <= unit.table_count; n++) {
          const token = existingMap.get(n);
          if (!token) continue;
          const url = `${baseUrl}/m/t/${token}`;
          qrs.push({ tableNumber: n, url, dataUrl: await QRCode.toDataURL(url, { width: 200, margin: 1 }) });
        }
        setTableQrs(qrs);
      }

      setLoading(false);
    };
    load();
  }, []);

  const handleToggle = async () => {
    setSavingToggle(true);
    const next = !enabled;
    const { error } = await supabase
      .from("app_config")
      .upsert({ key: CONFIG_KEY, value: String(next), updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) {
      toast.error("Erro ao salvar");
    } else {
      setEnabled(next);
      toast.success(next ? "Check-in do cliente ativado" : "Check-in do cliente desativado");
    }
    setSavingToggle(false);
  };

  const download = (dataUrl: string, filename: string) => {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename;
    a.click();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Check-in do cliente via QR Code</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Quando ativado, clientes podem entrar numa sessão de mesa escaneando o QR Code, sem depender do garçom abrir a mesa.
            </p>
          </div>
          <button
            onClick={handleToggle}
            disabled={savingToggle}
            className={`h-6 w-11 rounded-full transition-colors relative shrink-0 ${enabled ? "bg-primary" : "bg-muted-foreground/30"}`}
          >
            <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${enabled ? "translate-x-5" : "translate-x-0.5"}`} />
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <QrCode className="h-4 w-4 text-primary" /> QR Code único (cartaz geral)
        </h3>
        <p className="text-xs text-muted-foreground">O cliente escaneia e digita o número da mesa manualmente.</p>
        {generalQr && (
          <div className="flex items-center gap-4">
            <img src={generalQr} alt="QR Code geral" className="rounded-lg border border-border" />
            <Button variant="outline" size="sm" className="gap-2" onClick={() => download(generalQr, "qr-geral.png")}>
              <Download className="h-3.5 w-3.5" /> Baixar
            </Button>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">QR Code por mesa</h3>
        {!businessUnit?.table_count ? (
          <p className="text-xs text-muted-foreground">
            Nenhuma unidade ativa com número de mesas configurado (campo "table_count" em Business Units).
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {tableQrs.map((q) => (
              <div key={q.tableNumber} className="flex flex-col items-center gap-2 rounded-lg border border-border p-3">
                <p className="text-xs font-semibold text-foreground">Mesa {String(q.tableNumber).padStart(2, "0")}</p>
                <img src={q.dataUrl} alt={`QR mesa ${q.tableNumber}`} className="rounded" />
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 w-full"
                  onClick={() => download(q.dataUrl, `qr-mesa-${q.tableNumber}.png`)}
                >
                  <Download className="h-3.5 w-3.5" /> Baixar
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default QrCodesTab;
