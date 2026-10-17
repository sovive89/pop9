import { describe, expect, it } from "vitest";
import { findGoogleImageData } from "../../supabase/functions/_shared/google-image-response";

describe("findGoogleImageData", () => {
  it("normalizes the camelCase inlineData response", () => {
    const result = findGoogleImageData({
      candidates: [
        {
          content: {
            parts: [{ text: "descrição" }, { inlineData: { data: "YmluYXJ5", mimeType: "image/webp" } }],
          },
        },
      ],
    });

    expect(result).toEqual({ data: "YmluYXJ5", mimeType: "image/webp" });
  });

  it("normalizes the snake_case inline_data response", () => {
    const result = findGoogleImageData({
      candidates: [{ content: { parts: [{ inline_data: { data: "iVBORw0KGgo=", mime_type: "image/png" } }] } }],
    });

    expect(result).toEqual({ data: "iVBORw0KGgo=", mimeType: "image/png" });
  });

  it("skips malformed parts and returns the first valid image part", () => {
    const result = findGoogleImageData({
      candidates: [
        {
          content: {
            parts: [
              { inlineData: { data: 123, mimeType: "image/png" } },
              { inline_data: { data: "", mime_type: "image/png" } },
              { inline_data: { data: "valid-data", mime_type: "image/png" } },
            ],
          },
        },
      ],
    });

    expect(result).toEqual({ data: "valid-data", mimeType: "image/png" });
  });

  it("rejects responses without a validated candidate image", () => {
    expect(findGoogleImageData(null)).toBeNull();
    expect(findGoogleImageData({ candidates: [{ content: { parts: [{ text: "sem imagem" }] } }] })).toBeNull();
    expect(
      findGoogleImageData({
        candidates: [{ content: { parts: [{ inline_data: { data: "valid", mime_type: 42 } }] } }],
      }),
    ).toBeNull();
  });
});
