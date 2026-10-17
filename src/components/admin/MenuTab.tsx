import { useState, useRef, useEffect, useCallback } from "react";
import { Flame, Plus, Trash2, Pencil, Save, X, ChevronDown, ChevronUp, Tags, ImagePlus, Image, Sparkles, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAdminData, type DbMenuItem, type DbIngredient, type DbVariant, type DbMenuCategory } from "@/hooks/useAdminData";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/utils/orders";
import { CATEGORY_ICON_OPTIONS, CATEGORY_COLORS, getCategoryIcon, safeCategoryColor, suggestCategoryIcon } from "@/utils/categoryIcons";
import { toast } from "sonner";
import type { MenuRecipeDraft } from "@/lib/recipeDraft";
import RecipeBuilder, { type RecipeBuilderHandle } from "@/components/admin/RecipeBuilder";
import { useCurrentBusinessUnit } from "@/hooks/useCurrentBusinessUnit";
import { useSearchParams } from "react-router-dom";
import MenuImportDialog from "@/components/admin/MenuImportDialog";
import MenuPrefixField from '@/components/admin/MenuPrefixField';
import { useMenuSuggestionCatalog } from '@/hooks/useMenuSuggestionCatalog';
import { useAuth } from '@/hooks/useAuth';
import { useUnitRoles } from '@/hooks/useUnitRoles';
import { usePrintSectors, sectorName } from '@/hooks/usePrintSectors';

