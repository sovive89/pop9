import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ExternalLink, ImagePlus, Palette, RotateCcw, Trash2 } from "lucide-react";
import { SOCIALS } from "@/lib/brandSocial";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PAGE_HELP } from "@/lib/page-help";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentBusinessUnit } from "@/hooks/useCurrentBusinessUnit";
import { useUnitRoles } from "@/hooks/useUnitRoles";
import { EMPTY_BRAND, INFO_LIMITS, brandAssetPrefix, brandCssVars, brandWarnings, cleanInfo, normalizeSocial, sanitizeBrand, type Brand, type InfoKey, type SocialKey } from "../../../supabase/functions/_shared/brand";

// brand_settings ainda não está nos tipos gerados do Supabase.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as { from: (table: string) => any };
const FIELDS = "*";


const INFOS: { key: InfoKey; label: string; placeholder: string; rows: number }[] = [
  { key: "about_text", label: "Sobre a loja", placeholder: "Hambúrguer artesanal desde 2015...", rows: 3 },
  { key: "address", label: "Endereço", placeholder: "Rua Exemplo, 123 - Centro, Cidade/UF", rows: 2 },
  { key: "opening_hours", label: "Horário de funcionamento", placeholder: "Ter a Dom, 18h às 23h", rows: 2 },
];
const socialInputs = (b: Brand) => Object.fromEntries(SOCIALS.map(({ key }) => [key, b[key] ?? ""])) as Record<SocialKey, string>;
const MAX_BYTES = 3 * 1024 * 1024;
const TYPES = ["image/png", "image/jpeg", "image/webp"];

const COLORS: { key: keyof Brand; label: string; hint: string; fallback: string }[] = [
  { key: "primary_color", label: "Cor principal", hint: "Botões e destaques", fallback: "#f59e0b" },
  { key: "background_color", label: "Fundo", hint: "Cor da página", fallback: "#1a1714" },
  { key: "card_color", label: "Cartões", hint: "Fundo dos itens", fallback: "#221f1c" },
  { key: "text_color", label: "Texto", hint: "Nomes, preços e descrições", fallback: "#eeeae4" },
];

type ImageKey = "logo_url" | "background_url";
type ImageFieldProps = { k: ImageKey; label: string; hint: string; value: string | null; disabled: boolean; uploading: boolean; onFile: (file: File | undefined) => void; onRemove: () => void };

// Fora do BrandTab para manter a identidade do componente entre renders (não perde o foco).
function ImageField({ k, label, hint, value, disabled, uploading, onFile, onRemove }: ImageFieldProps) {
  return (
    <div className="space-y-2 rounded-xl border border-border bg-card p-4">
      <p className="font-medium">{label}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
      {value && <img src={value} alt="" className={k === "logo_url" ? "h-16 max-w-[12rem] object-contain" : "h-24 w-full rounded-lg object-cover"} />}
      <div className="flex flex-wrap gap-2">
        <label className={`inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm ${disabled ? "pointer-events-none opacity-50" : ""}`}>
          <ImagePlus className="h-4 w-4" aria-hidden /> {uploading ? "Enviando..." : value ? "Trocar" : "Enviar imagem"}
          <input type="file" accept={TYPES.join(",")} className="sr-only" disabled={disabled}
            onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        {value && <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={onRemove}><Trash2 className="h-4 w-4" /> Remover</Button>}
      </div>
    </div>
  );
}

