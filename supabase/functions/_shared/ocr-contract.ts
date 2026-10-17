export type OCRDocumentType = "nfe" | "nfce" | "danfe" | "cupom" | "comprovante" | "outro";

export type OCRItem = {
  descricao: string;
  quantidade: number;
  unidade: string;
  valorUnitario: number;
  lote: string | null;
  fabricacao: string | null;
  validade: string | null;
};

export type OCRPayload = {
  fornecedorNome: string | null;
  fornecedorDocumento: string | null;
  numeroNota: string | null;
  serie: string | null;
  documentoTipo: OCRDocumentType | null;
  chaveAcesso: string | null;
  dataEmissao: string | null;
  valorTotal: number | null;
  confianca: number | null;
  itens: OCRItem[];
};

export function parseOCRText(text: string): Record<string, unknown> {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
    }
    throw new Error("Resposta da IA não contém JSON válido.");
  }
}

export function normalizeOCRDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  const br = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (br) return `${br[3] ?? ""}-${(br[2] ?? "").padStart(2, "0")}-${(br[1] ?? "").padStart(2, "0")}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function normalizeDocumentType(value: unknown): OCRDocumentType | null {
  return ["nfe", "nfce", "danfe", "cupom", "comprovante", "outro"].includes(String(value))
    ? (value as OCRDocumentType)
    : null;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function normalizeOCRPayload(input: Record<string, unknown>): OCRPayload {
  const rawItems = Array.isArray(input["itens"]) ? input["itens"] : [];
  const itens = rawItems.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    const descricao = nullableString(item["descricao"]);
    const quantidade = Number(item["quantidade"]);
    if (!descricao || !Number.isFinite(quantidade) || quantidade <= 0) return [];
    const valorUnitario = Number(item["valorUnitario"]);
    return [
      {
        descricao,
        quantidade,
        unidade: nullableString(item["unidade"]) ?? "un",
        valorUnitario: Number.isFinite(valorUnitario) && valorUnitario >= 0 ? valorUnitario : 0,
        lote: nullableString(item["lote"]),
        fabricacao: normalizeOCRDate(item["fabricacao"]),
        validade: normalizeOCRDate(item["validade"]),
      },
    ];
  });

  const chaveBruta = nullableString(input["chaveAcesso"]);
  const chaveAcesso = chaveBruta ? chaveBruta.replace(/\D/g, "") : null;
  const confianca = Number(input["confianca"]);

  return {
    fornecedorNome: nullableString(input["fornecedorNome"]),
    fornecedorDocumento: nullableString(input["fornecedorDocumento"]),
    numeroNota: nullableString(input["numeroNota"]),
    serie: nullableString(input["serie"]),
    documentoTipo: normalizeDocumentType(input["documentoTipo"]),
    chaveAcesso: chaveAcesso && /^\d{44}$/.test(chaveAcesso) ? chaveAcesso : null,
    dataEmissao: normalizeOCRDate(input["dataEmissao"]),
    valorTotal: Number.isFinite(Number(input["valorTotal"])) ? Number(input["valorTotal"]) : null,
    confianca: Number.isFinite(confianca) ? Math.max(0, Math.min(1, confianca)) : null,
    itens,
  };
}
