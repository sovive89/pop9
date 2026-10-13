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
    expect(b).toMatchObject({ logo_url: `${prefix}logo-1.png`, background_url: null, primary_color: "#ff0000", background_color: null, card_color: null, text_color: null });
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

import { cleanInfo, normalizeSocial } from "../../supabase/functions/_shared/brand";
describe("brand social and info", () => {
  it("normalizes handles and links", () => {
    expect(normalizeSocial("instagram_url", "@confit.burguer")).toBe("https://instagram.com/confit.burguer");
    expect(normalizeSocial("instagram_url", "instagram.com/confit?igsh=x")).toBe("https://instagram.com/confit");
    expect(normalizeSocial("tiktok_url", "@loja")).toBe("https://tiktok.com/@loja");
    expect(normalizeSocial("website_url", "confit.com.br/cardapio")).toBe("https://confit.com.br/cardapio");
    expect(normalizeSocial("instagram_url", "https://evil.com/x")).toBeNull();
    expect(normalizeSocial("website_url", "javascript:alert(1)")).toBeNull();
    expect(normalizeSocial("facebook_url", "")).toBeNull();
  });
  it("keeps only valid social links and plain info text", () => {
    const b = sanitizeBrand({ instagram_url: "https://instagram.com/x", facebook_url: "javascript:x", about_text: "  Oi\u0007\n\n\n\nTchau ", address: "x".repeat(300) }, prefix);
    expect(b.instagram_url).toBe("https://instagram.com/x");
    expect(b.facebook_url).toBeNull();
    expect(b.about_text).toBe("Oi\n\nTchau");
    expect(b.address).toHaveLength(200);
    expect(cleanInfo("opening_hours", "   ")).toBeNull();
  });
});
