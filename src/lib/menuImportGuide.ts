import type { MenuImportItem, MenuImportRecipeLine } from "@/lib/menuImport";

// Revisão guiada: verificações determinísticas, item por item, com explicação e
// correções SEGURAS (só converte unidade quando o fator é conhecido: g↔kg, ml↔l).

export type GuideIssue = {
  id: string;
  severity: "error" | "warning" | "tip";
  title: string;
  explanation: string;
  fixLabel?: string;
  fix?: (item: MenuImportItem) => MenuImportItem;
};

const FACTORS: Record<string, Record<string, number>> = {
  g: { kg: 0.001 }, kg: { g: 1000 }, ml: { l: 0.001 }, l: { ml: 1000 },
};

/** Converte entre unidades da mesma dimensão. Retorna null quando não há fator conhecido. */
export function convertQuantity(quantity: number, from: string, to: string): number | null {
  if (from === to) return quantity;
  const factor = FACTORS[from]?.[to];
  return factor ? Math.round(quantity * factor * 1000) / 1000 : null;
}

function updateLine(item: MenuImportItem, index: number, patch: Partial<MenuImportRecipeLine>): MenuImportItem {
  return { ...item, recipe: item.recipe.map((line, i) => i === index ? { ...line, ...patch } : line) };
}

export function reviewItem(item: MenuImportItem, knownUnits: Record<string, string>): GuideIssue[] {
  const issues: GuideIssue[] = [];
  if (!item.name.trim()) issues.push({ id: "name", severity: "error", title: "Item sem nome", explanation: "O nome é o que o cliente e a equipe veem no cardápio e na comanda. Preencha antes de gravar." });
  if (!(item.price > 0)) issues.push({
    id: "price", severity: "warning", title: "Sem preço",
    explanation: "Sem preço o item pode ser gravado como rascunho, mas não pode ser publicado nem vendido. O arquivo não informava o valor — a IA não inventa preços.",
  });
  if (!item.recipe.length) issues.push({
    id: "recipe-empty", severity: "warning", title: "Ficha técnica vazia",
    explanation: "A ficha técnica diz quanto de cada insumo sai do estoque a cada venda. Sem ela, o custo do prato e a baixa de estoque ficam incompletos. Use “Adicionar insumo” para montar.",
  });
  item.recipe.forEach((line, index) => {
    const label = line.material.trim() || `Linha ${index + 1}`;
    if (!line.material.trim() || !(line.quantity > 0)) issues.push({
      id: `line-${index}`, severity: "error", title: `${label}: dados incompletos`,
      explanation: "Cada insumo precisa de nome e de uma quantidade maior que zero, na unidade escolhida, por UMA unidade vendida.",
    });
    const known = knownUnits[line.material.trim().toLowerCase()];
    if (known && known !== line.unit) {
      const converted = convertQuantity(line.quantity, line.unit, known);
      issues.push({
        id: `unit-${index}`, severity: "error", title: `${label}: unidade diferente do estoque`,
        explanation: converted !== null
          ? `Este insumo já está cadastrado em "${known}" e o arquivo usa "${line.unit}". Se gravar assim, ${line.quantity} ${line.unit} seria lido como ${line.quantity} ${known}. A correção converte para ${converted} ${known}.`
          : `Este insumo já está cadastrado em "${known}" e o arquivo usa "${line.unit}". Não existe conversão automática segura entre essas unidades: informe a quantidade em ${known}.`,
        ...(converted !== null ? { fixLabel: `Converter para ${converted} ${known}`, fix: (it: MenuImportItem) => updateLine(it, index, { unit: known, quantity: converted }) } : {}),
      });
    }
    if (line.unit === "kg" && line.quantity >= 5) issues.push({
      id: `big-${index}`, severity: "warning", title: `${label}: ${line.quantity} kg por unidade vendida?`,
      explanation: "A quantidade é por item vendido. Valores altos em kg costumam ser gramas digitadas na unidade errada.",
      fixLabel: `Usar ${line.quantity} g`, fix: it => updateLine(it, index, { unit: "g" }),
    });
    if (line.unit === "l" && line.quantity >= 5) issues.push({
      id: `bigl-${index}`, severity: "warning", title: `${label}: ${line.quantity} l por unidade vendida?`,
      explanation: "A quantidade é por item vendido. Valores altos em litros costumam ser mililitros na unidade errada.",
      fixLabel: `Usar ${line.quantity} ml`, fix: it => updateLine(it, index, { unit: "ml" }),
    });
    if (line.preparation) issues.push({
      id: `prep-${index}`, severity: "tip", title: `${label}: preparo da casa`,
      explanation: `Será criado como insumo produzido, com receita para ${line.preparation.outputQuantity} ${line.unit}. Isso é só o cadastro: a produção real é lançada no Estoque quando acontecer.`,
    });
  });
  return issues;
}
