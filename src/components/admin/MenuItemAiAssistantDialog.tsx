import { useEffect, useState } from "react";
import { FileUp, Loader2, MessageSquareText, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ACCEPTED_FILES, checkImportFile, extractMenuDraft, listImportModels, MAX_FILES, MAX_TOTAL_BYTES, type ImportModel, type MenuImportItem } from "@/lib/menuImport";
import { cropMenuImage } from "@/lib/menuImageCrop";
import { uploadImportFiles } from "@/lib/menuImport";
import { toast } from "sonner";

type Message = { role: "user" | "assistant"; content: string };
const isImage = (file: File) => file.type.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(file.name);

export default function MenuItemAiAssistantDialog({
  businessUnitId, open, onOpenChange, onUseDraft, initialMode = "chat",
}: {
  businessUnitId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUseDraft: (draft: MenuImportItem, photo: File | null) => void;
  initialMode?: "files" | "chat";
}) {
  const [models, setModels] = useState<ImportModel[]>([]);
  const [model, setModel] = useState("");
  const [modelsLoading, setModelsLoading] = useState(false);
  const [warning, setWarning] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState<MenuImportItem | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [photoCrop, setPhotoCrop] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!photoCrop) { setPhotoPreview(""); return; }
    const url = URL.createObjectURL(photoCrop); setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photoCrop]);

  useEffect(() => {
    if (!open || !businessUnitId) return;
    let cancelled = false;
    setModelsLoading(true);
    void listImportModels(businessUnitId).then(({ models: available, warning: notice }) => {
      if (cancelled) return;
      setModels(available); setModel(current => available.some(row => row.id === current) ? current : available[0]?.id ?? ""); setWarning(notice);
    }).catch(error => { if (!cancelled) setWarning(error instanceof Error ? error.message : "Não foi possível carregar os modelos de IA."); })
      .finally(() => { if (!cancelled) setModelsLoading(false); });
    return () => { cancelled = true; };
  }, [open, businessUnitId]);

  const reset = () => { setMessages([]); setDraft(null); setNotes([]); setInput(""); setFiles([]); setPhotoCrop(null); setWarning(""); };
  const close = (next: boolean) => { if (busy) return; onOpenChange(next); if (!next) reset(); };
  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const next = [...files, ...Array.from(list)];
    if (next.length > MAX_FILES) { setWarning(`Envie no máximo ${MAX_FILES} arquivos.`); return; }
    if (next.reduce((total, file) => total + file.size, 0) > MAX_TOTAL_BYTES) { setWarning("Os arquivos somam mais de 20 MB. Envie em partes."); return; }
    const problem = next.map(checkImportFile).find(Boolean);
    if (problem) { setWarning(problem); return; }
    setWarning(""); setFiles(next);
  };

  const send = async () => {
    if (!businessUnitId || !model || busy) return;
    const request = input.trim() || (files.length ? "Leia os arquivos anexados e monte um único item do cardápio com o que estiver explícito." : "");
    if (!request) return;
    const nextMessages = [...messages, { role: "user" as const, content: request }].slice(-10);
    const context = [
      "Monte ou revise um único item do cardápio. Considere o histórico abaixo; aplique a solicitação mais recente ao rascunho atual.",
      draft ? `RASCUNHO ATUAL (dados propostos pela IA; revise): ${JSON.stringify(draft)}` : "Ainda não existe rascunho.",
      ...nextMessages.map(message => `${message.role === "user" ? "Administrador" : "Assistente"}: ${message.content}`),
      "Retorne somente o objeto JSON no formato de criação de cardápio definido pelo sistema.",
    ].join("\n").slice(-12000);
    setBusy(true); setInput(""); setWarning("");
    try {
      const paths = files.length ? await uploadImportFiles(businessUnitId, files) : [];
      const result = await extractMenuDraft({ businessUnitId, model, files: paths, text: context, mode: "create" });
      const generated = result.draft.items[0];
      if (!generated) throw new Error("Não consegui montar um item. Descreva o nome e os detalhes principais e tente novamente.");
      let cropped: File | null = photoCrop;
      if (generated.imageCrop) {
        const images = files.filter(isImage);
        const source = images[generated.imageCrop.fileIndex - 1];
        if (source) {
          try { cropped = await cropMenuImage(source, generated.imageCrop); }
          catch (error) { setWarning(error instanceof Error ? `A foto foi identificada, mas o recorte falhou: ${error.message}` : "A foto foi identificada, mas não foi possível recortá-la."); }
        } else setWarning("A IA apontou uma imagem que não está mais selecionada. Mantenha os arquivos e peça para refazer o recorte.");
      }
      if (cropped) setPhotoCrop(cropped);
      setDraft(generated); setNotes(result.warnings);
      const summary = `Preparei “${generated.name}”${generated.price > 0 ? `, preço sugerido/informado R$ ${generated.price.toFixed(2).replace(".", ",")}` : ", sem preço definido"}${cropped ? " e recortei uma foto do item" : ""}. Revise a ficha e diga o que quer ajustar, ou use o rascunho no formulário.`;
      setMessages([...nextMessages, { role: "assistant", content: summary }]);
    } catch (error) {
      setMessages(nextMessages);
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar o rascunho.");
    } finally { setBusy(false); }
  };

  const title = initialMode === "files" ? "Criar item de documento ou foto" : "Assistente de IA para item";
  return <Dialog open={open} onOpenChange={close}>
    <DialogContent className="flex max-h-[90dvh] w-[calc(100%-1rem)] max-w-2xl flex-col gap-4 overflow-hidden p-4 sm:p-6">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><MessageSquareText className="h-5 w-5 text-primary" /> {title}</DialogTitle>
        <DialogDescription>Descreva um item ou anexe documento/foto. A IA gera um rascunho; se uma foto de produto estiver clara na imagem, tentará recortá-la automaticamente. Revise os campos e a foto antes de salvar. Nada é publicado nem movimenta estoque automaticamente.</DialogDescription>
      </DialogHeader>
      {warning && <p role="status" className="rounded-md border p-2 text-xs text-muted-foreground">{warning}</p>}
      <div className="min-h-0 space-y-3 overflow-y-auto rounded-lg border bg-muted/20 p-3" aria-live="polite">
        {!messages.length && <p className="text-sm text-muted-foreground">Ex.: “Crie um X-burger com pão brioche, blend de 160 g, cheddar e molho da casa. Preço R$ 32,90.” Se não informar preço, a IA não deve inventar.</p>}
        {messages.map((message, index) => <div key={index} className={`max-w-[90%] rounded-lg p-3 text-sm ${message.role === "user" ? "ml-auto bg-primary text-primary-foreground" : "bg-background"}`}>
          <p className="mb-1 text-[10px] font-semibold uppercase opacity-70">{message.role === "user" ? "Você" : "Assistente"}</p>{message.content}
        </div>)}
        {busy && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Preparando/revisando o rascunho…</div>}
      </div>
      <div className="space-y-2">
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed p-3 text-sm hover:bg-muted/40">
          <FileUp className="h-4 w-4 text-primary" /><span className="flex-1">Adicionar documento ou foto</span>
          <span className="text-xs text-muted-foreground">PDF, foto, Word, planilhas e texto · máx. {MAX_FILES} arquivos, 10 MB cada, 20 MB total</span>
          <input type="file" multiple accept={ACCEPTED_FILES} className="sr-only" disabled={busy} onChange={event => { addFiles(event.target.files); event.target.value = ""; }} />
        </label>
        {files.length > 0 && <ul className="space-y-1">{files.map((file, index) => <li key={`${file.name}-${index}`} className="flex items-center justify-between gap-2 rounded border px-2 py-1 text-xs"><span className="truncate">{file.name}</span><Button type="button" size="icon" variant="ghost" className="h-7 w-7" disabled={busy} aria-label={`Remover ${file.name}`} onClick={() => setFiles(rows => rows.filter((_, i) => i !== index))}><Trash2 className="h-3.5 w-3.5" /></Button></li>)}</ul>}
        {files.some(isImage) && <p className="text-[11px] text-muted-foreground">Para recortar a foto do produto automaticamente, envie JPG, PNG ou WebP. Outros formatos são lidos para extrair os dados; o recorte automático não se aplica a páginas PDF ou imagens internas de documentos.</p>}
        <Textarea value={input} onChange={event => setInput(event.target.value)} maxLength={2000} disabled={busy || !models.length} placeholder={draft ? "O que deseja alterar? Ex.: troque cheddar por prato e retire a cebola." : "Descreva um item, seus ingredientes, preço e ficha técnica…"} className="min-h-20" />
      </div>
      {draft && <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
        <div className="flex items-center justify-between gap-2"><p className="font-semibold">Rascunho atual: {draft.name}</p><span>{draft.price > 0 ? `R$ ${draft.price.toFixed(2).replace(".", ",")}` : "Preço pendente"}</span></div>
        <p className="text-xs text-muted-foreground">Categoria: {draft.category || "não definida"} · {draft.ingredients.length} ingredientes visíveis · {draft.recipe.length} linhas de ficha técnica</p>
        {photoPreview && <div className="flex items-start gap-3"><img src={photoPreview} alt={`Recorte sugerido para ${draft.name}`} className="h-24 w-24 rounded-md border object-cover" /><div className="space-y-1"><p className="text-xs">Foto recortada automaticamente — confirme no formulário.</p><Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setPhotoCrop(null)}>Remover foto</Button></div></div>}
        {notes.length > 0 && <ul className="list-disc space-y-1 pl-5 text-xs text-amber-700">{notes.map((note, index) => <li key={index}>{note}</li>)}</ul>}
        <Button type="button" className="w-full gap-2" disabled={busy} onClick={() => { onUseDraft(draft, photoCrop); reset(); }}><Sparkles className="h-4 w-4" /> Revisar no formulário do item</Button>
      </div>}
      <label className="space-y-1 text-xs font-medium" htmlFor="menu-item-assistant-model">Modelo de IA
        <select id="menu-item-assistant-model" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={model} disabled={modelsLoading || busy || !models.length} onChange={event => setModel(event.target.value)}>
          {!models.length && <option value="">{modelsLoading ? "Carregando modelos…" : "Nenhum modelo disponível"}</option>}
          {models.map(row => <option key={row.id} value={row.id}>{row.label}</option>)}
        </select>
      </label>
      <DialogFooter className="flex-row justify-between gap-2 sm:justify-between">
        <Button type="button" variant="outline" disabled={busy || !messages.length} onClick={reset}>Recomeçar</Button>
        <div className="flex gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => close(false)}>Cancelar</Button><Button type="button" disabled={busy || modelsLoading || !model || (!input.trim() && !files.length)} onClick={() => void send()}>{busy ? "Aguarde…" : draft ? "Revisar com IA" : "Montar rascunho"}</Button></div>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
