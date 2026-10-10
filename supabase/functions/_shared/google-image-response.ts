type RecordValue = Record<string, unknown>;

export type GoogleImageData = {
  data: string;
  mimeType?: string;
};

const isRecord = (value: unknown): value is RecordValue =>
  typeof value === "object" && value !== null;

const readImageData = (
  value: unknown,
  mimeKey: "mimeType" | "mime_type",
): GoogleImageData | null => {
  if (!isRecord(value) || typeof value.data !== "string" || value.data.length === 0) {
    return null;
  }

  const mimeType = value[mimeKey];
  if (mimeType !== undefined && typeof mimeType !== "string") {
    return null;
  }

  return {
    data: value.data,
    ...(typeof mimeType === "string" ? { mimeType } : {}),
  };
};

/** Extracts the first validated inline image from a Google generateContent response. */
export const findGoogleImageData = (body: unknown): GoogleImageData | null => {
  if (!isRecord(body) || !Array.isArray(body.candidates)) {
    return null;
  }

  for (const candidate of body.candidates) {
    if (!isRecord(candidate) || !isRecord(candidate.content) || !Array.isArray(candidate.content.parts)) {
      continue;
    }

    for (const part of candidate.content.parts) {
      if (!isRecord(part)) {
        continue;
      }

      const camelCase = readImageData(part.inlineData, "mimeType");
      if (camelCase) {
        return camelCase;
      }

      const snakeCase = readImageData(part.inline_data, "mime_type");
      if (snakeCase) {
        return snakeCase;
      }
    }
  }

  return null;
};
