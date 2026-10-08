// Modelos de imagem permitidos (lista fixa: cada geração custa dinheiro, então
// o servidor só aceita o que está aqui).
//
// "chat"   = modelos multimodais (Nano Banana), que geram imagem pela rota de chat;
// "images" = modelos só de imagem, pela rota de geração de imagens.
export type ImageRoute = "chat" | "images";

export const IMAGE_MODELS: Record<string, { route: ImageRoute }> = {
  "google/gemini-3.1-flash-image": { route: "chat" },   // Nano Banana 2
  "openai/gpt-image-2": { route: "images" },            // OpenAI
  "bfl/flux-2-pro": { route: "images" },                // Flux 2 Pro (fotorrealista)
  "bytedance/seedream-5.0-lite": { route: "images" },   // Seedream (mais barato)
  "spacexai/grok-imagine-image-2.0": { route: "images" }, // Grok Imagine 2 (xAI)
  "spacexai/grok-imagine-image": { route: "images" },     // Grok Imagine (xAI, econômico)
};

export const isAllowedImageModel = (model: unknown): model is string =>
  typeof model === "string" && Object.prototype.hasOwnProperty.call(IMAGE_MODELS, model);
