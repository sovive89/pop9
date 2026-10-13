import {
  createOCRResponsesRequest,
  extractOCRResponseText,
  resolveOCRTransport,
} from "./ocr-responses.ts";
import { createOCRRequest } from "./ocr-model.ts";
import { parseOCRText } from "./ocr-contract.ts";

class OCRRequestError extends Error {
  readonly retryable: boolean;
  constructor(message: string, retryable: boolean) {
    super(message);
    this.retryable = retryable;
  }
}

/** At most two model attempts; the alternative never writes stock or replaces operator review. */
export async function requestOCR(params: {
  endpoint: string;
  apiKey: string;
  model: string;
  fallbackModel?: string | undefined;
  prompt: string;
  data: { base64: string; mimeType: string; fileName?: string | undefined };
  fetcher?: typeof fetch;
}) {
  const models = [params.model];
  if (params.fallbackModel && params.fallbackModel !== params.model)
    models.push(params.fallbackModel);
  const fetcher = params.fetcher ?? fetch;
  const transport = resolveOCRTransport(params.endpoint);
  for (const [index, model] of models.entries()) {
    // Request validation errors (e.g. a wrong provider at api.openai.com) are not retried.
    const body = (transport.responses ? createOCRResponsesRequest : createOCRRequest)({
      model,
      endpoint: transport.gateway ? undefined : transport.endpoint,
      prompt: params.prompt,
      data: params.data,
    });
    const clientRequestId = crypto.randomUUID();
    try {
      const response = await fetcher(transport.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Client-Request-Id": clientRequestId,
          ...(params.apiKey ? { Authorization: `Bearer ${params.apiKey}` } : {}),
        },
        signal: AbortSignal.timeout(30_000),
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const requestId = response.headers.get("x-request-id");
        const errorBody = (await response.json().catch(() => null)) as {
          error?: { code?: string; type?: string };
        } | null;
        const code = errorBody?.error?.code ?? errorBody?.error?.type;
        const quotaExceeded =
          code === "insufficient_quota" || code === "billing_hard_limit_reached";
        console.warn("OCR: falha na API", {
          model: body.model,
          status: response.status,
          requestId,
          clientRequestId,
        });
        throw new OCRRequestError(
          quotaExceeded
            ? "A conta da IA está sem créditos ou atingiu o limite de uso. Confira o faturamento."
            : `${
                response.status === 401
                  ? "A chave da IA foi recusada. Confira a chave salva em Conexões."
                  : response.status === 403
                    ? "A conta da IA não tem permissão para usar este serviço ou modelo."
                    : response.status === 404
                      ? `O modelo ${body.model} ou o endpoint não está disponível para esta conta. Confira Conexões.`
                      : response.status === 400
                        ? "A IA recusou o formato da leitura. Confira o modelo e o endpoint em Conexões."
                        : "O serviço OCR não conseguiu concluir a leitura."
              } (HTTP ${response.status})${requestId ? ` ID: ${requestId}` : ""}`,
          !quotaExceeded &&
            (response.status === 408 || response.status === 429 || response.status >= 500),
        );
      }
      const payload: unknown = await response.json();
      let text: string | undefined;
      if (transport.responses) {
        const output = extractOCRResponseText(payload);
        if (output.refused)
          throw new OCRRequestError("A IA não pôde analisar a imagem enviada.", false);
        if (output.incomplete)
          throw new OCRRequestError(
            "A leitura ficou incompleta. Envie uma foto mais próxima ou um documento menor.",
            true,
          );
        text = output.text;
      } else {
        const chat = payload as {
          choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
        };
        const content = chat.choices?.[0]?.message?.content;
        text = Array.isArray(content) ? content.map((part) => part.text ?? "").join("") : content;
      }
      if (!text) throw new OCRRequestError("A IA não retornou conteúdo para leitura.", true);
      const parsed = parseOCRText(text);
      if (
        !parsed ||
        typeof parsed !== "object" ||
        Array.isArray(parsed) ||
        !Array.isArray(parsed["itens"])
      ) {
        throw new OCRRequestError("A IA retornou uma lista de itens inválida.", true);
      }
      return parsed;
    } catch (error) {
      const retryable = !(error instanceof OCRRequestError) || error.retryable;
      if (!retryable || index === models.length - 1) throw error;
    }
  }
  throw new Error("Não foi possível ler o documento.");
}
