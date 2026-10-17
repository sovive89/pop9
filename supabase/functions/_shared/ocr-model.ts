import { documentPart } from "./stock-ocr.ts";

// Verified in the AI Gateway model catalog: image, PDF and structured-output support.
export const DEFAULT_OCR_MODEL = "openai/gpt-6-astra";
export const DEFAULT_OCR_FALLBACK_MODEL = "openai/gpt-5.6-luna";

export function validateOCRModelName(model: string): string {
  const value = model.trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/.test(value)) {
    throw new Error(
      "Informe o identificador do modelo, como gpt-6-astra, e não o nome da empresa.",
    );
  }
  return value;
}

export function isDirectOpenAI(endpoint: string | null | undefined): boolean {
  if (!endpoint) return false;
  try {
    return new URL(endpoint).hostname === "api.openai.com";
  } catch {
    return false;
  }
}

/** Gateway IDs carry a provider prefix; the direct OpenAI API expects the native ID. */
export function createOCRRequest(params: {
  model?: string | undefined;
  endpoint?: string | null | undefined;
  prompt: string;
  data: { base64: string; mimeType: string; fileName?: string | undefined };
}) {
  const selected = validateOCRModelName(params.model?.trim() || DEFAULT_OCR_MODEL);
  const direct = isDirectOpenAI(params.endpoint);
  if (direct && selected.includes("/") && !selected.startsWith("openai/")) {
    throw new Error("Para o endpoint OpenAI, selecione um modelo OpenAI, como gpt-6-astra.");
  }
  const model = direct
    ? selected.replace(/^openai\//, "")
    : !params.endpoint && !selected.includes("/")
      ? `openai/${selected}`
      : selected;
  const openAI = direct || model.startsWith("openai/");
  // Some GPT-5/6 and reasoning models reject a custom temperature. Omitting it supports
  // models with a different parameter set when the operator changes the configuration.
  const reasoning = /^(?:openai\/)?(?:gpt-[56]|o[134])(?:[.-]|$)/.test(model);
  return {
    model,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: params.prompt },
          documentPart(
            params.data,
            /^(?:openai\/)?gpt-(?:6-astra|5\.6-luna|5\.4-mini)$/.test(model) ? "original" : "high",
          ),
        ],
      },
    ],
    ...(reasoning ? {} : { temperature: 0 }),
    ...(/^(?:openai\/)?gpt-5(?:\.4)?-mini$/.test(model) ? { reasoning_effort: "minimal" } : {}),
    ...(/^(?:openai\/)?gpt-(?:6-astra|5\.6-luna)$/.test(model) ? { reasoning_effort: "low" } : {}),
    ...(openAI ? { response_format: { type: "json_object" } } : {}),
    stream: false,
  };
}
