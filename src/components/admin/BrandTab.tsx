import { useEffect, useState, type CSSProperties } from "react";
import { ExternalLink, ImagePlus, Palette, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PAGE_HELP } from "@/lib/page-help";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentBusinessUnit } from "@/hooks/useCurrentBusinessUnit";
import { useUnitRoles } from "@/hooks/useUnitRoles";
import { EMPTY_BRAND, brandAssetPrefix, brandCssVars, brandWarnings, sanitizeBrand, type Brand } from "../../../supabase/functions/_shared/brand";

// brand_settings ainda não está nos tipos gerados do Supabase.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as { from: (table: string) => any };
const FIELDS = "logo_url,background_url,primary_color,background_color,card_color,text_color";
const MAX_BYTES = 3 * 1024 * 1024;
const TYPES = ["image/png", "image/jpeg", "image/webp"];

const COLORS: { key: keyof Brand; label: string; hint: string; fallback: string }[] = [
  { key: "primary_color", label: "Cor principal", hint: "Botões e destaques", fallback: "#f59e0b" },
  { key: "background_color", label: "Fundo", hint: "Cor da página", fallback: "#1a1714" },
  { key: "card_color", label: "Cartões", hint: "Fundo dos itens", fallback: "#221f1c" },
  { key: "text_color", label: "Texto", hint: "Nomes, preços e descrições", fallback: "#eeeae4" },
];

/**
 * Marca da loja: logo, imagem de fundo e cores. Vale SOMENTE para o cardápio do
 * cliente (/pedir/:unidade); o layout das páginas não muda e o painel interno não é afetado.
 */
