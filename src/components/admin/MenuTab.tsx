import { useState, useRef, useEffect } from "react";
import { Flame, Plus, Trash2, Pencil, Save, X, ChevronDown, ChevronUp, Tags, ImagePlus, Image, Sparkles, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAdminData, type DbMenuItem, type DbIngredient, type DbVariant, type DbMenuCategory } from "@/hooks/useAdminData";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/utils/orders";
import { CATEGORY_ICON_OPTIONS, CATEGORY_COLORS, getCategoryIcon, safeCategoryColor, suggestCategoryIcon } from "@/utils/categoryIcons";
import { toast } from "sonner";
import RecipeBuilder, { type RecipeBuilderHandle } from "@/components/admin/RecipeBuilder";
import { useCurrentBusinessUnit } from "@/hooks/useCurrentBusinessUnit";

// ── Image Upload Helper ──
// O nome do arquivo é gerado aqui (não depende do ID do item, que só existe
// depois que o banco cria o registro).
const uploadMenuImage = async (file: File): Promise<string | null> => {
  const ext = file.name.split(".").pop();
  const path = `${crypto.randomUUID()}.${ext}`;

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

// ── Category Editor ──
interface CategoryEditorProps {
  category?: DbMenuCategory;
  onSave: (cat: any, isNew: boolean) => Promise<boolean>;
  onCancel: () => void;
}

const CategoryEditor = ({ category, onSave, onCancel }: CategoryEditorProps) => {
  const isNew = !category;
  const [key, setKey] = useState(category?.key ?? "");
  const [label, setLabel] = useState(category?.label ?? "");
  const [destination, setDestination] = useState(category?.destination ?? "kitchen");
  const [sortOrder, setSortOrder] = useState(category?.sort_order?.toString() ?? "0");
  const [saving, setSaving] = useState(false);
  const [iconName, setIconName] = useState(category?.icon_name ?? suggestCategoryIcon(category?.label ?? ""));
  const [iconColor, setIconColor] = useState(safeCategoryColor(category?.icon_color));
  const [iconTouched, setIconTouched] = useState(!!category?.icon_name);
  const [iconSearch, setIconSearch] = useState("");
  const PreviewIcon = getCategoryIcon(iconName, label);

  const handleSave = async () => {
    if (!key.trim() || !label.trim()) {
      toast.error("Chave e nome são obrigatórios");
      return;
    }
    setSaving(true);
    const ok = await onSave(
      { id: category?.id, key: key.trim().toLowerCase(), label: label.trim(), icon_name: iconName, icon_color: iconColor, destination, sort_order: parseInt(sortOrder) || 0 },
      isNew
    );
    setSaving(false);
    if (ok) onCancel();
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{isNew ? "Nova Categoria" : "Editar Categoria"}</h3>
        <button onClick={onCancel} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Chave (slug)</label>
          <Input value={key} onChange={(e) => setKey(e.target.value)} disabled={!isNew} placeholder="ex: salads" className="h-8 text-sm" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Nome</label>
          <Input value={label} onChange={(e) => { setLabel(e.target.value); if (!iconTouched) setIconName(suggestCategoryIcon(e.target.value)); }} placeholder="ex: Saladas" className="h-8 text-sm" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Destino</label>
          <select value={destination} onChange={(e) => setDestination(e.target.value)} className="w-full h-8 rounded-md border border-border bg-muted px-3 text-sm text-foreground">
            <option value="kitchen">Cozinha</option>
            <option value="bar">Bar</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Ordem</label>
          <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="h-8 text-sm" />
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">Ícone da categoria</label>
        <div className="flex items-center gap-3 rounded-lg border border-border p-3">
          <PreviewIcon className="h-7 w-7 shrink-0" style={{ color: iconColor }} />
          <span className="text-sm font-medium text-foreground truncate">{label || "Nova categoria"}</span>
        </div>
        <Input value={iconSearch} onChange={(e) => setIconSearch(e.target.value)} placeholder="Buscar ícone..." className="h-8 text-sm" />
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-48 overflow-y-auto">
          {CATEGORY_ICON_OPTIONS.filter((option) => (option.label + " " + option.name).toLowerCase().includes(iconSearch.toLowerCase())).map(({ name, label: iconLabel, Icon }) => (
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
        <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1">
          <Save className="h-3.5 w-3.5" /> {saving ? "Salvando..." : "Salvar"}
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>Cancelar</Button>
      </div>
    </div>
  );
};

// ── Menu Item Editor ──
interface MenuEditorProps {
  item?: DbMenuItem;
  categories: DbMenuCategory[];
  onSave: (item: any, isNew: boolean) => Promise<string | false | { failedId: string }>;
  onCancel: () => void;
}

const MenuItemEditor = ({ item, categories, onSave, onCancel }: MenuEditorProps) => {
  // Se o item novo já foi criado mas um passo seguinte (ficha técnica) falhou,
  // guardamos o ID para que "salvar de novo" atualize em vez de duplicar.
  const [createdId, setCreatedId] = useState<string | null>(null);
  const isNew = !item && !createdId;
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Imagens enviadas/geradas nesta edição; as não usadas são apagadas ao fechar.
  const sessionImages = useRef<string[]>([]);
  // Imagem já gravada no item (save ok, mas um passo seguinte falhou):
  // não pode ser apagada ao cancelar, senão a URL do item fica quebrada.
  const persistedImage = useRef<string | null>(null);
  // Editor fechado: upload/geração que terminar depois disso é apagado na hora.
  const closed = useRef(false);
  const trackImage = (url: string): boolean => {
    if (closed.current) {
      void removeMenuImages([url]);
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
  const [sortOrder, setSortOrder] = useState(item?.sort_order?.toString() ?? "0");
  const [active, setActive] = useState(item?.active ?? true);
  // Status já gravado no banco (não o do item aberto): muda assim que um save
  // passa, mesmo que um passo seguinte (ficha técnica) falhe e o editor continue aberto.
  const [savedStatus, setSavedStatus] = useState(item?.status);
  const isPublished = savedStatus === "published";
  const [uploading, setUploading] = useState(false);
  const { businessUnitId } = useCurrentBusinessUnit();
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
  const [variants, setVariants] = useState<Omit<DbVariant, "id">[]>(
    item?.variants?.map(({ id: _, ...rest }) => rest) ?? []
  );
  const [saving, setSaving] = useState(false);
  const recipeBuilderRef = useRef<RecipeBuilderHandle>(null);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadMenuImage(file);
      if (url && trackImage(url)) setImageUrl(url);
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
      // Editor já fechado: a geração foi cobrada, mas a foto foi descartada.
      toast.info("A foto gerada chegou depois de fechar o editor e foi descartada.");
      return;
    }
    setImageUrl(data.url);
    toast.success("Foto gerada — salve o item para manter");
  };

  const removeImage = () => {
    setImageUrl("");
  };

  // Cancelar: descarta tudo que foi enviado/gerado nesta edição.
  const discardSessionImages = () => {
    closed.current = true;
    const leftovers = sessionImages.current.filter((u) => u !== persistedImage.current);
    sessionImages.current = [];
    if (leftovers.length > 0) void removeMenuImages(leftovers);
  };

  // Não deixa fechar no meio do save: a foto ainda não foi gravada no item e
  // seria apagada antes de a URL chegar ao banco.
  const handleCancel = () => {
    if (saving) return;
    discardSessionImages();
    onCancel();
  };

  // Trocar de seção do admin desmonta o editor sem passar por Cancelar/Salvar:
  // apaga as fotos enviadas/geradas que não foram gravadas e ignora respostas atrasadas.
  useEffect(() => discardSessionImages, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ID, SKU e ordem inicial são definidos pelo banco (trigger + defaults).
  // O status muda pela ação escolhida: "Salvar rascunho" ou "Publicar".
  const handleSave = async (status: "draft" | "published") => {
    if (!name.trim() || !price) {
      toast.error("Nome e preço são obrigatórios");
      return;
    }
    setSaving(true);
    const finalImage = imageUrl.trim() || null;
    const savedId = await onSave(
      {
        ...(item
          ? { id: item.id, sort_order: parseInt(sortOrder) || 0 }
          : createdId ? { id: createdId } : {}),
        name: name.trim(),
        price: parseFloat(price),
        category,
        description: description.trim() || null,
        image_url: finalImage,
        active,
        status,
        ingredients,
        variants,
      },
      isNew
    );
    if (typeof savedId !== "string") {
      // Item novo ficou no banco sem conseguir desfazer: próxima tentativa atualiza ele.
      if (savedId) {
        if (!item) setCreatedId(savedId.failedId);
        // A linha existe e já aponta para esta foto/status: Cancelar não pode apagá-la.
        persistedImage.current = finalImage;
        setSavedStatus(status);
      }
      setSaving(false);
      return;
    }
    if (!item) setCreatedId(savedId);
    persistedImage.current = finalImage;
    setSavedStatus(status);
    const recipeOk = await recipeBuilderRef.current?.commit(savedId);
    setSaving(false);
    if (recipeOk === false) return;

    // Salvo: apaga a foto antiga (se foi trocada) e as tentativas descartadas.
    const stale = [item?.image_url, ...sessionImages.current].filter((u) => u && u !== finalImage);
    closed.current = true;
    sessionImages.current = [];
    void removeMenuImages(stale);
    onCancel();
  };

  const addIngredient = () => {
    setIngredients([...ingredients, { name: "", removable: true, extra_price: null, sort_order: ingredients.length }]);
  };

  const updateIngredient = (idx: number, field: string, value: any) => {
    setIngredients(ingredients.map((ing, i) => i === idx ? { ...ing, [field]: value } : ing));
  };

  const removeIngredient = (idx: number) => {
    setIngredients(ingredients.filter((_, i) => i !== idx));
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
          <span>SKU: <span className="font-mono text-foreground">{item.sku ?? "—"}</span></span>
          <span>Status: <span className="text-foreground">{isPublished ? "Publicado" : "Rascunho"}</span></span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Categoria</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full h-9 rounded-md border border-border bg-muted px-3 text-sm text-foreground">
            {categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Nome</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9" />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Preço (R$)</label>
          <Input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className="h-9" />
        </div>
        {item && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Ordem</label>
            <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="h-9" />
          </div>
        )}
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="rounded" />
            Ativo
          </label>
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Descrição</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
        />
      </div>

      {/* Image Upload */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Foto do Item</label>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
        {imageUrl ? (
          <div className="relative w-32 h-32 rounded-lg overflow-hidden border border-border group">
            <img src={imageUrl} alt="Preview" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <button onClick={() => fileInputRef.current?.click()} className="p-1.5 rounded-lg bg-white/20 text-white hover:bg-white/30">
                <Pencil className="h-4 w-4" />
              </button>
              <button onClick={removeImage} className="p-1.5 rounded-lg bg-white/20 text-white hover:bg-red-500/60">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : (
          <button
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
            <Button type="button" variant="outline" aria-label="Configurar padrão fotográfico" title="Configurar padrão fotográfico" onClick={()=>setShowPhotoSettings(v=>!v)} className="h-9 px-3"><Settings2 className="h-4 w-4"/></Button>
            <Button type="button" variant="outline" onClick={handleGenerateImage} disabled={generating || availableModels.length === 0} className="gap-2 h-9">
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

      {/* Ingredients */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Ingredientes</label>
          <button onClick={addIngredient} className="text-xs text-primary hover:underline flex items-center gap-1">
            <Plus className="h-3 w-3" /> Adicionar
          </button>
        </div>
        {ingredients.map((ing, idx) => (
          <div key={idx} className="flex items-center gap-2 rounded-lg bg-secondary/30 p-2">
            <Input value={ing.name} onChange={(e) => updateIngredient(idx, "name", e.target.value)} placeholder="Nome" className="h-8 text-xs flex-1" />
            <Input type="number" step="0.01" value={ing.extra_price ?? ""} onChange={(e) => updateIngredient(idx, "extra_price", e.target.value ? parseFloat(e.target.value) : null)} placeholder="Extra R$" className="h-8 text-xs w-20" />
            <label className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
              <input type="checkbox" checked={ing.removable} onChange={(e) => updateIngredient(idx, "removable", e.target.checked)} />
              Removível
            </label>
            <button onClick={() => removeIngredient(idx)} className="text-destructive hover:text-destructive/80"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        ))}
      </div>

      {/* Ficha técnica (recipe_items → raw_materials, separado dos ingredientes de exibição acima) */}
      <RecipeBuilder ref={recipeBuilderRef} menuItemId={item?.id} />

      {/* Variants */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Variantes</label>
          <button onClick={addVariant} className="text-xs text-primary hover:underline flex items-center gap-1">
            <Plus className="h-3 w-3" /> Adicionar
          </button>
        </div>
        {variants.map((v, idx) => (
          <div key={idx} className="flex items-center gap-2 rounded-lg bg-secondary/30 p-2">
            <Input value={v.name} onChange={(e) => setVariants(variants.map((vv, i) => i === idx ? { ...vv, name: e.target.value } : vv))} placeholder="Nome da variante" className="h-8 text-xs flex-1" />
            <button onClick={() => removeVariant(idx)} className="text-destructive hover:text-destructive/80"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        ))}
      </div>

      <div className="flex gap-2 pt-2">
        {isPublished ? (
          <>
            <Button onClick={() => handleSave("published")} disabled={saving || uploading || generating} className="gap-2">
              <Save className="h-4 w-4" /> {saving ? "Salvando..." : "Salvar"}
            </Button>
            <Button variant="outline" onClick={() => handleSave("draft")} disabled={saving || uploading || generating}>Voltar para rascunho</Button>
          </>
        ) : (
          <>
            <Button variant="outline" onClick={() => handleSave("draft")} disabled={saving || uploading || generating} className="gap-2">
              <Save className="h-4 w-4" /> {saving ? "Salvando..." : "Salvar rascunho"}
            </Button>
            <Button onClick={() => handleSave("published")} disabled={saving || uploading || generating}>Publicar</Button>
          </>
        )}
        <Button variant="outline" onClick={handleCancel} disabled={saving}>Cancelar</Button>
      </div>
    </div>
  );
};

// ── Menu Tab ──
const MenuTab = () => {
  const { menuItems, categories, loadingMenu, loadingCategories, saveMenuItem, deleteMenuItem, saveCategory, deleteCategory } = useAdminData();
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
        <Button onClick={() => setCreating(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Novo Item
        </Button>
        <Button variant="outline" onClick={() => setShowCategories(!showCategories)} className="gap-2">
          <Tags className="h-4 w-4" /> Categorias ({categories.length})
        </Button>
      </div>

      {/* Categories Management */}
      {showCategories && (
        <div className="rounded-xl border border-border p-4 space-y-3 bg-muted/30">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Gerenciar Categorias</h3>
            <button onClick={() => setCreatingCategory(true)} className="text-xs text-primary hover:underline flex items-center gap-1">
              <Plus className="h-3 w-3" /> Nova
            </button>
          </div>

          {(creatingCategory || editingCategory) && (
            <CategoryEditor
              category={editingCategory ?? undefined}
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
                  {cat.destination === "kitchen" ? "Cozinha" : "Bar"}
                </span>
                <button onClick={() => setEditingCategory(cat)} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground">
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
                            <Button size="sm" className="flex-1 gap-2" onClick={() => setEditingItem(item)}>
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

export default MenuTab;
