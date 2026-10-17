import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { DEFAULT_BUILD_RULE, buildRuleError, type BuildRule } from "@/lib/buildRule";

type Row = { enabled: boolean; min_items: number; max_items: number; discount_mode: "percent" | "amount"; discount_value: number };
// A tabela ainda não está nos tipos gerados do Supabase.
type RulesTable = {
  select(c: string): { eq(c: string, v: string): { maybeSingle(): Promise<{ data: Row | null; error: unknown }> } };
  upsert(v: Record<string, unknown>): Promise<{ error: unknown }>;
};
const rules = () => (supabase as unknown as { from(t: string): RulesTable }).from("menu_build_rules");

/** Regra do "Monte o seu combo": o cliente escolhe itens elegíveis do cardápio e ganha desconto. */
export default function BuildRuleCard({ unit, canEdit, categories, eligibleCount }: { unit: string; canEdit: boolean; categories: string[]; eligibleCount: number }) {
  const [rule, setRule] = useState<BuildRule>(DEFAULT_BUILD_RULE);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let current = true;
    setState("loading");
    void rules().select("enabled,min_items,max_items,discount_mode,discount_value").eq("business_unit_id", unit).maybeSingle()
      .then(({ data, error }) => {
        if (!current) return;
        if (error) { setState("missing"); return; }
        setRule(data ? { enabled: data.enabled, minItems: data.min_items, maxItems: data.max_items, discount: { mode: data.discount_mode, value: Number(data.discount_value) } } : DEFAULT_BUILD_RULE);
        setState("ready");
      });
    return () => { current = false; };
  }, [unit]);
  const problem = buildRuleError(rule);
  const save = async () => {
    setSaving(true);
    const { error } = await rules().upsert({ business_unit_id: unit, enabled: rule.enabled, min_items: rule.minItems, max_items: rule.maxItems, discount_mode: rule.discount.mode, discount_value: rule.discount.value, updated_at: new Date().toISOString() });
    setSaving(false);
    if (error) toast.error("Não foi possível salvar a regra"); else toast.success("Regra salva");
  };
  if (state === "loading") return null;
  if (state === "missing") return <p className="text-xs text-muted-foreground">A regra do "Monte o seu combo" ainda não está instalada nesta unidade (falta aplicar a migration).</p>;
  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Monte o seu combo</h3>
          <p className="text-xs text-muted-foreground">O cliente escolhe itens do cardápio marcados como elegíveis para combo e ganha o desconto abaixo.</p>
        </div>
        <Switch aria-label="Ativar monte o seu combo" checked={rule.enabled} disabled={!canEdit} onCheckedChange={(enabled) => setRule({ ...rule, enabled })} />
      </div>
      <p className="text-xs text-muted-foreground">Entram <strong>todas as categorias</strong> e todos os itens elegíveis: {eligibleCount} {eligibleCount === 1 ? "item" : "itens"}{categories.length ? ` em ${categories.join(", ")}` : ""}. Para tirar um item, desmarque "elegível para combo" no cadastro dele.</p>
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="space-y-1 text-xs text-muted-foreground">Mínimo de itens
          <Input type="number" min={2} max={20} disabled={!canEdit} value={rule.minItems} onChange={(e) => setRule({ ...rule, minItems: Math.round(Number(e.target.value) || 0) })} /></label>
        <label className="space-y-1 text-xs text-muted-foreground">Máximo de itens
          <Input type="number" min={2} max={20} disabled={!canEdit} value={rule.maxItems} onChange={(e) => setRule({ ...rule, maxItems: Math.round(Number(e.target.value) || 0) })} /></label>
        <label className="space-y-1 text-xs text-muted-foreground">Tipo de desconto
          <select disabled={!canEdit} value={rule.discount.mode} onChange={(e) => setRule({ ...rule, discount: { ...rule.discount, mode: e.target.value as "percent" | "amount" } })} className="w-full rounded-md border border-border bg-background p-2 text-sm text-foreground">
            <option value="percent">Percentual (%)</option><option value="amount">Valor (R$)</option></select></label>
        <label className="space-y-1 text-xs text-muted-foreground">Desconto
          <Input type="number" min={0} step="0.01" disabled={!canEdit} value={rule.discount.value} onChange={(e) => setRule({ ...rule, discount: { ...rule.discount, value: Math.max(0, Number(e.target.value) || 0) } })} /></label>
      </div>
      {problem && <p role="alert" className="text-xs text-destructive">{problem}</p>}
      {canEdit && <Button size="sm" disabled={saving || Boolean(problem)} onClick={save}>{saving ? "Salvando…" : "Salvar regra"}</Button>}
    </div>
  );
}
