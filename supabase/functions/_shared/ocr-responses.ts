import { createOCRRequest } from "./ocr-model.ts";

const nullableText = { type: ["string", "null"] };
const nullableNumber = { type: ["number", "null"] };

export const OCR_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    documentoTipo: {
      type: ["string", "null"],
      enum: ["nfe", "nfce", "danfe", "cupom", "comprovante", "outro", null],
    },
    fornecedorNome: nullableText,
    fornecedorDocumento: nullableText,
    numeroNota: nullableText,
    serie: nullableText,
    chaveAcesso: nullableText,
    dataEmissao: nullableText,
    valorTotal: nullableNumber,
    confianca: { type: ["number", "null"], minimum: 0, maximum: 1 },
    itens: {
      type: "array",
      items: {
        type: "object",
        properties: {
          descricao: { type: "string" },
          quantidade: nullableNumber,
          unidade: nullableText,
          valorUnitario: nullableNumber,
          lote: nullableText,
          fabricacao: nullableText,
          validade: nullableText,
        },
        required: [
          "descricao",
          "quantidade",
          "unidade",
          "valorUnitario",
          "lote",
          "fabricacao",
          "validade",
        ],
        additionalProperties: false,
      },
    },
  },
  required: [
    "documentoTipo",
    "fornecedorNome",
    "fornecedorDocumento",
    "numeroNota",
    "serie",
    "chaveAcesso",
    "dataEmissao",
    "valorTotal",
    "confianca",
    "itens",
  ],
  additionalProperties: false,
};

/** Upgrade saved OpenAI/Gateway Chat endpoints while preserving third-party Chat adapters. */
export function resolveOCRTransport(endpoint: string) {
  const url = new URL(endpoint);
  const gateway = url.hostname === "ai-gateway.vercel.sh";
  if (
    (gateway || url.hostname === "api.openai.com") &&
    /^\/v1\/(?:chat\/completions|responses)\/?$/.test(url.pathname)
  ) {
    url.pathname = "/v1/responses";
  }
  return { endpoint: url.toString(), responses: /\/responses\/?$/.test(url.pathname), gateway };
}

export function createOCRResponsesRequest(params: Parameters<typeof createOCRRequest>[0]) {
  const chat = createOCRRequest(params);
  const model = chat.model;
  const media =
    params.data.mimeType === "application/pdf"
      ? {
          type: "input_file",
          filename: params.data.fileName || "documento.pdf",
          file_data: `data:application/pdf;base64,${params.data.base64}`,
        }
      : {
          type: "input_image",
          image_url: `data:${params.data.mimeType};base64,${params.data.base64}`,
          detail: /^(?:openai\/)?gpt-(?:6-astra|5\.6-luna|5\.4-mini)$/.test(model)
            ? "original"
            : "high",
        };
  return {
    model,
    input: [{ role: "user", content: [{ type: "input_text", text: params.prompt }, media] }],
    ...(chat.reasoning_effort ? { reasoning: { effort: chat.reasoning_effort } } : {}),
    ...(chat.temperature !== undefined ? { temperature: chat.temperature } : {}),
    text: {
      format: {
        type: "json_schema",
        name: "fastbar_stock_ocr",
        strict: true,
        schema: OCR_RESPONSE_SCHEMA,
      },
    },
    store: false,
    stream: false,
  };
}

export function extractOCRResponseText(value: unknown): {
  text: string;
  refused: boolean;
  incomplete: boolean;
} {
  const payload = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const output = Array.isArray(payload["output"]) ? payload["output"] : [];
  const parts: string[] = [];
  let refused = false;
  for (const raw of output) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    if (
      item["type"] !== "message" ||
      item["role"] !== "assistant" ||
      !Array.isArray(item["content"])
    )
      continue;
    for (const rawPart of item["content"]) {
      if (!rawPart || typeof rawPart !== "object") continue;
      const part = rawPart as Record<string, unknown>;
      if (part["type"] === "refusal") refused = true;
      if (part["type"] === "output_text" && typeof part["text"] === "string")
        parts.push(part["text"]);
    }
  }
  const text =
    parts.length > 0
      ? parts.join("")
      : typeof payload["output_text"] === "string"
        ? payload["output_text"]
        : "";
  return {
    text,
    refused,
    incomplete: ["incomplete", "failed", "queued", "in_progress"].includes(
      String(payload["status"]),
    ),
  };
}