// ── Image Upload Helper ──
// O nome do arquivo é gerado aqui (não depende do ID do item, que só existe
// depois que o banco cria o registro).
const uploadMenuImage = async (file: File, businessUnitId: string): Promise<string | null> => {
  const ext = file.name.split(".").pop();
  const path = `${businessUnitId}/uploads/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from("menu-images").upload(path, file, { upsert: true });
  if (error) {
    toast.error("Erro ao enviar imagem: " + error.message);
    return null;
  }

  const { data } = supabase.storage.from("menu-images").getPublicUrl(path);
  return data.publicUrl;
};

// Caminho no bucket menu-images a partir da URL pública (null se for externa).
const MENU_IMAGES_PREFIX = "/storage/v1/object/public/menu-images/";
const menuImagePath = (url: string | null | undefined): string | null => {
  if (!url) return null;
  const idx = url.indexOf(MENU_IMAGES_PREFIX);
  return idx === -1 ? null : decodeURIComponent(url.slice(idx + MENU_IMAGES_PREFIX.length).split("?")[0]);
};

// Remove do bucket as imagens que deixaram de ser usadas (best effort).
const removeMenuImages = async (urls: (string | null | undefined)[]) => {
  const paths = urls.map(menuImagePath).filter((p): p is string => !!p);
  if (paths.length > 0) await supabase.storage.from("menu-images").remove(paths);
};

// ── Geração de foto com IA (Edge Function generate-menu-image) ──
const AI_IMAGE_MODELS = [
  { id: "google/gemini-2.5-flash-image", label: "Nano Banana (Google)", provider: "google" },
  { id: "openai/gpt-image-1", label: "GPT Image (OpenAI)", provider: "openai" },
  { id: "stability/stable-image-core", label: "Stable Image Core (Stability AI)", provider: "stability" },
  { id: "stability/stable-image-ultra", label: "Stable Image Ultra — premium (Stability AI)", provider: "stability" },
];

type CategoryInput = Omit<DbMenuCategory, "id"> & { id?: string };
type MenuItemInput = Omit<DbMenuItem, "id" | "sku" | "sort_order" | "ingredients" | "variants"> & {
  id?: string;
  sort_order?: number;
  ingredients: Omit<DbIngredient, "id">[];
  variants: Omit<DbVariant, "id">[];
  recipe: MenuRecipeDraft[];
};
type MenuItemSaveResult = string | false;

// ── Category Editor ──
interface CategoryEditorProps {
  category?: DbMenuCategory;
  /** Chaves já usadas na unidade, para gerar uma chave nova sem repetir. */
  existingKeys?: string[];
  onSave: (cat: CategoryInput, isNew: boolean) => Promise<boolean>;
  onCancel: () => void;
}

/** Chave interna gerada a partir do nome: "Bebidas Quentes" → "bebidas_quentes". */
const categoryKeyFrom = (label: string, taken: string[] = []) => {
  const base = label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "categoria";
  let candidate = base;
  for (let n = 2; taken.includes(candidate); n++) candidate = `${base}_${n}`;
  return candidate;
};

const ingredientsFromDescription = (description: string, fallback: Omit<DbIngredient, "id">[]) => {
  const names = description.split(",").map(value => value.trim()).filter(Boolean);
  if (names.length < 2) return fallback;
  return names.map((name, sort_order) => ({ name, removable: false, extra_price: null, sort_order }));
};

const CategoryEditor = ({ category, existingKeys = [], onSave, onCancel }: CategoryEditorProps) => {
  const isNew = !category;
  const [label, setLabel] = useState(category?.label ?? "");
  // Categorias novas recebem uma sugestão legível; categorias existentes
  // preservam a chave atual para não quebrar os itens já vinculados.
  const [key, setKey] = useState(category?.key ?? categoryKeyFrom(category?.label ?? "", existingKeys));
  const [keyTouched, setKeyTouched] = useState(!isNew);
  const [destination, setDestination] = useState(category?.destination ?? "kitchen");
  const [sectorTouched, setSectorTouched] = useState(!isNew);
  const { activeSectors } = usePrintSectors();
  // Mantém o setor atual na lista mesmo se desativado, para não trocar sem querer ao editar.
  const sectorOptions = activeSectors.some((s) => s.slug === destination) ? activeSectors : [...activeSectors, { slug: destination, name: destination, active: false }];
  const [sortOrder, setSortOrder] = useState(category?.sort_order?.toString() ?? "0");
  const [saving, setSaving] = useState(false);
  const [iconName, setIconName] = useState(category?.icon_name ?? suggestCategoryIcon(category?.label ?? ""));
  const [iconColor, setIconColor] = useState(safeCategoryColor(category?.icon_color));
  const [iconTouched, setIconTouched] = useState(!!category?.icon_name);
  const [iconSearch, setIconSearch] = useState("");
  const PreviewIcon = getCategoryIcon(iconName, label);

  const handleSave = async () => {
    if (!label.trim()) {
      toast.error("Informe o nome da categoria");
      return;
    }
    setSaving(true);
    const normalizedKey = key.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
      .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
    const finalKey = isNew ? categoryKeyFrom(normalizedKey || label, existingKeys) : key;
    const ok = await onSave(
      { id: category?.id, key: finalKey, label: label.trim(), icon_name: iconName, icon_color: iconColor, destination, sort_order: parseInt(sortOrder) || 0 },
      isNew
    );
    setSaving(false);
    if (ok) onCancel();
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{isNew ? "Nova Categoria" : "Editar Categoria"}</h3>
        <button data-tooltip="Feche a edição sem salvar as alterações pendentes." aria-label="Feche a edição sem salvar as alterações pendentes." onClick={onCancel} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>
      <div className="grid grid-cols-1 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Nome</label>
          <Input value={label} onChange={(e) => {
            setLabel(e.target.value);
            if (isNew && !keyTouched) setKey(categoryKeyFrom(e.target.value, existingKeys));
            if (!iconTouched) setIconName(suggestCategoryIcon(e.target.value));
            // Setor sugerido pelo nome (bebidas → Bar) enquanto o admin não escolheu outro.
            if (isNew && !sectorTouched) setDestination(/bebida|drink|suco|refri|cerveja|chopp|vinho|cafe|café|agua|água|dose|caipir/i.test(e.target.value) ? "bar" : "kitchen");
          }} placeholder="ex: Saladas" className="h-8 text-sm" />
        </div>
      </div>
      <div className="space-y-1">
        <label htmlFor="category-key" className="text-xs font-medium text-muted-foreground">Chave (slug)</label>
        <Input id="category-key" value={key} disabled={!isNew}
          onChange={(e) => { setKey(e.target.value); setKeyTouched(true); }}
          placeholder="ex: saladas" className="h-8 font-mono text-sm" />
        <p className="text-[10px] text-muted-foreground">
          Identificador interno sugerido automaticamente a partir do nome. Sem acentos ou espaços; ajuste se necessário.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Setor</label>
          <select data-tooltip="Setor que recebe os pedidos desta categoria (crie novos em Impressoras)." aria-label="Setor que recebe os pedidos desta categoria." value={destination} onChange={(e) => { setDestination(e.target.value); setSectorTouched(true); }} className="w-full h-8 rounded-md border border-border bg-muted px-3 text-sm text-foreground">
            {sectorOptions.map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Ordem</label>
          <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="h-8 text-sm" />
          <p className="text-[10px] text-muted-foreground">Posição na lista: menor aparece primeiro (0 antes de 1).</p>
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">Ícone da categoria</label>
        <div className="flex items-center gap-3 rounded-lg border border-border p-3">
          <PreviewIcon className="h-7 w-7 shrink-0" style={{ color: iconColor }} />
          <span className="text-sm font-medium text-foreground truncate">{label || "Nova categoria"}</span>
        </div>
        <Input value={iconSearch} onChange={(e) => setIconSearch(e.target.value)} placeholder="Buscar ícone (ex.: suco, combo, açaí)..." className="h-8 text-sm" />
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-72 overflow-y-auto">
          {CATEGORY_ICON_OPTIONS.filter((option) => {
            const plain = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
            return plain(`${option.label} ${option.name}`).includes(plain(iconSearch));
          }).map(({ name, label: iconLabel, Icon }) => (
            <button key={name} type="button" title={iconLabel} aria-label={iconLabel} aria-pressed={iconName === name}
              onClick={() => { setIconName(name); setIconTouched(true); }}
              className={`flex flex-col items-center gap-1 rounded-lg border p-2 min-w-0 ${iconName === name ? "border-primary bg-primary/10" : "border-border hover:bg-muted"}`}>
              <Icon className="h-5 w-5" />
              <span className="text-[10px] truncate max-w-full">{iconLabel}</span>
            </button>
          ))}
        </div>
        <label className="text-xs font-medium text-muted-foreground">Cor do ícone</label>
        <div className="flex gap-3 flex-wrap">
          {CATEGORY_COLORS.map((color) => (
            <button key={color} type="button" aria-label={`Cor ${color}`} aria-pressed={iconColor === color}
              onClick={() => setIconColor(color)} style={{ backgroundColor: color }}
              className={`h-8 w-8 rounded-full border-2 ${iconColor === color ? "ring-2 ring-offset-2 ring-primary border-foreground" : "border-transparent"}`} />
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <Button data-tooltip="Salve as configurações preenchidas." size="sm" onClick={handleSave} disabled={saving} className="gap-1">
          <Save className="h-3.5 w-3.5" /> {saving ? "Salvando..." : "Salvar"}
        </Button>
        <Button data-tooltip="Feche a edição sem salvar as alterações pendentes." size="sm" variant="outline" onClick={onCancel}>Cancelar</Button>
      </div>
    </div>
  );
};

// ── Menu Item Editor ──
interface MenuEditorProps {
  item?: DbMenuItem;
  categories: DbMenuCategory[];
  onSave: (item: MenuItemInput, isNew: boolean) => Promise<MenuItemSaveResult>;
  onCancel: () => void;
}

const MenuItemEditor = ({ item, categories, onSave, onCancel }: MenuEditorProps) => {
  // Stable across network retries; the atomic RPC never leaves a partial item.
  const newItemId = useRef(crypto.randomUUID());
  const isNew = !item;
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Imagens enviadas/geradas nesta edição; as não usadas são apagadas ao fechar.
  const sessionImages = useRef<string[]>([]);
  // Imagem já gravada no item; o acervo permanece disponível para reutilização.
  const persistedImage = useRef<string | null>(null);
  // Editor fechado: upload/geração que terminar depois disso é apagado na hora.
  const closed = useRef(false);
  const trackImage = (url: string): boolean => {
    if (closed.current) {
      // O arquivo permanece no acervo, mesmo após o editor ser fechado.
      return false;
    }
    sessionImages.current.push(url);
    return true;
  };
  const [name, setName] = useState(item?.name ?? "");
  const [price, setPrice] = useState(item?.price?.toString() ?? "");
  const [category, setCategory] = useState(item?.category ?? (categories[0]?.key ?? ""));
  const [description, setDescription] = useState(item?.description ?? "");
  const [imageUrl, setImageUrl] = useState(item?.image_url ?? "");
  const [libraryPhotos, setLibraryPhotos] = useState<string[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const loadPhotoLibrary = async () => {
    if (!businessUnitId) return;
    setLibraryLoading(true);
    try {
      const bucket = supabase.storage.from("menu-images");
      const [uploads, generated] = await Promise.all([
        bucket.list(`${businessUnitId}/uploads`, { limit: 100, sortBy: { column: "created_at", order: "desc" } }),
        bucket.list(`${businessUnitId}/ai`, { limit: 100, sortBy: { column: "created_at", order: "desc" } }),
      ]);
      if (uploads.error || generated.error) throw uploads.error ?? generated.error;
      setLibraryPhotos([
        ...(uploads.data ?? []).map(file => `${businessUnitId}/uploads/${file.name}`),
        ...(generated.data ?? []).map(file => `${businessUnitId}/ai/${file.name}`),
      ].filter(path => !path.endsWith("/.emptyFolderPlaceholder")).map(path => bucket.getPublicUrl(path).data.publicUrl));
    } catch (error) {
      toast.error("Não foi possível listar as fotos: " + (error instanceof Error ? error.message : String(error)));
    } finally { setLibraryLoading(false); }
  };
  const [sortOrder, setSortOrder] = useState(item?.sort_order?.toString() ?? "0");
  const [active, setActive] = useState(item?.active ?? true);
  // Status confirmado pela gravação atômica do item e da ficha.
  const [savedStatus, setSavedStatus] = useState(item?.status);
  const isPublished = savedStatus === "published";
  const [uploading, setUploading] = useState(false);
  const { businessUnitId } = useCurrentBusinessUnit();
  const { user } = useAuth();
  const { roles, loading: rolesLoading } = useUnitRoles();
  const catalog = useMenuSuggestionCatalog(businessUnitId, user?.id, !rolesLoading && roles.includes('admin'));
  const [categorySearch, setCategorySearch] = useState('');
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [aiModel, setAiModel] = useState(AI_IMAGE_MODELS[0].id);
  useEffect(() => {
    if (!businessUnitId) { setAvailableModels([]); return; }
    let cancelled = false;
    void supabase.functions.invoke("generate-menu-image", { body: { action: "models", businessUnitId } })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || data?.error) { setAvailableModels([]); return; }
        const ids = (data?.models ?? []).map((m: { id: string }) => m.id);
        setAvailableModels(ids);
        setAiModel(current => ids.includes(current) ? current : (ids[0] ?? AI_IMAGE_MODELS[0].id));
      });
    return () => { cancelled = true; };
  }, [businessUnitId]);
  const [aiExtra, setAiExtra] = useState("");
  const [promptEdited,setPromptEdited]=useState(false);
  const [imagePrompt,setImagePrompt]=useState("");

  const [showPhotoSettings,setShowPhotoSettings]=useState(false);
  const [photoSettings,setPhotoSettings]=useState({style:"studio",angle:"three-quarter",lighting:"soft",custom:""});
  const [savingPhotoSettings,setSavingPhotoSettings]=useState(false);
  useEffect(()=>{
    if(!businessUnitId)return;
    let active=true;
    void supabase.functions.invoke("generate-menu-image",{body:{action:"photo-settings",businessUnitId}}).then(({data,error})=>{
      if(active&&!error&&data?.settings)setPhotoSettings(data.settings);
    });
    return ()=>{active=false;};
  },[businessUnitId]);
  const savePhotoSettings=async()=>{
    if(!businessUnitId)return;
    setSavingPhotoSettings(true);
    try{
      const {data,error}=await supabase.functions.invoke("generate-menu-image",{body:{action:"save-photo-settings",businessUnitId,settings:photoSettings}});
      if(error||data?.error)throw new Error(data?.error??error?.message??"Erro ao salvar");
      toast.success("Padrão fotográfico salvo para esta unidade");
      setShowPhotoSettings(false);
    }catch(e){toast.error(e instanceof Error?e.message:String(e));}
    finally{setSavingPhotoSettings(false);}
  };
  const [generating, setGenerating] = useState(false);
  const [ingredients, setIngredients] = useState<Omit<DbIngredient, "id">[]>(
    item?.ingredients?.map(({ id: _, ...rest }) => rest) ?? []
  );
  const importedImagePrompt = [
    name.trim() && `Produto: ${name.trim()}`,
    description.trim() && `Descrição: ${description.trim()}`,
    ingredients.filter(i=>i.name.trim()).length>0 && `Ficha técnica / ingredientes: ${ingredients.map(i=>i.name.trim()).filter(Boolean).join(", ")}`,
    "Fotografia gastronômica fotorrealista, composição fiel aos ingredientes informados, sem adicionar ingredientes, guarnições ou acompanhamentos não cadastrados."
  ].filter(Boolean).join("\\n");
  useEffect(()=>{
    if(!promptEdited)setImagePrompt(importedImagePrompt);
  },[importedImagePrompt,promptEdited]);
  const [variants, setVariants] = useState<Omit<DbVariant, "id">[]>(
    item?.variants?.map(({ id: _, ...rest }) => rest) ?? []
  );
  const [saving, setSaving] = useState(false);
  const recipeBuilderRef = useRef<RecipeBuilderHandle>(null);
  const [documentSheets,setDocumentSheets] = useState<{id:string;name:string}[]>([]);
  const [documentPickerOpen,setDocumentPickerOpen] = useState(false);
  const [documentPickerBusy,setDocumentPickerBusy] = useState(false);
  const [selectedDocument,setSelectedDocument] = useState("");
  const openDocumentPicker = async () => {
    if (!businessUnitId) return;
    setDocumentPickerBusy(true);
    try {
      const {data,error} = await supabase.from("menu_items").select("id,name")
        .eq("business_unit_id",businessUnitId).order("name");
      if(error) throw error;
      setDocumentSheets((data??[]).filter(source=>source.id!==item?.id && source.id!==newItemId.current));
      setSelectedDocument("");
      setDocumentPickerOpen(true);
    }catch{toast.error("Não foi possível consultar as fichas de Documentos.");}
    finally{setDocumentPickerBusy(false);}
  };
  const applyDocumentSheet = async () => {
    if (!selectedDocument || !recipeBuilderRef.current) return;
    setDocumentPickerBusy(true);
    try{
      if(await recipeBuilderRef.current.importFromMenuItem(selectedDocument)) setDocumentPickerOpen(false);
    }finally{setDocumentPickerBusy(false);}
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      if (!businessUnitId) { toast.error("Selecione uma unidade antes de enviar a foto"); return; }
      const url = await uploadMenuImage(file, businessUnitId);
      if (url && trackImage(url)) { setImageUrl(url); setImageFailed(false); }
    } catch (err) {
      toast.error("Erro ao enviar imagem: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      // Sempre libera os botões de salvar, mesmo se a rede falhar.
      setUploading(false);
    }
  };

  const handleGenerateImage = async () => {
    if (!name.trim()) {
      toast.error("Preencha o nome do item antes de gerar a foto");
      return;
    }
    if (!businessUnitId) { toast.error("Unidade não identificada"); return; }
    if (!availableModels.includes(aiModel)) { toast.error("Conecte a chave de IA em Integrações para esta unidade"); return; }
    setGenerating(true);
    let data: { url?: string; error?: string } | null = null;
    let error: Error | null = null;
    try {
      ({ data, error } = await supabase.functions.invoke("generate-menu-image", {
        body: {
          name: name.trim(),
          businessUnitId,
          description: description.trim() || undefined,
          ingredients: ingredients.map((i) => i.name.trim()).filter(Boolean),
          model: aiModel,
          extra: aiExtra.trim() || undefined,
          imagePrompt: imagePrompt.trim() || undefined,
        },
      }));
    } catch (err) {
      error = err instanceof Error ? err : new Error(String(err));
    } finally {
      // Sempre libera os botões de salvar, mesmo se a rede falhar.
      setGenerating(false);
    }
    if (error || !data?.url) {
      let msg = data?.error ?? error?.message ?? "erro desconhecido";
      try {
        const body = await (error as { context?: Response })?.context?.json?.();
        if (body?.error) msg = body.error;
      } catch { /* resposta sem corpo JSON */ }
      toast.error("Erro ao gerar foto: " + msg);
      return;
    }
    if (!trackImage(data.url)) {
      toast.info("Foto salva no acervo, mas o editor já foi fechado.");
      return;
    }
    setImageUrl(data.url);
    setImageFailed(false);
    toast.success("Foto gerada — salve o item para manter");
  };

  const removeImage = () => {
    setImageFailed(false);
    setImageUrl("");
  };

  // Encerra o estado desta edição; mantém as fotos no acervo.
  const discardSessionImages = useCallback(() => {
    closed.current = true;
    sessionImages.current = [];
    // Preserva todas as fotos no acervo para reutilização posterior.
  }, []);

  // Não deixa fechar no meio do save: a foto ainda não foi gravada no item e
  // seria apagada antes de a URL chegar ao banco.
  const handleCancel = () => {
    if (saving) return;
    discardSessionImages();
    onCancel();
  };

  // Ao desmontar, limpa o rastreamento local e ignora respostas atrasadas.
  useEffect(() => discardSessionImages, [discardSessionImages]);

  // ID, SKU e ordem inicial são definidos pelo banco (trigger + defaults).
  // O status muda pela ação escolhida: "Salvar rascunho" ou "Publicar".
  const handleSave = async (status: "draft" | "published") => {
    if (!name.trim() || !price || !Number.isFinite(Number(price)) || Number(price) < 0 || (status === "published" && Number(price) <= 0)) {
      toast.error("Informe nome e preço válido; para publicar, o preço deve ser maior que zero");
      return;
    }
    if (status === "published" && !recipeBuilderRef.current) {
      toast.error("Aguarde a ficha técnica carregar antes de publicar.");
      return;
    }
    setSaving(true);
    // Um rascunho pode começar sem ficha. As linhas preenchidas e a publicação
    // são gravadas junto com o item, sem uma segunda etapa de escrita.
    if (recipeBuilderRef.current && !recipeBuilderRef.current.validate()) { setSaving(false); return; }
    const finalImage = imageUrl.trim() || null;
    const listedIngredients = ingredientsFromDescription(description, ingredients);
    const savedId = await onSave(
      {
        ...(item
          ? { id: item.id, sort_order: parseInt(sortOrder) || 0 }
          : { id: newItemId.current }),
        name: name.trim(),
        price: Number(price),
        category,
        description: description.trim() || null,
        image_url: finalImage,
        active,
        status,
        ingredients: listedIngredients,
        variants,
        recipe: recipeBuilderRef.current?.getDraft() ?? [],
      },
      isNew
    );
    setSaving(false);
    if (typeof savedId !== "string") return;
    persistedImage.current = finalImage;
    setSavedStatus(status);

    // Salvo: apaga a foto antiga (se foi trocada) e as tentativas descartadas.
    const stale = [item?.image_url, ...sessionImages.current].filter((u) => u && u !== finalImage);
    closed.current = true;
    sessionImages.current = [];
    // Não apagar fotos anteriores ou tentativas: fazem parte do acervo.
    onCancel();
  };

  // Sugestão por IA: usa o modo "criar ficha" e aproveita só o que estiver vazio.
  const [suggesting, setSuggesting] = useState(false);
  const suggestWithAi = async () => {
    if (!businessUnitId || !name.trim()) return;
    setSuggesting(true);
    try {
      const { listImportModels, extractMenuDraft } = await import("@/lib/menuImport");
      const { models, warning } = await listImportModels(businessUnitId);
      if (!models.length) throw new Error(warning || "Conecte a IA em Conexões desta unidade.");
      const catLabel = categories.find((c) => c.key === category)?.label ?? "";
      const { draft } = await extractMenuDraft({ businessUnitId, model: models[0].id, files: [], mode: "create",
        text: `${name.trim()}${catLabel ? ` (categoria ${catLabel})` : ""}${description.trim() ? `. ${description.trim()}` : ""}` });
      const found = draft.items[0];
      if (!found) throw new Error("A IA não conseguiu sugerir. Detalhe melhor o nome.");
      let filled = 0;
      if (!description.trim() && found.description) { setDescription(found.description); filled++; }
      toast[filled ? "success" : "info"](filled ? "Descrição sugerida e aplicada. Revise antes de salvar." : "A descrição já estava preenchida; nada foi alterado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível sugerir");
    } finally { setSuggesting(false); }
  };

  const addVariant = () => {
    setVariants([...variants, { name: "", sort_order: variants.length }]);
  };

  const removeVariant = (idx: number) => {
    setVariants(variants.filter((_, i) => i !== idx));
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">{isNew ? "Novo Item" : "Editar Item"}</h3>
        <button onClick={handleCancel} disabled={saving} aria-label="Fechar" className="text-muted-foreground hover:text-foreground disabled:opacity-50"><X className="h-5 w-5" /></button>
      </div>

      {item && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span data-tooltip="Código interno único do produto, gerado automaticamente. Usado em relatórios, importação e integrações; não precisa preencher.">SKU (código interno): <span className="font-mono text-foreground">{item.sku ?? "—"}</span></span>
          <span>Status: <span className="text-foreground">{isPublished ? "Publicado" : "Rascunho"}</span></span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Categoria</label>
          <select data-tooltip="Escolha a categoria em que o item aparecerá no cardápio." aria-label="Escolha a categoria em que o item aparecerá no cardápio." value={category} onChange={(e) => setCategory(e.target.value)} className="w-full h-9 rounded-md border border-border bg-muted px-3 text-sm text-foreground">
            {categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <MenuPrefixField label="Buscar categoria pelo início" placeholder="Digite o início da categoria" value={categorySearch} onChange={setCategorySearch} mode="whole" suggestions={catalog.suggestions.categories}
            onPick={suggestion => { const found = catalog.categories.find(row => row.id === suggestion.id); if (found) setCategory(found.key); setCategorySearch(''); }} />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Nome</label>
          <MenuPrefixField label="Nome do produto" value={name} onChange={setName} suggestions={[...catalog.suggestions.products, ...catalog.suggestions.words]} className="h-9" />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Preço (R$)</label>
          <Input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className="h-9" />
        </div>
        {item && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground" data-tooltip="Posição do item na categoria: menor aparece primeiro.">Ordem</label>
            <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="h-9" />
            <p className="text-[10px] text-muted-foreground">Menor aparece primeiro.</p>
          </div>
        )}
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="rounded" />
            Ativo
          </label>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" disabled={suggesting || !name.trim() || !businessUnitId}
          data-tooltip="A IA sugere descrição e ingredientes a partir do nome. Só preenche campos vazios; revise antes de salvar."
          onClick={() => void suggestWithAi()}>
          <Sparkles className="mr-1 h-4 w-4" />{suggesting ? "Sugerindo..." : "Sugerir com IA"}
        </Button>
        <span className="text-[11px] text-muted-foreground">Preenche descrição e ingredientes vazios a partir do nome.</span>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Descrição</label>
        <MenuPrefixField multiline label="Descrição do produto"
          value={description}
          onChange={setDescription} suggestions={catalog.suggestions.words}
          className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
        />
        <p className="text-[11px] text-muted-foreground">Para exibir ingredientes no cardápio, separe-os por vírgulas. Ex.: pão brioche, carne, queijo, molho especial.</p>
      </div>

      {/* Image Upload */}
      <p className="text-xs text-muted-foreground">{catalog.loading ? 'Carregando sugestões…' : catalog.error ? 'Autocomplete indisponível. Você pode continuar digitando.' : catalog.limited ? 'Autocomplete limitado aos primeiros 500 cadastros por tipo.' : 'Digite duas letras para ver sugestões desta unidade.'}</p>
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Foto do Item</label>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
        {imageUrl ? (
          <div className="relative w-32 h-32 rounded-lg overflow-hidden border border-border group">
            <img src={imageUrl} alt="Preview" onError={() => setImageFailed(true)} onLoad={() => setImageFailed(false)} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <button data-tooltip="Escolha uma foto para o item do cardápio." aria-label="Escolha uma foto para o item do cardápio." onClick={() => fileInputRef.current?.click()} className="p-1.5 rounded-lg bg-white/20 text-white hover:bg-white/30">
                <Pencil className="h-4 w-4" />
              </button>
              <button data-tooltip="Retire a foto deste item. A imagem permanece no acervo." aria-label="Retire a foto deste item. A imagem permanece no acervo." onClick={removeImage} className="p-1.5 rounded-lg bg-white/20 text-white hover:bg-red-500/60">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : (
          <button data-tooltip="Escolha uma foto para o item do cardápio."
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed border-border hover:border-primary/50 text-muted-foreground hover:text-foreground transition-colors"
          >
            {uploading ? (
              <Flame className="h-5 w-5 animate-pulse text-primary" />
            ) : (
              <ImagePlus className="h-5 w-5" />
            )}
            <span className="text-sm">{uploading ? "Enviando..." : "Adicionar foto"}</span>
          </button>
        )}

        {imageFailed && <p className="text-xs text-destructive">A foto cadastrada não foi encontrada no armazenamento. Selecione outra no acervo ou envie novamente.</p>}
        <div className="space-y-2 rounded-lg border border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium">Acervo de fotos · Storage</span>
            <Button data-tooltip="Veja as fotos armazenadas no acervo desta unidade para reutilizar no cardápio." type="button" variant="outline" size="sm" disabled={libraryLoading || !businessUnitId} onClick={() => void loadPhotoLibrary()}>{libraryLoading ? "Carregando..." : "Ver fotos"}</Button>
          </div>
          {libraryPhotos.length > 0 && <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 max-h-64 overflow-y-auto">
            {libraryPhotos.map(url => <button type="button" key={url} onClick={() => { setImageUrl(url); setImageFailed(false); }} aria-label="Usar foto do acervo" className={`aspect-square rounded-md overflow-hidden border-2 ${imageUrl === url ? "border-primary" : "border-border"}`}><img src={url} alt="Foto armazenada" loading="lazy" className="h-full w-full object-cover" /></button>)}
          </div>}
          <p className="text-xs text-muted-foreground">Fotos enviadas e geradas permanecem salvas, mesmo quando substituídas ou removidas do produto.</p>
        </div>
        <div className="rounded-lg border border-border bg-secondary/20 p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" /> Gerar foto com IA
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={aiModel}
              onChange={(e) => setAiModel(e.target.value)}
              aria-label="Modelo de IA para gerar a foto"
              className="h-9 rounded-md border border-border bg-muted px-3 text-sm text-foreground"
            >
              {AI_IMAGE_MODELS.filter((m) => availableModels.includes(m.id)).map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
            <Input
              value={aiExtra}
              onChange={(e) => setAiExtra(e.target.value)}
              placeholder="Ajuste opcional (ex: em tábua de madeira)"
              className="h-9 flex-1 min-w-[180px]"
            />
            <div className="w-full space-y-1">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="menu-ai-prompt" className="text-xs font-medium">Prompt da imagem — importado da descrição e ficha técnica</label>
                <Button type="button" variant="ghost" size="sm" onClick={()=>{setPromptEdited(false);setImagePrompt(importedImagePrompt);}}>Reimportar dados</Button>
              </div>
              <textarea id="menu-ai-prompt" value={imagePrompt} onChange={e=>{setImagePrompt(e.target.value);setPromptEdited(true);}} maxLength={2500} rows={5} className="w-full rounded-md border border-border bg-background p-3 text-sm text-foreground" aria-label="Prompt editável para geração de imagem"/>
              <p className="text-[11px] text-muted-foreground">O texto pode ser ajustado. A descrição e os ingredientes continuam sendo enviados separadamente para orientar a fidelidade da imagem.</p>
            </div>
            <Button type="button" variant="outline" aria-label="Configurar padrão fotográfico" title="Configurar padrão fotográfico" onClick={()=>setShowPhotoSettings(v=>!v)} className="h-9 px-3"><Settings2 className="h-4 w-4"/></Button>
            <Button data-tooltip="Gere uma foto do item com a IA conectada nesta unidade. A geração pode ter custo no provedor." type="button" variant="outline" onClick={handleGenerateImage} disabled={generating || availableModels.length === 0} className="gap-2 h-9">
              {generating ? <Flame className="h-4 w-4 animate-pulse text-primary" /> : <Sparkles className="h-4 w-4" />}
              {generating ? "Gerando..." : imageUrl ? "Gerar outra" : "Gerar"}
            </Button>
          </div>
          {showPhotoSettings && <div className="rounded-md border border-border p-3 space-y-3">
            <p className="text-sm font-medium">Padrão fotográfico da unidade</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <label className="text-xs space-y-1">Estilo
                <select aria-label="Estilo fotográfico" value={photoSettings.style} onChange={e=>setPhotoSettings(s=>({...s,style:e.target.value}))} className="w-full h-9 rounded-md border border-border bg-background px-2">
                  <option value="studio">Estúdio claro</option><option value="dark">Estúdio escuro</option><option value="natural">Restaurante natural</option><option value="catalog">Catálogo</option>
                </select>
              </label>
              <label className="text-xs space-y-1">Ângulo
                <select aria-label="Ângulo fotográfico" value={photoSettings.angle} onChange={e=>setPhotoSettings(s=>({...s,angle:e.target.value}))} className="w-full h-9 rounded-md border border-border bg-background px-2">
                  <option value="three-quarter">45 graus</option><option value="front">Frontal</option><option value="top">Superior</option>
                </select>
              </label>
              <label className="text-xs space-y-1">Iluminação
                <select aria-label="Iluminação fotográfica" value={photoSettings.lighting} onChange={e=>setPhotoSettings(s=>({...s,lighting:e.target.value}))} className="w-full h-9 rounded-md border border-border bg-background px-2">
                  <option value="soft">Suave</option><option value="natural">Natural</option><option value="dramatic">Dramática</option>
                </select>
              </label>
            </div>
            <Input value={photoSettings.custom} maxLength={250} onChange={e=>setPhotoSettings(s=>({...s,custom:e.target.value}))} placeholder="Direção fotográfica fixa (opcional)" />
            <Button type="button" onClick={savePhotoSettings} disabled={savingPhotoSettings}>{savingPhotoSettings?"Salvando...":"Salvar padrão da unidade"}</Button>
          </div>}
          <p className="text-[11px] text-muted-foreground">{availableModels.length === 0 ? "Conecte Google, OpenAI ou Stability AI em Integrações → Inteligência Artificial para habilitar a geração nesta unidade." : "Usa nome, descrição e ingredientes do item. Cada geração tem custo na sua conta de IA."}</p>
        </div>
      </div>

      <div className="space-y-2">
        <Button type="button" variant="outline" disabled={saving || documentPickerBusy}
          onClick={() => void openDocumentPicker()}>Puxar ficha de Documentos</Button>
        <p className="text-xs text-muted-foreground">Selecione uma ficha técnica já salva nesta unidade. A importação só será vinculada após salvar o item.</p>
        <RecipeBuilder ref={recipeBuilderRef} menuItemId={item?.id}
          menuItemName={name} disabled={saving || uploading || generating} />
      </div>
      {documentPickerOpen && <div role="dialog" aria-label="Puxar ficha técnica de Documentos"
        className="space-y-3 rounded-lg border border-border bg-card p-3">
        <p className="text-sm font-semibold">Fichas técnicas da unidade</p>
        <select aria-label="Selecionar ficha técnica" value={selectedDocument}
          onChange={event=>setSelectedDocument(event.target.value)}
          className="w-full rounded-md border bg-background p-2 text-sm">
          <option value="">Selecione um item</option>
          {documentSheets.map(source=><option key={source.id} value={source.id}>{source.name}</option>)}
        </select>
        <div className="flex gap-2">
          <Button type="button" disabled={!selectedDocument || documentPickerBusy}
            onClick={()=>void applyDocumentSheet()}>Carregar ficha</Button>
          <Button type="button" variant="outline" onClick={()=>setDocumentPickerOpen(false)}>Cancelar</Button>
        </div>
      </div>}

      {/* Variants */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Variantes</label>
          <button data-tooltip="Adicione uma variante que o cliente poderá escolher neste item." onClick={addVariant} className="text-xs text-primary hover:underline flex items-center gap-1">
            <Plus className="h-3 w-3" /> Adicionar
          </button>
        </div>
        {variants.map((v, idx) => (
          <div key={idx} className="flex items-center gap-2 rounded-lg bg-secondary/30 p-2">
            <Input value={v.name} onChange={(e) => setVariants(variants.map((vv, i) => i === idx ? { ...vv, name: e.target.value } : vv))} placeholder="Nome da variante" className="h-8 text-xs flex-1" />
            <button data-tooltip="Remova esta variante do item em edição." aria-label="Remova esta variante do item em edição." onClick={() => removeVariant(idx)} className="text-destructive hover:text-destructive/80"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        ))}
      </div>

      <div className="flex gap-2 pt-2">
        {isPublished ? (
          <>
            <Button data-tooltip="Salve o item e a ficha técnica e publique no cardápio." onClick={() => handleSave("published")} disabled={saving || uploading || generating} className="gap-2">
              <Save className="h-4 w-4" /> {saving ? "Salvando..." : "Salvar"}
            </Button>
            <Button data-tooltip="Salve o item e a ficha técnica como rascunho, fora do cardápio publicado." variant="outline" onClick={() => handleSave("draft")} disabled={saving || uploading || generating}>Voltar para rascunho</Button>
          </>
        ) : (
          <>
            <Button data-tooltip="Salve o item e a ficha técnica como rascunho, fora do cardápio publicado." variant="outline" onClick={() => handleSave("draft")} disabled={saving || uploading || generating} className="gap-2">
              <Save className="h-4 w-4" /> {saving ? "Salvando..." : "Salvar rascunho"}
            </Button>
            <Button data-tooltip="Salve o item e a ficha técnica e publique no cardápio." onClick={() => handleSave("published")} disabled={saving || uploading || generating}>Publicar</Button>
          </>
        )}
        <Button data-tooltip="Feche a edição sem salvar as alterações pendentes." variant="outline" onClick={handleCancel} disabled={saving}>Cancelar</Button>
      </div>
    </div>
  );
};

// ── Menu Tab ──
const UnitMenuTab = () => {
  const { sectors } = usePrintSectors();
  const { menuItems, categories, loadingMenu, loadingCategories, saveMenuItem, deleteMenuItem, saveCategory, deleteCategory, refreshMenu, refreshCategories } = useAdminData();
  const [searchParams, setSearchParams] = useSearchParams();
  const importOpen = searchParams.get("import") === "1";
  const setImportOpen = (value: boolean) => setSearchParams(previous => {
    const next = new URLSearchParams(previous);
    if (value) next.set("import", "1"); else next.delete("import");
    return next;
  });
  const [editingItem, setEditingItem] = useState<DbMenuItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [showCategories, setShowCategories] = useState(false);
  const [editingCategory, setEditingCategory] = useState<DbMenuCategory | null>(null);
  const [creatingCategory, setCreatingCategory] = useState(false);

  if (loadingMenu || loadingCategories) {
    return <div className="flex justify-center py-12"><Flame className="h-6 w-6 animate-pulse text-primary" /></div>;
  }

  if (creating || editingItem) {
    return (
      <MenuItemEditor
        item={editingItem ?? undefined}
        categories={categories}
        onSave={saveMenuItem}
        onCancel={() => { setEditingItem(null); setCreating(false); }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <Button data-tooltip="Monte um novo item do cardápio e sua ficha técnica." onClick={() => setCreating(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Novo Item
        </Button>
        <Button data-tooltip="Abra ou recolha o cadastro das categorias do cardápio." variant="outline" onClick={() => setShowCategories(!showCategories)} className="gap-2">
          <Tags className="h-4 w-4" /> Categorias ({categories.length})
        </Button>
        <Button data-tooltip="Envie cardápios e fichas técnicas (PDF, foto, planilha). A IA monta um rascunho para você revisar e gravar." variant="outline" onClick={() => setImportOpen(true)} className="gap-2">
          <Sparkles className="h-4 w-4" /> Importar com IA
        </Button>
      </div>
      <MenuImportDialog open={importOpen} onOpenChange={setImportOpen} onImported={() => { void refreshMenu(); void refreshCategories(); }} />

      {/* Categories Management */}
      {showCategories && (
        <div className="rounded-xl border border-border p-4 space-y-3 bg-muted/30">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Gerenciar Categorias</h3>
            <button data-tooltip="Cadastre uma categoria para organizar os itens do cardápio." onClick={() => setCreatingCategory(true)} className="text-xs text-primary hover:underline flex items-center gap-1">
              <Plus className="h-3 w-3" /> Nova
            </button>
          </div>

          {(creatingCategory || editingCategory) && (
            <CategoryEditor
              category={editingCategory ?? undefined}
              existingKeys={categories.map((c) => c.key)}
              onSave={saveCategory}
              onCancel={() => { setEditingCategory(null); setCreatingCategory(false); }}
            />
          )}

          <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
            {categories.map((cat) => (
              <div key={cat.id} className="flex items-center gap-3 px-3 py-2 bg-card">
                {(() => { const Icon = getCategoryIcon(cat.icon_name, cat.label); return <Icon className="h-5 w-5 shrink-0" style={{ color: safeCategoryColor(cat.icon_color) }} />; })()}
                <span className="flex-1 min-w-0 text-sm font-medium text-foreground truncate">{cat.label}</span>
                <span className="hidden sm:inline text-xs text-muted-foreground truncate">{cat.key}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                  {sectorName(sectors, cat.destination)}
                </span>
                <button data-tooltip="Edite o nome, o ícone e a cor desta categoria." aria-label="Edite o nome, o ícone e a cor desta categoria." onClick={() => setEditingCategory(cat)} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => { if (confirm(`Excluir categoria "${cat.label}"?`)) deleteCategory(cat.id); }}
                  className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Menu Items by Category */}
      {categories.map((cat) => {
        const items = menuItems.filter((i) => i.category === cat.key);
        const isExpanded = expandedCategory === cat.key;
        return (
          <div key={cat.key} className="rounded-xl border border-border overflow-hidden">
            <button
              onClick={() => setExpandedCategory(isExpanded ? null : cat.key)}
              className="w-full flex items-center justify-between px-4 py-3 bg-card hover:bg-secondary/30 transition-colors"
            >
              <span className="font-semibold text-foreground">{cat.label} ({items.length})</span>
              {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </button>
            {isExpanded && (
              <div className="divide-y divide-border">
                {items.map((item) => {
                  const isItemExpanded = expandedItem === item.id;
                  return (
                    <div key={item.id} className={`min-w-0 ${!item.active ? "opacity-60" : ""}`}>
                      <button
                        type="button"
                        aria-expanded={isItemExpanded}
                        onClick={() => setExpandedItem(isItemExpanded ? null : item.id)}
                        className="w-full min-w-0 px-3 py-3 flex items-center gap-3 text-left hover:bg-secondary/30 transition-colors"
                      >
                        {item.image_url ? (
                          <img src={item.image_url} alt={item.name} className="w-12 h-12 rounded-lg object-cover border border-border shrink-0" />
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center shrink-0">
                            <Image className="h-5 w-5 text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0 space-y-1">
                          <p className="font-semibold text-foreground truncate">{item.name}</p>
                          <p className="text-sm font-semibold text-primary">{formatCurrency(item.price)}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {item.ingredients.length} ingredientes{item.variants.length > 0 ? ` · ${item.variants.length} variantes` : ""}
                          </p>
                        </div>
                        {isItemExpanded ? <ChevronUp className="h-4 w-4 shrink-0 text-primary" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
                      </button>
                      {isItemExpanded && (
                        <div className="border-t border-border bg-muted/20 px-4 py-4 space-y-3 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-muted-foreground">Status</span>
                            <span className="text-xs font-medium text-foreground">{!item.active ? "Inativo" : item.status === "draft" ? "Rascunho" : "Publicado"}</span>
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">Descrição</p>
                            <p className="text-sm text-foreground break-words">{item.description || "Sem descrição"}</p>
                          </div>
                          <div className="flex justify-between gap-2 text-sm">
                            <span className="text-muted-foreground">Categoria</span>
                            <span className="text-foreground">{cat.label}</span>
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">Ingredientes ({item.ingredients.length})</p>
                            <p className="text-sm text-foreground break-words">{item.ingredients.length ? item.ingredients.map((ing) => ing.name).join(", ") : "Nenhum ingrediente vinculado"}</p>
                          </div>
                          {item.variants.length > 0 && (
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground">Variações ({item.variants.length})</p>
                              <p className="text-sm text-foreground break-words">{item.variants.map((variant) => variant.name).join(", ")}</p>
                            </div>
                          )}
                          <div className="flex gap-2 pt-2">
                            <Button data-tooltip="Edite este item, seus ingredientes de exibição e sua ficha técnica." size="sm" className="flex-1 gap-2" onClick={() => setEditingItem(item)}>
                              <Pencil className="h-4 w-4" /> Editar / Ficha técnica
                            </Button>
                            <Button size="sm" variant="outline" aria-label={`Excluir ${item.name}`}
                              onClick={() => { if (confirm(`Excluir "${item.name}"?`)) deleteMenuItem(item.id); }}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                {items.length === 0 && (
                  <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nenhum item nesta categoria</p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

const MenuTab = () => {
  const { businessUnitId } = useCurrentBusinessUnit();
  return <UnitMenuTab key={businessUnitId ?? 'no-unit'} />;
};

export default MenuTab;
