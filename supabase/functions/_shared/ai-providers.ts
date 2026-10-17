/** Providers enabled for the MVP, shared by credential configuration and its API. */
export const AI_PROVIDERS = [
  { id: "anthropic", label: "Anthropic — Claude (texto e documentos)" },
  { id: "google", label: "Google — Gemini (texto, documentos e imagens)" },
  { id: "openai", label: "OpenAI (texto, documentos e imagens)" },
  { id: "stability", label: "Stability AI — Stable Image Core (imagens)" },
] as const;