export default function BrandTab() {
  const { businessUnitId: unit, units } = useCurrentBusinessUnit();
  const { roles, loading: rolesLoading } = useUnitRoles();
  const canEdit = !rolesLoading && roles.includes("admin");
  const base = import.meta.env.VITE_SUPABASE_URL ?? "";
  const prefix = unit ? brandAssetPrefix(base, unit) : "";
  const [loaded, setLoaded] = useState<{ unit: string; brand: Brand; error: string } | null>(null);
  const [draft, setDraft] = useState<Brand>(EMPTY_BRAND);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!unit) return;
    let cancelled = false;
    setLoaded(null);
    void db.from("brand_settings").select(FIELDS).eq("business_unit_id", unit).maybeSingle()
      .then(({ data, error }: { data: Brand | null; error: { message: string } | null }) => {
        if (cancelled) return;
        const brand = sanitizeBrand(data, prefix);
        setLoaded({ unit, brand, error: error ? "A configuração de marca ainda não está disponível no banco desta instalação." : "" });
        setDraft(brand);
      });
    return () => { cancelled = true; };
  }, [unit, prefix]);

  if (!unit) return <p className="text-sm text-muted-foreground">Selecione uma unidade para configurar a marca.</p>;
  const unitName = units.find((u) => u.id === unit)?.name;
  const ready = loaded?.unit === unit && !loaded.error;
  const dirty = ready && JSON.stringify(draft) !== JSON.stringify(loaded.brand);
  const disabled = !canEdit || !ready || busy !== null;
  const warnings = brandWarnings(draft);

  const upload = async (key: "logo_url" | "background_url", file: File | undefined) => {
    if (!file) return;
    if (!TYPES.includes(file.type)) return toast.error("Use PNG, JPG ou WEBP.");
    if (file.size > MAX_BYTES) return toast.error("A imagem deve ter no máximo 3 MB.");
    setBusy(key);
    try {
      const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const path = `${unit}/${key === "logo_url" ? "logo" : "fundo"}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("brand-assets").upload(path, file, { contentType: file.type });
      if (error) throw error;
      const url = supabase.storage.from("brand-assets").getPublicUrl(path).data.publicUrl;
      setDraft((d) => ({ ...d, [key]: sanitizeBrand({ [key]: url }, prefix)[key] }));
    } catch (error) {
      console.error("brand upload", error);
      toast.error("Não foi possível enviar a imagem.");
    } finally { setBusy(null); }
  };

  const save = async () => {
    setBusy("save");
    try {
      const clean = sanitizeBrand(draft, prefix);
      const { error } = await db.from("brand_settings").upsert({ business_unit_id: unit, ...clean, updated_at: new Date().toISOString() });
      if (error) throw error;
      setLoaded({ unit, brand: clean, error: "" });
      setDraft(clean);
      toast.success("Marca salva. O cardápio do cliente já mostra o novo visual.");
    } catch (error) {
      console.error("brand save", error);
      toast.error("Não foi possível salvar a marca.");
    } finally { setBusy(null); }
  };

  const reset = async () => {
    setBusy("reset");
    try {
      const { error } = await db.from("brand_settings").delete().eq("business_unit_id", unit);
      if (error) throw error;
      setLoaded({ unit, brand: EMPTY_BRAND, error: "" });
      setDraft(EMPTY_BRAND);
      toast.success("Visual padrão restaurado.");
    } catch (error) {
      console.error("brand reset", error);
      toast.error("Não foi possível restaurar o padrão.");
    } finally { setBusy(null); }
  };

  const preview = {
    ...brandCssVars(draft),
    ...(draft.background_url ? { backgroundImage: `url("${draft.background_url}")`, backgroundSize: "cover", backgroundPosition: "center" } : {}),
  } as CSSProperties;

  const ImageField = ({ k, label, hint }: { k: "logo_url" | "background_url"; label: string; hint: string }) => (
    <div className="space-y-2 rounded-xl border border-border bg-card p-4">
      <p className="font-medium">{label}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
      {draft[k] && <img src={draft[k]!} alt="" className={k === "logo_url" ? "h-16 max-w-[12rem] object-contain" : "h-24 w-full rounded-lg object-cover"} />}
      <div className="flex flex-wrap gap-2">
        <label className={`inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm ${disabled ? "pointer-events-none opacity-50" : ""}`}>
          <ImagePlus className="h-4 w-4" aria-hidden /> {busy === k ? "Enviando..." : draft[k] ? "Trocar" : "Enviar imagem"}
          <input type="file" accept={TYPES.join(",")} className="sr-only" disabled={disabled}
            onChange={(e) => { void upload(k, e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        {draft[k] && <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => setDraft((d) => ({ ...d, [k]: null }))}><Trash2 className="h-4 w-4" /> Remover</Button>}
      </div>
    </div>
  );

  return (
    <section className="space-y-6">
      <div>
        <h2 tabIndex={0} data-tooltip={PAGE_HELP["brand"]} className="flex items-center gap-2 text-lg font-semibold"><Palette className="h-5 w-5 text-primary" aria-hidden /> Marca</h2>
        <p className="text-sm text-muted-foreground">{unitName} · muda só o cardápio que o cliente vê. A estrutura das páginas e o painel interno não mudam.</p>
        {!rolesLoading && !canEdit && <p role="status" className="text-sm text-amber-500">Só um administrador desta unidade pode alterar a marca.</p>}
        {loaded?.unit === unit && loaded.error && <p role="alert" className="text-sm text-destructive">{loaded.error}</p>}
        {loaded?.unit !== unit && <p role="status" className="text-sm text-muted-foreground">Carregando...</p>}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <ImageField k="logo_url" label="Logo" hint="PNG com fundo transparente fica melhor. Até 3 MB." />
            <ImageField k="background_url" label="Imagem de fundo" hint="Opcional. Fica atrás do cardápio. Até 3 MB." />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {COLORS.map(({ key, label, hint, fallback }) => (
              <div key={key} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                <input type="color" aria-label={label} disabled={disabled} value={draft[key] ?? fallback}
                  onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value.toLowerCase() }))}
                  className="h-10 w-12 shrink-0 cursor-pointer rounded border border-border bg-transparent" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground">{draft[key] ?? "Padrão do sistema"} · {hint}</p>
                </div>
                {draft[key] && <Button type="button" variant="ghost" size="sm" disabled={disabled} aria-label={`Voltar ${label} ao padrão`} onClick={() => setDraft((d) => ({ ...d, [key]: null }))}><RotateCcw className="h-4 w-4" /></Button>}
              </div>
            ))}
          </div>
          {warnings.map((w) => <p key={w} className="text-sm text-amber-500">{w}</p>)}
          <div className="flex flex-wrap gap-2">
            <Button disabled={disabled || !dirty} onClick={() => void save()}>{busy === "save" ? "Salvando..." : "Salvar marca"}</Button>
            <Button variant="outline" disabled={disabled || !dirty} onClick={() => loaded && setDraft(loaded.brand)}>Descartar alterações</Button>
            <Button variant="ghost" disabled={disabled} onClick={() => void reset()}>Restaurar visual padrão</Button>
            <a href={`/pedir/${unit}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-2 text-sm text-primary underline-offset-4 hover:underline">Abrir cardápio do cliente <ExternalLink className="h-3.5 w-3.5" /></a>
          </div>
        </div>

        <div aria-label="Prévia do cardápio" style={preview} className="space-y-3 self-start rounded-2xl border border-border bg-background p-4 text-foreground">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Prévia</p>
          {draft.logo_url && <img src={draft.logo_url} alt="" className="h-12 max-w-[10rem] object-contain" />}
          <p className={`text-lg font-bold ${draft.background_url ? "inline-block rounded bg-card/90 px-2" : ""}`}>{unitName ?? "Sua loja"}</p>
          <div className="space-y-1 rounded-xl border border-border bg-card p-3 text-card-foreground">
            <p className="font-semibold">X-Burguer da casa</p>
            <p className="text-sm text-muted-foreground">Pão brioche, blend 160 g, queijo.</p>
            <p>R$ 32,00</p>
            <span className="inline-block rounded-md bg-primary px-3 py-1 text-sm text-primary-foreground">Adicionar</span>
          </div>
        </div>
      </div>
    </section>
  );
}
