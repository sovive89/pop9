// AI Studio do Pop9 ERP — lado do navegador.
//
// A lógica de IA (provedores, prompt, chamada ao gateway) roda no servidor, em
// supabase/functions/_shared/ai-studio, porque usa a chave AI_GATEWAY_API_KEY e
// o runtime Deno das Edge Functions não importa código de src/. Aqui ficam só
// o catálogo de modelos exibido na tela e o contrato HTTP da função.
// O teste src/test/aiStudio.test.ts garante que este catálogo e o do servidor
// têm exatamente os mesmos modelos.

/** Modelos de imagem oferecidos no editor de itens do cardápio. */
export const AI_IMAGE_MODELS = [
  { id: "google/gemini-3.1-flash-image", label: "Nano Banana 2 (Google)" },
  { id: "openai/gpt-image-2", label: "GPT Image 2 (OpenAI)" },
  { id: "bfl/flux-2-pro", label: "Flux 2 Pro (fotorrealista)" },
  { id: "bytedance/seedream-5.0-lite", label: "Seedream 5 Lite (econômico)" },
  { id: "spacexai/grok-imagine-image-2.0", label: "Grok Imagine 2 (xAI)" },
  { id: "spacexai/grok-imagine-image", label: "Grok Imagine (xAI, econômico)" },
];

/** Contrato HTTP da Edge Function `generate-menu-image` (inalterado). */
export interface GenerateMenuImageRequest {
  name: string;
  description?: string;
  ingredients?: string[];
  model: string;
  extra?: string;
}

export interface GenerateMenuImageResponse {
  url?: string;
  model?: string;
  error?: string;
}
