// A resposta da IA não é confiável: limita o tamanho e só aceita imagem de verdade.
import type { GeneratedImage } from "./types.ts";

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
export const ALLOWED_MIMES = new Set(["image/png", "image/jpeg", "image/webp"]);

// Limite para o download da imagem já gerada.
export const DOWNLOAD_TIMEOUT_MS = 30_000;

export function assertImage(mime: string, size: number) {
  if (!ALLOWED_MIMES.has(mime)) throw new Error("O modelo devolveu um arquivo que não é imagem");
  if (size > MAX_IMAGE_BYTES) throw new Error("A imagem gerada é grande demais");
}

// Converte base64 (ou data URL) em bytes.
export function decodeBase64(b64: string): GeneratedImage {
  let mime = "image/png";
  const match = b64.match(/^data:(image\/[a-z+]+);base64,(.*)$/);
  if (match) {
    mime = match[1];
    b64 = match[2];
  }
  // 4 caracteres base64 ≈ 3 bytes: confere o tamanho antes de decodificar.
  if (Math.floor((b64.length * 3) / 4) > MAX_IMAGE_BYTES) throw new Error("A imagem gerada é grande demais");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  assertImage(mime, bytes.length);
  return { bytes, mime };
}

// Timeout no download da imagem já gerada (a IA respondeu e cobrou): mensagem
// própria pra não sugerir "gerar de novo" como se a IA tivesse travado.
export class DownloadTimeoutError extends Error {}

export async function fetchImageBytes(
  url: string,
  fetchFn: typeof fetch = fetch,
): Promise<GeneratedImage> {
  // O mesmo sinal vale para o fetch e para a leitura do corpo: um timeout em
  // qualquer um dos dois é do download, não da geração.
  const signal = AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS);
  try {
    const res = await fetchFn(url, { signal });
    if (!res.ok) throw new Error(`Falha ao baixar imagem gerada (${res.status})`);
    const mime = (res.headers.get("content-type") ?? "image/png").split(";")[0].trim().toLowerCase();
    const declared = Number(res.headers.get("content-length") ?? 0);
    assertImage(mime, declared);
    const bytes = new Uint8Array(await res.arrayBuffer());
    assertImage(mime, bytes.length);
    return { bytes, mime };
  } catch (e) {
    if (e instanceof DOMException && e.name === "TimeoutError") {
      throw new DownloadTimeoutError(
        "A imagem foi gerada, mas o download dela demorou demais. Tente gerar novamente em instantes.",
      );
    }
    throw e;
  }
}
