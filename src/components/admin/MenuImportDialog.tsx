import { useEffect, useRef, useState } from "react";
import { FileUp, Loader2, Plus, Trash2, Sparkles, AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Info, Wand2 } from "lucide-react";
import { reviewItem } from "@/lib/menuImportGuide";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCurrentBusinessUnit } from "@/hooks/useCurrentBusinessUnit";
import {
  ACCEPTED_FILES, MAX_FILES, applyMenuImport, checkImportFile, extractMenuDraft, listImportModels, uploadImportFiles,
  type ApplyResult, type ImportModel, type MenuImportDraft, type MenuImportItem, type MenuImportRecipeLine,
} from "@/lib/menuImport";

type Step = "upload" | "reading" | "review" | "saving" | "done";
const UNITS = ["g", "kg", "ml", "l", "un", "cx", "pct", "dz"];
const cell = "h-9 min-w-0 text-xs";

export default function MenuImportDialog({ open, onOpenChange, onImported }: { open: boolean; onOpenChange: (open: boolean) => void; onImported: () => void }) {
  const { businessUnitId } = useCurrentBusinessUnit();
  const [step, setStep] = useState<Step>("upload");
  const [files, setFiles] = useState<File[]>([]);
  const [pasted, setPasted] = useState("");
  const [models, setModels] = useState<{ list: ImportModel[]; warning: string; loading: boolean }>({ list: [], warning: "", loading: false });
  const [model, setModel] = useState("");
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<MenuImportDraft | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [publish, setPublish] = useState(false);
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [knownUnits, setKnownUnits] = useState<Record<string, string>>({});
  const [guided, setGuided] = useState(true);
  const [cursor, setCursor] = useState(0);
  // Um id por rascunho revisado: reenviar após falha de rede não duplica a gravação.
  const requestId = useRef(crypto.randomUUID());

  useEffect(() => {
    if (!open || !businessUnitId) return;
    let cancelled = false;
    setModels(m => ({ ...m, loading: true }));
    listImportModels(businessUnitId)
      .then(({ models: list, warning }) => { if (!cancelled) { setModels({ list, warning, loading: false }); setModel(prev => list.some(m => m.id === prev) ? prev : list[0]?.id ?? ""); } })
      .catch(e => { if (!cancelled) setModels({ list: [], warning: e.message, loading: false }); });
    return () => { cancelled = true; };
  }, [open, businessUnitId]);

  const reset = () => {
    setStep("upload"); setFiles([]); setPasted(""); setError(""); setDraft(null); setWarnings([]); setConflicts([]);
    setPublish(false); setResult(null); setKnownUnits({}); setGuided(true); setCursor(0); requestId.current = crypto.randomUUID();
  };
  const close = (value: boolean) => {
    if (step === "reading" || step === "saving") return;
    onOpenChange(value);
    if (!value) reset();
  };

  const pickFiles = (list: FileList | null) => {
    if (!list) return;
    const next = [...files, ...Array.from(list)];
    const problem = next.length > MAX_FILES ? `Envie no máximo ${MAX_FILES} arquivos por vez.` : next.map(checkImportFile).find(Boolean);
    if (problem) { setError(problem); return; }
    setError(""); setFiles(next);
  };

  const read = async () => {
    if (!businessUnitId || !model || (!files.length && !pasted.trim())) return;
    setStep("reading"); setError("");
    try {
      const paths = await uploadImportFiles(businessUnitId, files);
      const extracted = await extractMenuDraft({ businessUnitId, model, files: paths, text: pasted });
      setDraft(extracted.draft); setWarnings(extracted.warnings); setConflicts(extracted.conflicts); setKnownUnits(extracted.knownUnits); setCursor(0);
      requestId.current = crypto.randomUUID();
      setStep("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao ler os arquivos."); setStep("upload");
    }
  };

  const save = async () => {
    if (!businessUnitId || !draft?.items.length) return;
    setStep("saving"); setError("");
    try {
      const applied = await applyMenuImport({ businessUnitId, requestId: requestId.current, draft, publish });
      setResult(applied); setStep("done"); onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao gravar o cardápio."); setStep("review");
    }
  };

  // Edições do rascunho: qualquer mudança gera um novo id, pois passa a ser outro conteúdo.
  const edit = (update: (d: MenuImportDraft) => MenuImportDraft) => {
    setDraft(d => d ? update(d) : d); requestId.current = crypto.randomUUID();
  };
  const editItem = (index: number, patch: Partial<MenuImportItem>) =>
    edit(d => ({ ...d, items: d.items.map((it, i) => i === index ? { ...it, ...patch } : it) }));
  const editLine = (index: number, line: number, patch: Partial<MenuImportRecipeLine>) =>
    edit(d => ({ ...d, items: d.items.map((it, i) => i === index ? { ...it, recipe: it.recipe.map((l, j) => j === line ? { ...l, ...patch } : l) } : it) }));

  const invalid = draft?.items.some(it => !it.name.trim() || it.price < 0 || it.recipe.some(l => !l.material.trim() || !l.unit || !(l.quantity > 0))) ?? true;
  const unpriced = draft?.items.filter(it => !(it.price > 0)).length ?? 0;

  const renderItem = (item: MenuImportItem, index: number) => <section key={index} className="space-y-3 rounded-xl border p-3" aria-label={`Item ${item.name || index + 1}`}>
    <div className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
      <Input aria-label="Nome do item" className={cell} value={item.name} onChange={e => editItem(index, { name: e.target.value })} />
      <select aria-label="Categoria" className="h-9 rounded-md border bg-background px-2 text-xs" value={item.category} onChange={e => editItem(index, { category: e.target.value })}>
        {draft.categories.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
      </select>
      <Input aria-label="Preço" className={cell} type="number" min="0" step="0.01" value={item.price || ""} placeholder="Preço" onChange={e => editItem(index, { price: Number(e.target.value) || 0 })} />
      <Button type="button" size="icon" variant="ghost" aria-label={`Remover ${item.name}`} onClick={() => edit(d => ({ ...d, items: d.items.filter((_, i) => i !== index) }))}><Trash2 className="h-4 w-4" /></Button>
    </div>
    <Input aria-label="Descrição" className={cell} value={item.description} placeholder="Descrição" onChange={e => editItem(index, { description: e.target.value })} />
    {item.ingredients.length > 0 && <p className="text-xs text-muted-foreground">Ingredientes do cardápio: {item.ingredients.map(i => i.name).join(", ")}</p>}
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Ficha técnica (por unidade vendida)</p>
      {item.recipe.map((line, j) => <div key={j} className="space-y-1">
        <div className="grid grid-cols-[2fr_1fr_1fr_auto] gap-2">
          <Input aria-label="Insumo" className={cell} value={line.material} onChange={e => editLine(index, j, { material: e.target.value })} />
          <Input aria-label="Quantidade" className={cell} type="number" min="0" step="any" value={line.quantity || ""} onChange={e => editLine(index, j, { quantity: Number(e.target.value) || 0 })} />
          <select aria-label="Unidade" className="h-9 rounded-md border bg-background px-2 text-xs" value={line.unit} onChange={e => editLine(index, j, { unit: e.target.value })}>
            {[...new Set([line.unit, ...UNITS])].map(u => <option key={u} value={u}>{u}</option>)}
          </select>
          <Button type="button" size="icon" variant="ghost" aria-label={`Remover ${line.material}`} onClick={() => editItem(index, { recipe: item.recipe.filter((_, k) => k !== j) })}><Trash2 className="h-4 w-4" /></Button>
        </div>
        {line.preparation && <p className="pl-2 text-xs text-muted-foreground">Preparo da casa — receita para {line.preparation.outputQuantity} {line.unit}: {line.preparation.inputs.map(b => `${b.material} ${b.quantity} ${b.unit}`).join(", ")}
          <button type="button" className="ml-2 underline" onClick={() => editLine(index, j, { preparation: null })}>remover receita</button></p>}
      </div>)}
      <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => editItem(index, { recipe: [...item.recipe, { material: "", unit: "g", quantity: 0, preparation: null }] })}><Plus className="h-3 w-3" /> Adicionar insumo</Button>
    </div>
  </section>;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="flex max-h-[92dvh] w-[calc(100%-1rem)] max-w-4xl flex-col gap-4 overflow-hidden p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /> Montar cardápio a partir de arquivos</DialogTitle>
          <DialogDescription>A IA lê cardápios e fichas técnicas e prepara um rascunho. Você revisa e só então grava. Nada é lançado no estoque real.</DialogDescription>
        </DialogHeader>

        {error && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

        {(step === "upload" || step === "reading") && <div className="min-h-0 space-y-4 overflow-y-auto">
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border p-6 text-center text-sm hover:bg-muted/40"
            data-tooltip="PDF, fotos (JPG, PNG, WebP), planilhas (XLSX, CSV) ou TXT. Até 5 arquivos de 10 MB.">
            <FileUp className="h-8 w-8 text-primary" />
            <span className="font-medium">Escolher arquivos do cardápio e das fichas técnicas</span>
            <span className="text-xs text-muted-foreground">PDF, foto, planilha ou texto · até {MAX_FILES} arquivos de 10 MB</span>
            <input type="file" multiple accept={ACCEPTED_FILES} className="sr-only" aria-label="Arquivos do cardápio" disabled={step === "reading"}
              onChange={e => { pickFiles(e.target.files); e.target.value = ""; }} />
          </label>
          {files.length > 0 && <ul className="space-y-1 text-sm">{files.map((f, i) => <li key={i} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
            <span className="truncate">{f.name}</span>
            <Button type="button" size="icon" variant="ghost" aria-label={`Remover ${f.name}`} disabled={step === "reading"} onClick={() => setFiles(files.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
          </li>)}</ul>}
          <label className="block space-y-1 text-sm">Ou cole o texto do cardápio / ficha técnica
            <Textarea value={pasted} maxLength={60000} disabled={step === "reading"} onChange={e => setPasted(e.target.value)} className="min-h-24" placeholder="Ex.: X-Burger R$ 29,90 — pão brioche 1 un, blend 150 g, molho da casa 30 g..." />
          </label>
          <label className="block space-y-1 text-sm">Modelo de IA
            <select aria-label="Modelo de IA" className="w-full rounded-md border bg-background p-2" value={model} disabled={models.loading || step === "reading"} onChange={e => setModel(e.target.value)}>
              {!models.list.length && <option value="">{models.loading ? "Carregando..." : "Nenhum modelo disponível"}</option>}
              {models.list.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </label>
          {!models.loading && (!models.list.length || models.warning) && <p className="text-xs text-muted-foreground">{models.warning || "Conecte a IA da unidade em Conexões para usar a importação."}</p>}
          <p className="text-xs text-muted-foreground">Os arquivos são enviados ao provedor de IA escolhido só para esta leitura e apagados em seguida.</p>
          <Button className="w-full gap-2" disabled={step === "reading" || !model || (!files.length && !pasted.trim())} onClick={() => void read()}>
            {step === "reading" ? <><Loader2 className="h-4 w-4 animate-spin" /> Lendo arquivos... pode levar até 2 minutos</> : <><Sparkles className="h-4 w-4" /> Ler e montar rascunho</>}
          </Button>
        </div>}

        {(step === "review" || step === "saving") && draft && <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
          {(conflicts.length > 0 || warnings.length > 0 || draft.notes.length > 0) && <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <p className="flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4" /> Confira antes de gravar</p>
            {conflicts.length > 0 && <div><p className="font-medium">Unidade diferente da já cadastrada (ajuste para a mesma unidade, senão a gravação é recusada):</p><ul className="ml-5 list-disc">{conflicts.map(c => <li key={c}>{c}</li>)}</ul></div>}
            {[...warnings, ...draft.notes].length > 0 && <ul className="ml-5 list-disc text-muted-foreground">{[...warnings, ...draft.notes].map((w, i) => <li key={i}>{w}</li>)}</ul>}
          </div>}

          <p className="text-sm text-muted-foreground">{draft.items.length} itens em {draft.categories.length} categorias. Na revisão guiada, cada item mostra o que falta e por quê; use “Corrigir” quando houver uma correção segura. Itens com o mesmo nome de um já existente serão pulados, sem sobrescrever.</p>

          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Modo de revisão">
            <Button type="button" size="sm" role="tab" aria-selected={guided} variant={guided ? "default" : "outline"} onClick={() => setGuided(true)} className="gap-1"><Wand2 className="h-4 w-4" /> Revisão guiada</Button>
            <Button type="button" size="sm" role="tab" aria-selected={!guided} variant={!guided ? "default" : "outline"} onClick={() => setGuided(false)}>Ver todos os itens</Button>
          </div>

          {guided && draft.items.length > 0 && (() => {
            const index = Math.min(cursor, draft.items.length - 1);
            const item = draft.items[index];
            const issues = reviewItem(item, knownUnits);
            const nextPending = draft.items.findIndex((it, i) => i > index && reviewItem(it, knownUnits).some(x => x.severity !== "tip"));
            return <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 text-sm">
                <Button type="button" size="sm" variant="outline" disabled={index === 0} onClick={() => setCursor(index - 1)} aria-label="Item anterior"><ChevronLeft className="h-4 w-4" /></Button>
                <span className="font-medium">Item {index + 1} de {draft.items.length}</span>
                <Button type="button" size="sm" variant="outline" disabled={index >= draft.items.length - 1} onClick={() => setCursor(index + 1)} aria-label="Próximo item"><ChevronRight className="h-4 w-4" /></Button>
              </div>
              <div className="space-y-2 rounded-lg border bg-muted/30 p-3 text-sm" aria-live="polite">
                {!issues.length && <p className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> Tudo certo com este item.</p>}
                {issues.map(issue => <div key={issue.id} className="space-y-1">
                  <p className={`flex items-center gap-2 font-medium ${issue.severity === "error" ? "text-destructive" : ""}`}>
                    {issue.severity === "tip" ? <Info className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}{issue.title}
                  </p>
                  <p className="text-muted-foreground">{issue.explanation}</p>
                  {issue.fix && <Button type="button" size="sm" variant="secondary" className="gap-1" onClick={() => editItem(index, issue.fix!(draft.items[index]))}><Wand2 className="h-3 w-3" /> {issue.fixLabel}</Button>}
                </div>)}
              </div>
              {renderItem(item, index)}
              <div className="flex flex-wrap gap-2">
                {nextPending > -1 && <Button type="button" size="sm" variant="outline" onClick={() => setCursor(nextPending)}>Ir para o próximo com pendência</Button>}
                {index < draft.items.length - 1 && <Button type="button" size="sm" onClick={() => setCursor(index + 1)}>Próximo item</Button>}
              </div>
            </div>;
          })()}

          {!guided && draft.items.map((item, index) => renderItem(item, index))}

          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={publish} disabled={unpriced > 0} onChange={e => setPublish(e.target.checked)} aria-label="Publicar os itens agora" />
            <span>Publicar os itens agora (visíveis para o cliente). {unpriced > 0 ? `Indisponível: ${unpriced} item(ns) sem preço.` : "Sem marcar, ficam como rascunho."}</span>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button className="gap-2" disabled={step === "saving" || invalid || !draft.items.length} onClick={() => void save()}>
              {step === "saving" ? <><Loader2 className="h-4 w-4 animate-spin" /> Gravando...</> : "Criar cardápio"}
            </Button>
            <Button variant="outline" disabled={step === "saving"} onClick={reset}>Recomeçar</Button>
          </div>
          {invalid && <p className="text-xs text-destructive">Preencha nome, insumo, unidade e quantidade maior que zero em todas as linhas.</p>}
        </div>}

        {step === "done" && result && <div className="space-y-3 text-sm" role="status">
          <p className="flex items-center gap-2 text-base font-medium"><CheckCircle2 className="h-5 w-5 text-primary" /> Cardápio gravado</p>
          <ul className="ml-5 list-disc space-y-1">
            <li>{result.itemsCreated} itens criados ({result.published ? "publicados" : "como rascunho"})</li>
            <li>{result.categoriesCreated} categorias novas</li>
            <li>{result.materialsCreated} insumos novos com saldo zero e {result.recipesCreated} receitas de preparo</li>
            <li>{result.recipeLines} linhas de ficha técnica</li>
            {result.itemsSkipped.length > 0 && <li>Pulados por já existirem: {result.itemsSkipped.join(", ")}</li>}
          </ul>
          <p className="text-muted-foreground">Compras e produção continuam sendo lançadas no Estoque quando acontecerem.</p>
          <div className="flex gap-2"><Button onClick={() => close(false)}>Concluir</Button><Button variant="outline" onClick={reset}>Importar outros arquivos</Button></div>
        </div>}
      </DialogContent>
    </Dialog>
  );
}
