import { useState, useRef } from "react";
import { Flame, Plus, Trash2, Pencil, Save, X, ChevronDown, ChevronUp, Tags, ImagePlus, Image } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAdminData, type DbMenuItem, type DbIngredient, type DbVariant, type DbMenuCategory } from "@/hooks/useAdminData";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/utils/orders";
import { toast } from "sonner";

// ── Image Upload Helper ──
const uploadMenuImage = async (file: File, itemId: string): Promise<string | null> => {
  const ext = file.name.split(".").pop();
  const path = `${itemId}.${ext}`;

  // Remove old file if exists
  await supabase.storage.from("menu-images").remove([path]);

  const { error } = await supabase.storage.from("menu-images").upload(path, file, { upsert: true });
  if (error) {
    toast.error("Erro ao enviar imagem: " + error.message);
    return null;
  }

  const { data } = supabase.storage.from("menu-images").getPublicUrl(path);
  return data.publicUrl;
};

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

  const handleSave = async () => {
    if (!key.trim() || !label.trim()) {
      toast.error("Chave e nome são obrigatórios");
      return;
    }
    setSaving(true);
    const ok = await onSave(
      { id: category?.id, key: key.trim().toLowerCase(), label: label.trim(), destination, sort_order: parseInt(sortOrder) || 0 },
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
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="ex: Saladas" className="h-8 text-sm" />
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
  onSave: (item: any, isNew: boolean) => Promise<boolean>;
  onCancel: () => void;
}

const MenuItemEditor = ({ item, categories, onSave, onCancel }: MenuEditorProps) => {
  const isNew = !item;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [id, setId] = useState(item?.id ?? "");
  const [name, setName] = useState(item?.name ?? "");
  const [price, setPrice] = useState(item?.price?.toString() ?? "");
  const [category, setCategory] = useState(item?.category ?? (categories[0]?.key ?? ""));
  const [description, setDescription] = useState(item?.description ?? "");
  const [imageUrl, setImageUrl] = useState(item?.image_url ?? "");
  const [sortOrder, setSortOrder] = useState(item?.sort_order?.toString() ?? "0");
  const [active, setActive] = useState(item?.active ?? true);
  const [uploading, setUploading] = useState(false);
  const [ingredients, setIngredients] = useState<Omit<DbIngredient, "id">[]>(
    item?.ingredients?.map(({ id: _, ...rest }) => rest) ?? []
  );
  const [variants, setVariants] = useState<Omit<DbVariant, "id">[]>(
    item?.variants?.map(({ id: _, ...rest }) => rest) ?? []
  );
  const [saving, setSaving] = useState(false);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!id.trim()) {
      toast.error("Preencha o ID do item antes de enviar a imagem");
      return;
    }
    setUploading(true);
    const url = await uploadMenuImage(file, id.trim());
    if (url) setImageUrl(url + "?t=" + Date.now());
    setUploading(false);
  };

  const removeImage = () => {
    setImageUrl("");
  };

  const handleSave = async () => {
    if (!id.trim() || !name.trim() || !price) {
      toast.error("ID, nome e preço são obrigatórios");
      return;
    }
    setSaving(true);
    const ok = await onSave(
      {
        id: id.trim(),
        name: name.trim(),
        price: parseFloat(price),
        category,
        description: description.trim() || null,
        image_url: imageUrl.trim() || null,
        sort_order: parseInt(sortOrder) || 0,
        active,
        ingredients,
        variants,
      },
      isNew
    );
    setSaving(false);
    if (ok) onCancel();
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
        <button onClick={onCancel} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">ID</label>
          <Input value={id} onChange={(e) => setId(e.target.value)} disabled={!isNew} placeholder="ex: b8" className="h-9" />
        </div>
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
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Ordem</label>
          <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="h-9" />
        </div>
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
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" /> {saving ? "Salvando..." : "Salvar"}
        </Button>
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
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
                <span className="flex-1 text-sm font-medium text-foreground">{cat.label}</span>
                <span className="text-xs text-muted-foreground">{cat.key}</span>
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
                {items.map((item) => (
                  <div key={item.id} className={`px-4 py-3 flex items-center gap-3 ${!item.active ? "opacity-50" : ""}`}>
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.name} className="w-10 h-10 rounded-lg object-cover border border-border flex-shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                        <Image className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">{item.name}</span>
                        <span className="text-xs text-muted-foreground">({item.id})</span>
                        {!item.active && <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Inativo</span>}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                      {item.ingredients.length > 0 && <p className="text-[10px] text-muted-foreground">{item.ingredients.length} ingredientes</p>}
                      {item.variants.length > 0 && <p className="text-[10px] text-muted-foreground">{item.variants.length} variantes</p>}
                    </div>
                    <span className="font-semibold text-primary whitespace-nowrap">{formatCurrency(item.price)}</span>
                    <div className="flex gap-1">
                      <button onClick={() => setEditingItem(item)} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => { if (confirm(`Excluir "${item.name}"?`)) deleteMenuItem(item.id); }}
                        className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
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
