// Provedor de geração de imagem via Vercel AI Gateway.
//
// Move para cá, sem mudar comportamento, a lógica que estava dentro da Edge
// Function generate-menu-image: rotas, formato das requisições, timeout e
// mensagens de erro são os mesmos de antes.
import { decodeBase64, fetchImageBytes } from "./imageBytes.ts";
import { IMAGE_MODELS } from "./models.ts";
import type { GeneratedImage, ImageGenerationProvider, ImageGenerationRequest } from "./types.ts";

export const GATEWAY_URL = "https://ai-gateway.vercel.sh/v1";

// Limite para não ficar preso esperando um modelo travado: a função devolve
// erro claro antes de a invocação expirar (e antes de cortar o upload).
export const GENERATION_TIMEOUT_MS = 90_000;

export class VercelGatewayImageProvider implements ImageGenerationProvider {
  readonly id = "vercel-ai-gateway";

  constructor(
    private readonly apiKey: string,
    /** Injetável para testes; em produção é o fetch global. */
    private readonly fetchFn: typeof fetch = (input, init) => fetch(input, init),
  ) {}

  async generateImage({ model, instructions, subject }: ImageGenerationRequest): Promise<GeneratedImage> {
    const headers = { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" };

    if (IMAGE_MODELS[model].route === "chat") {
      const res = await this.fetchFn(`${GATEWAY_URL}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: instructions },
            { role: "user", content: subject },
          ],
          modalities: ["text", "image"],
          stream: false,
        }),
        signal: AbortSignal.timeout(GENERATION_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`IA (${res.status}): ${await res.text()}`);
      const data = await res.json();
      const url: string | undefined = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
      if (!url) throw new Error("O modelo não devolveu imagem");
      return url.startsWith("data:") ? decodeBase64(url) : await fetchImageBytes(url, this.fetchFn);
    }

    const res = await this.fetchFn(`${GATEWAY_URL}/images/generations`, {
      method: "POST",
      headers,
      body: JSON.stringify({ model, prompt: `${subject}\n${instructions}`, n: 1 }),
      signal: AbortSignal.timeout(GENERATION_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`IA (${res.status}): ${await res.text()}`);
    const data = await res.json();
    const img = data?.data?.[0];
    if (img?.b64_json) return decodeBase64(img.b64_json);
    if (img?.url) return await fetchImageBytes(img.url, this.fetchFn);
    throw new Error("O modelo não devolveu imagem");
  }
}
