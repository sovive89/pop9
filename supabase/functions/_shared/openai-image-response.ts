export type OpenAIImageResult = { b64_json: string } | { url: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function parseOpenAIImageResponse(value: unknown): OpenAIImageResult | null {
  if (!isRecord(value) || !Array.isArray(value.data)) return null;
  const image: unknown = value.data[0];
  if (!isRecord(image)) return null;
  if (typeof image.b64_json === 'string' && image.b64_json.trim()) return { b64_json: image.b64_json };
  if (typeof image.url === 'string' && image.url.trim()) return { url: image.url };
  return null;
}
