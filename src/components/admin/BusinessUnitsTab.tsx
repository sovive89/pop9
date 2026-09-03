import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Building2, Plus, Loader2 } from "lucide-react";

interface BusinessUnit {
  id: string;
  name: string;
  establishment_type: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  table_count: number | null;
  active: boolean;
}

const DEFAULT_CATEGORIES = [
  { key: "burgers", label: "Burgers", destination: "kitchen", sort_order: 0 },
  { key: "sides", label: "Acompanhamentos", destination: "kitchen", sort_order: 1 },
  { key: "drinks", label: "Bebidas", destination: "bar", sort_order: 2 },
  { key: "desserts", label: "Sobremesas", destination: "kitchen", sort_order: 3 },
];

const BusinessUnitsTab = () => {
  const [units, setUnits] = useState<BusinessUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [establishmentType, setEstablishmentType] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [tableCount, setTableCount] = useState("");

  const loadUnits = useCallback(async () => {
    const { data, error } = await supabase.from("business_units").select("*").order("name");
    if (error) {
      toast.error("Erro ao carregar unidades");
      setLoading(false);
      return;
    }
    setUnits(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadUnits();
  }, [loadUnits]);

  const resetForm = () => {
    setName("");
    setEstablishmentType("");
    setAddress("");
    setCity("");
    setState("");
    setTableCount("");
    setShowForm(false);
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error("Informe o nome da unidade");
      return;
    }
    setSaving(true);
    try {
      // Só existe 1 `businesses` hoje — todo negócio novo pendura nela
      // até o app ter de fato um fluxo de cadastro de businesses.
      const { data: business, error: businessErr } = await supabase
        .from("businesses")
        .select("id")
        .limit(1)
        .maybeSingle();

      if (businessErr || !business) {
        toast.error("Nenhum negócio (businesses) encontrado para vincular a unidade");
        return;
      }

      const { data: unit, error: unitErr } = await supabase
        .from("business_units")
        .insert({
          business_id: business.id,
          name: name.trim(),
          establishment_type: establishmentType.trim() || null,
          address: address.trim() || null,
          city: city.trim() || null,
          state: state.trim() || null,
          table_count: tableCount ? Number(tableCount) : null,
        })
        .select()
        .single();

      if (unitErr || !unit) {
        toast.error("Erro ao criar unidade: " + unitErr?.message);
        return;
      }

      // Provisionamento automático no padrão canônico: as categorias
      // padrão de cardápio já nascem prontas para a unidade nova, sem
      // precisar o admin recriar manualmente. Nenhum menu_item/raw_material
      // de exemplo é criado — só a estrutura, não conteúdo fake.
      const { error: catErr } = await supabase.from("menu_categories").insert(
        DEFAULT_CATEGORIES.map((c) => ({ ...c, business_unit_id: unit.id }))
      );
      if (catErr) {
        toast.error("Unidade criada, mas erro ao provisionar categorias padrão: " + catErr.message);
      } else {
        toast.success("Unidade criada com categorias de cardápio padrão");
      }

      resetForm();
      await loadUnits();
    } finally {
      setSaving(false);
    }
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
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" /> Unidades
        </h3>
        <Button size="sm" className="gap-2" onClick={() => setShowForm(!showForm)}>
          <Plus className="h-3.5 w-3.5" /> Nova unidade
        </Button>
      </div>

      {showForm && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-sm font-medium text-muted-foreground">Nome</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Confit Burguer - Filial 02"
                className="mt-1 w-full h-10 rounded-lg border border-border bg-muted px-3 text-foreground text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Tipo de estabelecimento</label>
              <input
                value={establishmentType}
                onChange={(e) => setEstablishmentType(e.target.value)}
                placeholder="Hamburgueria"
                className="mt-1 w-full h-10 rounded-lg border border-border bg-muted px-3 text-foreground text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Número de mesas</label>
              <input
                type="number"
                value={tableCount}
                onChange={(e) => setTableCount(e.target.value)}
                className="mt-1 w-full h-10 rounded-lg border border-border bg-muted px-3 text-foreground text-sm"
              />
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium text-muted-foreground">Endereço</label>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="mt-1 w-full h-10 rounded-lg border border-border bg-muted px-3 text-foreground text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Cidade</label>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="mt-1 w-full h-10 rounded-lg border border-border bg-muted px-3 text-foreground text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Estado</label>
              <input
                value={state}
                onChange={(e) => setState(e.target.value)}
                maxLength={2}
                className="mt-1 w-full h-10 rounded-lg border border-border bg-muted px-3 text-foreground text-sm uppercase"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={resetForm}>Cancelar</Button>
            <Button className="flex-1" disabled={saving} onClick={handleCreate}>
              {saving ? "Criando..." : "Criar unidade"}
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {units.map((u) => (
          <div key={u.id} className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
            <div>
              <p className="text-sm font-semibold text-foreground">{u.name}</p>
              <p className="text-xs text-muted-foreground">
                {[u.establishment_type, u.city, u.state].filter(Boolean).join(" · ") || "Sem detalhes"}
                {u.table_count ? ` · ${u.table_count} mesas` : ""}
              </p>
            </div>
            <span className={`text-xs font-medium px-2 py-1 rounded-full ${u.active ? "bg-green-500/10 text-green-500" : "bg-muted text-muted-foreground"}`}>
              {u.active ? "Ativa" : "Inativa"}
            </span>
          </div>
        ))}
        {units.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">Nenhuma unidade cadastrada.</p>
        )}
      </div>
    </div>
  );
};

export default BusinessUnitsTab;
