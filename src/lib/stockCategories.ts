/** Categorias operacionais dos insumos comprados. Produtos fabricados usam produção/lotes. */
export const STOCK_CATEGORIES = [
  { value: "insumos", label: "Insumos", hint: "Ingredientes e matérias-primas de receitas" },
  { value: "unitarios", label: "Itens unitários", hint: "Produtos com desconto direto por unidade" },
  { value: "bar", label: "Bar", hint: "Bebidas e ingredientes operados no bar" },
  { value: "limpeza", label: "Limpeza e higiene", hint: "Detergentes, papel, desinfetantes e higiene" },
  { value: "operacionais", label: "Consumíveis operacionais", hint: "Gás, óleo de uso prolongado e consumíveis gerais" },
] as const;

export type StockCategory = (typeof STOCK_CATEGORIES)[number]["value"];

const LEGACY: Record<string, StockCategory> = {
  insumo: "insumos", ingredientes: "insumos", carnes: "insumos", vegetais: "insumos", hortifruti: "insumos",
  unitario: "unitarios", unidade: "unitarios", unidades: "unitarios", revenda: "unitarios",
  bebidas: "bar", bebida: "bar", coquetelaria: "bar",
  higiene: "limpeza", limpeza: "limpeza", descartaveis: "limpeza",
  gas: "operacionais", combustiveis: "operacionais", consumo: "operacionais", manutencao: "operacionais",
};

/** Não inferir unidade de medida nem categoria pelo nome do produto. */
export function stockCategory(value: string | null | undefined, itemType?: string): StockCategory {
  const normalized = (value || "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return STOCK_CATEGORIES.find(category => category.value === normalized)?.value
    ?? LEGACY[normalized]
    ?? (itemType === "revenda" ? "unitarios" : "insumos");
}
