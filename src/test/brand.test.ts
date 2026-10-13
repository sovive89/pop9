import { describe, expect, it } from "vitest";
import { brandAssetPrefix, brandCssVars, brandWarnings, contrast, hexToHslVar, sanitizeBrand } from "../../supabase/functions/_shared/brand";

const UNIT = "00000000-0000-0000-0000-000000000001";
const prefix = brandAssetPrefix("https://x.supabase.co/", UNIT);

describe("brand", () => {
  it("keeps only valid colors and images from the unit folder", () => {
    const b = sanitizeBrand({
      logo_url: `${prefix}logo-1.png`,
      background_url: "https://evil.example/bg.png",
      primary_color: "#FF0000",
      background_color: "red",
      card_color: "#12345",
      text_color: "#ffffff; background:url(x)",
    }, prefix);
    expect(b).toEqual({ logo_url: `${prefix}logo-1.png`, background_url: null, primary_color: "#ff0000", background_color: null, card_color: null, text_color: null });
  });

  it("rejects other units, path traversal and CSS-breaking characters", () => {
    const other = brandAssetPrefix("https://x.supabase.co", "00000000-0000-0000-0000-000000000002");
    expect(sanitizeBrand({ logo_url: `${other}a.png` }, prefix).logo_url).toBeNull();
    expect(sanitizeBrand({ logo_url: `${prefix}../x/a.png` }, prefix).logo_url).toBeNull();
    expect(sanitizeBrand({ logo_url: `${prefix}a.png")` }, prefix).logo_url).toBeNull();
    expect(sanitizeBrand(null, prefix).logo_url).toBeNull();
  });

  it("converts colors and picks readable button text", () => {
    expect(hexToHslVar("#ff0000")).toBe("0 100% 50%");
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(brandCssVars({ ...sanitizeBrand({}, prefix), primary_color: "#ffff00" })["--primary-foreground"]).toBe("0 0% 0%");
    expect(brandCssVars({ ...sanitizeBrand({}, prefix), primary_color: "#1e3a8a" })["--primary-foreground"]).toBe("0 0% 100%");
  });

  it("warns about low contrast", () => {
    expect(brandWarnings({ ...sanitizeBrand({}, prefix), text_color: "#777777", card_color: "#888888" })).toHaveLength(1);
    expect(brandWarnings({ ...sanitizeBrand({}, prefix), text_color: "#000000", card_color: "#ffffff" })).toHaveLength(0);
  });
});
