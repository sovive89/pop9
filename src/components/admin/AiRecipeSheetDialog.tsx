import { useEffect, useState } from "react";
import { Download, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { downloadBlob } from "@/utils/fileExport";
import { extractMenuDraft, listImportModels, type ImportModel, type MenuImportDraft } from "@/lib/menuImport";

const EXAMPLES = [
  "X-Bacon: pão brioche, blend bovino 180 g, cheddar, bacon, maionese da casa. Preço R$ 36,90",
  "Molho barbecue da casa, rendimento 2 kg",
  "Caipirinha de limão com cachaça, copo 300 ml, R$ 22",
  "Porção de batata frita 400 g com cheddar e bacon",
];

/**
 * A IA monta a ficha técnica a partir de uma descrição livre e entrega no formato de
 * exportação (CSV em ZIP). Nada é gravado: para cadastrar, envie o arquivo em Cardápio → Importar com IA.
 */
export default function AiRecipeSheetDialog({ businessUnitId, open, onOpenChange }: { businessUnitId: string | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const [prompt, setPrompt] = useState("");
  const [models, setModels] = useState<ImportModel[]>([]);
  const [model, setModel] = useState("");
  const [warning, setWarning] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<MenuImportDraft | null>(null);

  useEffect(() => {
    if (!open || !businessUnitId) return;
    let cancelled = false;
    listImportModels(businessUnitId).then((r) => {
      if (cancelled) return;
      setModels(r.models); setWarning(r.warning); setModel((m) => m || r.models[0]?.id || "");
    }).catch((e) => { if (!cancelled) setWarning(e instanceof Error ? e.message : "IA indisponível"); });
    return () => { cancelled = true; };
  }, [open, businessUnitId]);

  const generate = async () => {
    if (!businessUnitId || !prompt.trim() || !model) return;
    setBusy(true); setDraft(null);
    try {
      const result = await extractMenuDraft({ businessUnitId, model, files: [], text: prompt.trim(), mode: "create" });
      if (!result.draft.items.length) throw new Error("A IA não conseguiu montar a ficha. Descreva melhor o item (ingredientes, porção, rendimento).");
      setDraft(result.draft);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível gerar a ficha"); }
    finally { setBusy(false); }
  };

  const download = async () => {
    if (!draft) return;
    const { draftToSheetFiles, zipFiles } = await import("@/utils/recipeSheets");
    const name = (draft.items[0]?.name ?? "ficha").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    downloadBlob(new Blob([await zipFiles(draftToSheetFiles(draft))], { type: "application/zip" }), `ficha-${name}.zip`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /> Criar ficha técnica com IA</DialogTitle>
          <DialogDescription>Descreva o item vendido, a bebida ou o preparo da casa. A IA sugere insumos e quantidades; você confere e baixa no formato das fichas.</DialogDescription>
        </DialogHeader>
        <label className="block space-y-1 text-sm">O que você quer?
          <textarea value={prompt} maxLength={2000} rows={4} onChange={(e) => setPrompt(e.target.value)} placeholder={EXAMPLES[0]}
            className="w-full rounded-md border border-border bg-background p-2 text-sm" />
        </label>
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => <button key={ex} type="button" onClick={() => setPrompt(ex)} className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground">{ex.split(":")[0].split(",")[0]}</button>)}
        </div>
        {models.length > 1 && (
          <label className="block space-y-1 text-sm">Modelo de IA
            <select value={model} onChange={(e) => setModel(e.target.value)} className="w-full rounded-md border border-border bg-background p-2 text-sm">
              {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </label>
        )}
        {warning && <p className="text-xs text-amber-500">{warning}</p>}
        <Button onClick={() => void generate()} disabled={busy || !prompt.trim() || !model}><Sparkles className="mr-2 h-4 w-4" />{busy ? "Gerando ficha..." : "Gerar ficha"}</Button>

        {draft && (
          <div className="space-y-3 rounded-lg border border-border p-3">
            {draft.items.map((item) => (
              <div key={item.name} className="space-y-1">
                <p className="font-semibold">{item.name}{item.price ? ` · R$ ${item.price.toFixed(2).replace(".", ",")}` : ""}</p>
                <table className="w-full text-xs">
                  <thead><tr className="text-left text-muted-foreground"><th>Insumo</th><th className="text-right">Qtd.</th><th>Un.</th></tr></thead>
                  <tbody>
                    {item.recipe.map((r) => (
                      <tr key={r.material} className="border-t border-border/50"><td>{r.material}{r.preparation ? " (preparo da casa)" : ""}</td><td className="text-right">{r.quantity}</td><td className="pl-2">{r.unit}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
            {draft.notes.map((n) => <p key={n} className="text-[11px] text-amber-500">{n}</p>)}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void download()}><Download className="mr-2 h-4 w-4" /> Baixar ficha (ZIP)</Button>
              <Button variant="outline" asChild><Link to="/admin?sec=menu&import=1">Cadastrar no cardápio</Link></Button>
            </div>
            <p className="text-[11px] text-muted-foreground">Para cadastrar, abra Importar com IA e envie o arquivo baixado. Nada foi gravado ainda.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