const IMAGE_KEYS: ImageKey[] = ["logo_url", "background_url"];

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
  // O dono digita "@loja" ou o link; o valor salvo é sempre o link https padronizado.
  const [socialRaw, setSocialRaw] = useState<Record<SocialKey, string>>(socialInputs(EMPTY_BRAND));
  // Unidade ativa agora: respostas que chegam depois de trocar de unidade são ignoradas.
  const activeUnit = useRef(unit);
  activeUnit.current = unit;
  // Imagens enviadas nesta edição e ainda não salvas (apagadas se forem descartadas).
  const pendingUploads = useRef<Set<string>>(new Set());
  const bucketPrefix = `${base.replace(/\/+$/, "")}/storage/v1/object/public/brand-assets/`;
  const removeAssets = (urls: (string | null | undefined)[]) => {
    const paths = urls.filter((u): u is string => Boolean(u && u.startsWith(bucketPrefix))).map((u) => u.slice(bucketPrefix.length));
    if (paths.length) void supabase.storage.from("brand-assets").remove(paths).then(({ error }) => { if (error) console.error("brand cleanup", error); });
  };

  useEffect(() => {
    if (!unit) return;
    let cancelled = false;
    pendingUploads.current.clear();
    setLoaded(null);
    void db.from("brand_settings").select(FIELDS).eq("business_unit_id", unit).maybeSingle()
      .then(({ data, error }: { data: Brand | null; error: { message: string } | null }) => {
        if (cancelled) return;
        const brand = sanitizeBrand(data, prefix);
        setLoaded({ unit, brand, error: error ? "A configuração de marca ainda não está disponível no banco desta instalação." : "" });
        setDraft(brand);
        setSocialRaw(socialInputs(brand));
      });
    return () => { cancelled = true; };
  }, [unit, prefix]);

  if (!unit) return <p className="text-sm text-muted-foreground">Selecione uma unidade para configurar a marca.</p>;
  const unitName = units.find((u) => u.id === unit)?.name;
  const ready = loaded?.unit === unit && !loaded.error;
  const socialInvalid = SOCIALS.filter(({ key }) => socialRaw[key].trim() && !normalizeSocial(key, socialRaw[key])).map(({ label }) => label);
  const current: Brand = { ...draft, ...Object.fromEntries(SOCIALS.map(({ key }) => [key, normalizeSocial(key, socialRaw[key])])) };
  const dirty = ready && JSON.stringify(current) !== JSON.stringify(loaded.brand);
  const disabled = !canEdit || !ready || busy !== null;
  const warnings = brandWarnings(draft);

  const upload = async (key: ImageKey, file: File | undefined) => {
    if (!file) return;
    if (!TYPES.includes(file.type)) return toast.error("Use PNG, JPG ou WEBP.");
    if (file.size > MAX_BYTES) return toast.error("A imagem deve ter no máximo 3 MB.");
    const startedFor = unit;
    setBusy(key);
    try {
      const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const path = `${startedFor}/${key === "logo_url" ? "logo" : "fundo"}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("brand-assets").upload(path, file, { contentType: file.type });
      if (error) throw error;
      const url = supabase.storage.from("brand-assets").getPublicUrl(path).data.publicUrl;
      if (activeUnit.current !== startedFor) { removeAssets([url]); return; }
      const previous = draft[key];
      if (previous && pendingUploads.current.delete(previous)) removeAssets([previous]);
      pendingUploads.current.add(url);
      setDraft((d) => ({ ...d, [key]: sanitizeBrand({ [key]: url }, prefix)[key] }));
    } catch (error) {
      console.error("brand upload", error);
      if (activeUnit.current === startedFor) toast.error("Não foi possível enviar a imagem.");
    } finally { if (activeUnit.current === startedFor) setBusy(null); }
  };

  const removeImage = (key: ImageKey) => {
    const previous = draft[key];
    if (previous && pendingUploads.current.delete(previous)) removeAssets([previous]);
    setDraft((d) => ({ ...d, [key]: null }));
  };

  const discard = () => {
    if (!loaded) return;
    removeAssets([...pendingUploads.current]);
    pendingUploads.current.clear();
    setDraft(loaded.brand);
    setSocialRaw(socialInputs(loaded.brand));
  };

  const save = async () => {
    const startedFor = unit;
    const before = loaded?.brand ?? EMPTY_BRAND;
    setBusy("save");
    try {
      const clean = sanitizeBrand(current, prefix);
      // updated_by/updated_at são preenchidos pelo banco.
      const { error } = await db.from("brand_settings").upsert({ business_unit_id: startedFor, ...clean });
      if (error) throw error;
      // Imagens trocadas ou removidas deixam de ser usadas: apaga do Storage.
      const kept = new Set(IMAGE_KEYS.map((k) => clean[k]));
      removeAssets([...IMAGE_KEYS.map((k) => before[k]), ...pendingUploads.current].filter((u) => !kept.has(u)));
      pendingUploads.current.clear();
      if (activeUnit.current !== startedFor) return;
      setLoaded({ unit: startedFor, brand: clean, error: "" });
      setDraft(clean);
      setSocialRaw(socialInputs(clean));
      toast.success("Marca salva. O cardápio do cliente já mostra o novo visual.");
    } catch (error) {
      console.error("brand save", error);
      if (activeUnit.current === startedFor) toast.error("Não foi possível salvar a marca.");
    } finally { if (activeUnit.current === startedFor) setBusy(null); }
  };

  const reset = async () => {
    const startedFor = unit;
    const before = loaded?.brand ?? EMPTY_BRAND;
    setBusy("reset");
    try {
      const { error } = await db.from("brand_settings").delete().eq("business_unit_id", startedFor);
      if (error) throw error;
      removeAssets([...IMAGE_KEYS.map((k) => before[k]), ...pendingUploads.current]);
      pendingUploads.current.clear();
      if (activeUnit.current !== startedFor) return;
      setLoaded({ unit: startedFor, brand: EMPTY_BRAND, error: "" });
      setDraft(EMPTY_BRAND);
      setSocialRaw(socialInputs(EMPTY_BRAND));
      toast.success("Visual padrão restaurado.");
    } catch (error) {
      console.error("brand reset", error);
      if (activeUnit.current === startedFor) toast.error("Não foi possível restaurar o padrão.");
    } finally { if (activeUnit.current === startedFor) setBusy(null); }
  };

  const preview = {
    ...brandCssVars(draft),
    ...(draft.background_url ? { backgroundImage: `url("${draft.background_url}")`, backgroundSize: "cover", backgroundPosition: "center" } : {}),
  } as CSSProperties;


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
            <ImageField k="logo_url" label="Logo" hint="PNG com fundo transparente fica melhor. Até 3 MB." value={draft.logo_url} disabled={disabled} uploading={busy === "logo_url"} onFile={(f) => void upload("logo_url", f)} onRemove={() => removeImage("logo_url")} />
            <ImageField k="background_url" label="Imagem de fundo" hint="Opcional. Fica atrás do cardápio. Até 3 MB." value={draft.background_url} disabled={disabled} uploading={busy === "background_url"} onFile={(f) => void upload("background_url", f)} onRemove={() => removeImage("background_url")} />
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
          <div className="space-y-3 rounded-xl border border-border bg-card p-4">
            <p className="font-medium">Redes sociais</p>
            <p className="text-xs text-muted-foreground">Pode colar o link ou só o @perfil. Aparecem como ícones no topo do cardápio.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {SOCIALS.map(({ key, label, placeholder, icon: Icon }) => {
                const invalid = socialRaw[key].trim() && !normalizeSocial(key, socialRaw[key]);
                return (
                  <label key={key} className="space-y-1 text-sm">
                    <span className="flex items-center gap-1.5"><Icon className="h-4 w-4" aria-hidden /> {label}</span>
                    <input value={socialRaw[key]} disabled={disabled} placeholder={placeholder} maxLength={200}
                      aria-invalid={Boolean(invalid)}
                      onChange={(e) => setSocialRaw((r) => ({ ...r, [key]: e.target.value }))}
                      onBlur={() => { const n = normalizeSocial(key, socialRaw[key]); if (n) setSocialRaw((r) => ({ ...r, [key]: n })); }}
                      className={`w-full rounded-md border bg-background px-3 py-2 ${invalid ? "border-destructive" : "border-border"}`} />
                    {invalid && <span className="text-xs text-destructive">Endereço de {label} inválido.</span>}
                  </label>
                );
              })}
            </div>
          </div>
          <div className="space-y-3 rounded-xl border border-border bg-card p-4">
            <p className="font-medium">Informações adicionais</p>
            <p className="text-xs text-muted-foreground">Texto simples, mostrado no cardápio do cliente.</p>
            {INFOS.map(({ key, label, placeholder, rows }) => (
              <label key={key} className="block space-y-1 text-sm">
                <span>{label}</span>
                <textarea rows={rows} value={draft[key] ?? ""} disabled={disabled} placeholder={placeholder} maxLength={INFO_LIMITS[key]}
                  onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                  onBlur={() => setDraft((d) => ({ ...d, [key]: cleanInfo(key, d[key]) }))}
                  className="w-full rounded-md border border-border bg-background px-3 py-2" />
                <span className="block text-right text-xs text-muted-foreground">{(draft[key] ?? "").length}/{INFO_LIMITS[key]}</span>
              </label>
            ))}
          </div>
          {warnings.map((w) => <p key={w} className="text-sm text-amber-500">{w}</p>)}
          <div className="flex flex-wrap gap-2">
            <Button disabled={disabled || !dirty || socialInvalid.length > 0} onClick={() => void save()}>{busy === "save" ? "Salvando..." : "Salvar marca"}</Button>
            <Button variant="outline" disabled={disabled || !dirty} onClick={discard}>Descartar alterações</Button>
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
