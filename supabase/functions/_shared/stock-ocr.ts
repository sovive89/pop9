export type OCRItem = {
  descricao: string;
  quantidade: number | null;
  unidade: string;
  valorUnitario: number | null;
};

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Empty/illegible fields stay null; Number(null) must never turn them into zero. */
export function ocrNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const raw = value
    .trim()
    .replace(/^R\$\s*/, "")
    .replace(/\s/g, "");
  if (!/^-?\d+(?:[.,]\d+)*$/.test(raw)) return null;
  if (raw.includes(",") && !/^-?(?:\d+|\d{1,3}(?:\.\d{3})+),\d+$/.test(raw)) return null;
  const number = Number(raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw);
  return Number.isFinite(number) ? number : null;
}

export function parseOCRText(value: string): unknown {
  const cleaned = value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("Resposta da IA não contém JSON válido.");
    return JSON.parse(cleaned.slice(start, end + 1));
  }
}

/** Validate both Gateway and custom-service output before it reaches stock entry forms. */
export function normalizeOCR(value: unknown, options: { readPrices?: boolean } = {}) {
  const readPrices = options.readPrices !== false;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("A IA retornou um documento inválido.");
  }
  const result = record(value);
  if (result["ok"] === false)
    throw new Error("O serviço de leitura não conseguiu ler o documento.");
  if (!Array.isArray(result["itens"]))
    throw new Error("A IA não retornou uma lista de itens válida.");
  const avisos: string[] = [];
  const itens: OCRItem[] = [];
  for (const [index, raw] of result["itens"].entries()) {
    const item = record(raw);
    const descricao = text(item["descricao"]);
    if (!descricao) {
      avisos.push(`Linha ${index + 1}: descrição ilegível; confira se falta um produto.`);
      continue;
    }
    const quantity = ocrNumber(item["quantidade"]);
    const quantidade = quantity !== null && quantity > 0 ? quantity : null;
    const price = readPrices ? ocrNumber(item["valorUnitario"]) : null;
    let valorUnitario = price !== null && price >= 0 ? price : null;
    const total = readPrices ? ocrNumber(item["valorTotal"]) : null;
    // Derive only from two readable fields; never assume quantity = 1.
    if (valorUnitario === null && quantidade !== null && total !== null && total >= 0) {
      valorUnitario = total / quantidade;
      avisos.push(
        `"${descricao}": valor unitário calculado pelo total da linha; confira descontos.`,
      );
    }
    if (quantidade === null)
      avisos.push(`"${descricao}": quantidade não lida; preencha manualmente.`);
    if (readPrices && valorUnitario === null)
      avisos.push(`"${descricao}": valor unitário não lido; preencha manualmente.`);
    if (
      quantidade !== null &&
      valorUnitario !== null &&
      total !== null &&
      Math.abs(quantidade * valorUnitario - total) > Math.max(0.02, Math.abs(total) * 0.01)
    ) {
      avisos.push(
        `"${descricao}": quantidade × valor unitário difere do total da linha; confira descontos e dígitos.`,
      );
    }
    itens.push({ descricao, quantidade, unidade: text(item["unidade"]) ?? "", valorUnitario });
  }
  const rawKey = text(result["chaveAcesso"])?.replace(/\D/g, "") ?? null;
  const chaveAcesso = rawKey && /^\d{44}$/.test(rawKey) ? rawKey : null;
  if (rawKey && !chaveAcesso)
    avisos.push("Chave de acesso incompleta; confira os 44 dígitos no documento.");
  const rawConfidence = ocrNumber(result["confianca"]);
  const confianca =
    rawConfidence !== null && rawConfidence >= 0 && rawConfidence <= 100
      ? rawConfidence > 1
        ? rawConfidence / 100
        : rawConfidence
      : null;
  const total = ocrNumber(result["valorTotal"]);
  return {
    fornecedorNome: text(result["fornecedorNome"]),
    fornecedorDocumento: text(result["fornecedorDocumento"]),
    numeroNota: text(result["numeroNota"]),
    chaveAcesso,
    dataEmissao: text(result["dataEmissao"]),
    valorTotal: total !== null && total >= 0 ? total : null,
    confianca,
    itens,
    avisos,
  };
}

/** Chat Completions uses file parts for PDF, never an image_url with application/pdf. */
export function documentPart(
  data: {
    base64: string;
    mimeType: string;
    fileName?: string | undefined;
  },
  detail: "high" | "original" = "high",
) {
  if (data.mimeType === "application/pdf") {
    return {
      type: "file",
      file: {
        filename: data.fileName || "documento.pdf",
        file_data: `data:application/pdf;base64,${data.base64}`,
      },
    };
  }
  return {
    type: "image_url",
    image_url: { url: `data:${data.mimeType};base64,${data.base64}`, detail },
  };
}
